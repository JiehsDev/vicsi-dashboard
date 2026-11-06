-- Resend transport for existing one-use instructor links. No email is sent by this migration.
begin;
create table if not exists public.invitation_email_deliveries(
 id uuid primary key default gen_random_uuid(),link_id uuid not null references public.account_setup_links(id),
 token_hash text not null,token_ciphertext text not null,recipient text not null,recipient_name text not null,
 sender text not null,app_origin text not null,created_by uuid not null references auth.users(id),
 state text not null default 'sending' check(state in ('sending','unknown','failed','sent','delivered','delayed','bounced','complained','suppressed')),
 error_code text,provider_id text unique,created_at timestamptz not null default now(),attempted_at timestamptz not null default now(),
 event_at timestamptz,updated_at timestamptz not null default now()
);
create index if not exists invitation_email_by_link on public.invitation_email_deliveries(link_id,created_at desc);
create table if not exists public.invitation_email_events(
 event_id text primary key,provider_id text not null,state text not null check(state in ('sent','delivered','delayed','failed','bounced','complained','suppressed')),
 occurred_at timestamptz not null,received_at timestamptz not null default now()
);
create index if not exists invitation_email_events_by_provider on public.invitation_email_events(provider_id,occurred_at desc);
alter table public.invitation_email_deliveries enable row level security;
alter table public.invitation_email_events enable row level security;
revoke all on public.invitation_email_deliveries,public.invitation_email_events from public,anon,authenticated;
grant select on public.invitation_email_deliveries to service_role;

create or replace function public.admin_invitation_email_status(p_ids uuid[])
returns table(link_id uuid,state text,error_code text,updated_at timestamptz)
language plpgsql security definer set search_path=public as $$begin
 if not public.is_system_administrator() then raise exception 'UNAUTHORIZED: administrator required';end if;
 if coalesce(array_length(p_ids,1),0)>20 then raise exception 'VALIDATION_ERROR: too many records';end if;
 return query select l.id,j.state,j.error_code,j.updated_at from public.account_setup_links l cross join lateral
 (select d.state,d.error_code,d.updated_at from public.invitation_email_deliveries d where d.link_id=l.id and d.token_hash=l.token_hash order by d.created_at desc,d.id desc limit 1) j
 where l.id=any(p_ids) and l.purpose='instructor_invitation';
end;$$;
revoke all on function public.admin_invitation_email_status(uuid[]) from public,anon;
grant execute on function public.admin_invitation_email_status(uuid[]) to authenticated;

create or replace function public.invitation_email_state_rank(p_state text)
returns integer language sql immutable set search_path=public as $$select case p_state when 'complained' then 6 when 'bounced' then 5 when 'suppressed' then 5 when 'failed' then 4 when 'delivered' then 3 when 'delayed' then 2 when 'sent' then 1 else 0 end$$;
revoke all on function public.invitation_email_state_rank(text) from public,anon,authenticated;

create or replace function public.admin_begin_invitation_email(p_link_id uuid,p_sender text,p_app_origin text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_link public.account_setup_links%rowtype;v_job public.invitation_email_deliveries%rowtype;v_id uuid;begin
 if not public.is_system_administrator() then raise exception 'UNAUTHORIZED: administrator required';end if;
 select * into v_link from public.account_setup_links where id=p_link_id for update;
 if not found or v_link.purpose<>'instructor_invitation' or v_link.revoked_at is not null or v_link.accepted_at is not null or v_link.expires_at<=now() then raise exception 'LINK_UNAVAILABLE: invitation is no longer active';end if;
 if length(coalesce(p_sender,'')) not between 5 and 320 or p_sender~'[\r\n]' or p_app_origin!~'^https://[^/?#[:space:]]+$' or length(p_app_origin)>300 then raise exception 'VALIDATION_ERROR: configure a public HTTPS origin and sender';end if;
 select * into v_job from public.invitation_email_deliveries where link_id=p_link_id and token_hash=v_link.token_hash order by created_at desc,id desc limit 1 for update;
 if found then
  if v_job.attempted_at>now()-interval '1 minute' then return jsonb_build_object('busy',true);end if;
  if v_job.state in ('sending','unknown') then
   -- Resend retains idempotency keys for 24 hours. Never retry an ambiguous send beyond that window.
   if v_job.created_at<=now()-interval '23 hours' then raise exception 'STATUS_UNKNOWN: replace this link before sending another email';end if;
   update public.invitation_email_deliveries set attempted_at=now(),updated_at=now(),state='sending' where id=v_job.id;
   return jsonb_build_object('id',v_job.id,'retry',true);
  end if;
 end if;
 -- Persistent per-operator budget, checked under the link lock as well as the shared limiter's own lock.
 if not coalesce((select allowed from public.check_rate_limit('staff-email:'||auth.uid()::text,10,600)),false) then raise exception 'RATE_LIMITED: wait before sending more invitations';end if;
 insert into public.invitation_email_deliveries(link_id,token_hash,token_ciphertext,recipient,recipient_name,sender,app_origin,created_by)
 values(p_link_id,v_link.token_hash,v_link.token_ciphertext,v_link.email,v_link.full_name,p_sender,p_app_origin,auth.uid()) returning id into v_id;
 insert into public.system_audit_events(actor_user_id,actor_name,action,resource_type,resource_id,resource_name)
 select auth.uid(),a.full_name,'staff.email.requested','staff_invitation',p_link_id::text,v_link.full_name from public.system_administrators a where user_id=auth.uid();
 return jsonb_build_object('id',v_id,'retry',false);
end;$$;
revoke all on function public.admin_begin_invitation_email(uuid,text,text) from public,anon;
grant execute on function public.admin_begin_invitation_email(uuid,text,text) to authenticated;

create or replace function public.finish_invitation_email(p_id uuid,p_state text,p_provider_id text default null,p_error_code text default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_job public.invitation_email_deliveries%rowtype;v_event public.invitation_email_events%rowtype;begin
 if p_state not in ('sent','failed','unknown') or (p_state='sent' and coalesce(p_provider_id,'')!~'^[0-9a-f-]{36}$') then raise exception 'VALIDATION_ERROR: invalid transport result';end if;
 -- Shared lock handles provider callbacks arriving before the send response is saved.
 perform pg_advisory_xact_lock(hashtextextended('email-events',0));
 select * into v_job from public.invitation_email_deliveries where id=p_id for update;if not found then return false;end if;
 if v_job.state not in ('sending','unknown') then return true;end if;
 if p_state='sent' then
  select * into v_event from public.invitation_email_events where provider_id=p_provider_id order by public.invitation_email_state_rank(state) desc,occurred_at desc limit 1;
 end if;
 update public.invitation_email_deliveries set state=coalesce(v_event.state,p_state),provider_id=coalesce(p_provider_id,provider_id),error_code=case when p_error_code in ('configuration','restricted_sender','invalid_recipient','rate_limit','provider_rejected','network','stale_link','unconfirmed') then p_error_code else null end,event_at=v_event.occurred_at,updated_at=now() where id=p_id;
 insert into public.system_audit_events(actor_user_id,actor_name,action,resource_type,resource_id,resource_name)
 select v_job.created_by,a.full_name,case p_state when 'sent' then 'staff.email.sent' when 'failed' then 'staff.email.failed' else 'staff.email.unconfirmed' end,'staff_invitation',v_job.link_id::text,v_job.recipient_name from public.system_administrators a where user_id=v_job.created_by;
 return true;
end;$$;
revoke all on function public.finish_invitation_email(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.finish_invitation_email(uuid,text,text,text) to service_role;

create or replace function public.record_invitation_email_event(p_event_id text,p_provider_id text,p_state text,p_occurred_at timestamptz)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_job public.invitation_email_deliveries%rowtype;begin
 if length(coalesce(p_event_id,'')) not between 1 and 200 or coalesce(p_provider_id,'')!~'^[0-9a-f-]{36}$' or p_state not in ('sent','delivered','delayed','failed','bounced','complained','suppressed') or p_occurred_at is null then raise exception 'VALIDATION_ERROR: invalid provider event';end if;
 perform pg_advisory_xact_lock(hashtextextended('email-events',0));
 insert into public.invitation_email_events(event_id,provider_id,state,occurred_at) values(p_event_id,p_provider_id,p_state,p_occurred_at) on conflict(event_id) do nothing;
 if not found then return true;end if;
 select * into v_job from public.invitation_email_deliveries where provider_id=p_provider_id for update;
 if found and public.invitation_email_state_rank(p_state)>public.invitation_email_state_rank(v_job.state) then
  update public.invitation_email_deliveries set state=p_state,event_at=p_occurred_at,updated_at=now() where id=v_job.id;
  insert into public.system_audit_events(actor_name,action,resource_type,resource_id,resource_name)
  values('Resend','staff.email.'||p_state,'staff_invitation',v_job.link_id::text,v_job.recipient_name);
 end if;
 return true;
end;$$;
revoke all on function public.record_invitation_email_event(text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.record_invitation_email_event(text,text,text,timestamptz) to service_role;
notify pgrst,'reload schema';
commit;
