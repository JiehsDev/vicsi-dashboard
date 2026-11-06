-- Stage 2: academic user management and one-use, manually shareable account setup links.
-- Requires migrations 018, 021 and 022. Does not send emails or grant academic users admin access.
begin;
do $$begin if to_regprocedure('public.student_class_invitation(text,text,boolean)') is null then raise exception 'Apply migration 021 before migration 023';end if;end;$$;
alter table public.profiles add column if not exists suspended_at timestamptz;
alter table public.profiles add column if not exists prior_vr_disabled_at timestamptz;
alter table public.system_audit_events drop constraint if exists system_audit_events_resource_type_check;
alter table public.system_audit_events add constraint system_audit_events_resource_type_check check(resource_type in ('administrator','class','enrollment','invitation','user','staff_invitation','account_recovery'));

create or replace function public.is_account_suspended()
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.profiles where id=auth.uid() and suspended_at is not null);
$$;
revoke all on function public.is_account_suspended() from public,anon;
grant execute on function public.is_account_suspended() to authenticated;
create or replace function public.is_instructor()
returns boolean language sql stable security definer set search_path=public as $$
 select not public.is_account_suspended() and exists(select 1 from public.profiles where id=auth.uid() and role='instructor');
$$;
create or replace function public.is_instructor_of_class(p_class_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select not public.is_account_suspended() and exists(select 1 from public.classes where id=p_class_id and instructor_id=auth.uid());
$$;
-- Restrictive policies protect already-issued browser tokens as well as new sign-ins.
do $$declare t record;begin
 for t in select tablename from pg_tables where schemaname='public' and rowsecurity loop
  execute format('drop policy if exists account_not_suspended on public.%I',t.tablename);
  execute format('create policy account_not_suspended on public.%I as restrictive for all to authenticated using (not public.is_account_suspended()) with check (not public.is_account_suspended())',t.tablename);
 end loop;
end;$$;
do $$begin
 if to_regprocedure('public.student_class_invitation_before_account_controls(text,text,boolean)') is null then
  alter function public.student_class_invitation(text,text,boolean) rename to student_class_invitation_before_account_controls;
 end if;
end;$$;
revoke all on function public.student_class_invitation_before_account_controls(text,text,boolean) from public,anon,authenticated;
create or replace function public.student_class_invitation(p_code text default null,p_token text default null,p_join boolean default false)
returns table(status text,class_id uuid,class_name text,class_section text,instructor_name text,academic_year text,semester text,already_enrolled boolean)
language plpgsql security definer set search_path=public as $$begin
 if public.is_account_suspended() then return query select 'student_only'::text,null::uuid,null::text,null::text,null::text,null::text,null::text,false;return;end if;
 return query select * from public.student_class_invitation_before_account_controls(p_code,p_token,p_join);
end;$$;
revoke all on function public.student_class_invitation(text,text,boolean) from public,anon;
grant execute on function public.student_class_invitation(text,text,boolean) to authenticated;

create or replace function public.keep_suspended_vr_access_disabled()
returns trigger language plpgsql security definer set search_path=public as $$declare v_at timestamptz;begin
 select suspended_at into v_at from public.profiles where id=new.student_id;
 if v_at is not null and new.disabled_at is null then new.disabled_at:=v_at;end if;return new;
end;$$;
revoke all on function public.keep_suspended_vr_access_disabled() from public,anon,authenticated;
drop trigger if exists keep_suspended_vr_access_disabled on public.student_vr_access_codes;
create trigger keep_suspended_vr_access_disabled before insert or update on public.student_vr_access_codes for each row execute function public.keep_suspended_vr_access_disabled();

create or replace function public.admin_user_directory()
returns table(user_id uuid,full_name text,role text,email text,student_id text,section text,suspended_at timestamptz,created_at timestamptz,last_sign_in_at timestamptz)
language sql security definer set search_path=public as $$
 select u.id,coalesce(a.full_name,p.full_name,'Account'),case when a.user_id is not null then 'administrator' else p.role end,
 case when p.role='student' then null else u.email::text end,p.student_id,p.section,case when a.user_id is not null and not a.active then a.updated_at else p.suspended_at end,u.created_at,u.last_sign_in_at
 from auth.users u left join public.profiles p on p.id=u.id left join public.system_administrators a on a.user_id=u.id
 where (p.id is not null or a.user_id is not null) and public.is_system_administrator();
$$;
revoke all on function public.admin_user_directory() from public,anon,authenticated;
create or replace function public.admin_list_users(p_search text default '',p_role text default '',p_status text default '',p_page integer default 1)
returns jsonb language plpgsql security definer set search_path=public as $$declare v_result jsonb;begin
 if not public.is_system_administrator() then raise exception 'UNAUTHORIZED: administrator required';end if;
 if length(coalesce(p_search,''))>100 or p_page not between 1 and 100000 or p_page is null then raise exception 'VALIDATION_ERROR: invalid filters';end if;
 with filtered as (select * from public.admin_user_directory() d where
 (coalesce(p_role,'')='' or d.role=p_role) and (coalesce(p_status,'')='' or (p_status='active' and d.suspended_at is null) or (p_status='suspended' and d.suspended_at is not null))
 and (coalesce(p_search,'')='' or position(lower(p_search) in lower(d.full_name||' '||coalesce(d.email,'')||' '||coalesce(d.student_id,'')))>0)),
 page as (select * from filtered order by lower(full_name),user_id limit 20 offset ((p_page-1)*20))
 select jsonb_build_object('total',(select count(*) from filtered),'users',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb)) into v_result;
 return v_result;
end;$$;
create or replace function public.admin_get_user(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$declare v_result jsonb;begin
 if not public.is_system_administrator() then raise exception 'UNAUTHORIZED: administrator required';end if;
 select to_jsonb(d)||jsonb_build_object('classes',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'section',c.section)) from public.classes c where c.instructor_id=d.user_id or exists(select 1 from public.class_enrollments e where e.class_id=c.id and e.student_id=d.user_id)),'[]'::jsonb)) into v_result from public.admin_user_directory() d where d.user_id=p_user_id;
 return v_result;
end;$$;
create or replace function public.admin_update_user_profile(p_user_id uuid,p_full_name text,p_section text,p_reason text)
returns void language plpgsql security definer set search_path=public as $$declare v_old public.profiles%rowtype;begin
 if not public.is_system_administrator() then raise exception 'UNAUTHORIZED: administrator required';end if;
 if exists(select 1 from public.system_administrators where user_id=p_user_id) then raise exception 'PROTECTED_ACCOUNT: use administrator access settings';end if;
 select * into v_old from public.profiles where id=p_user_id for update;
 if not found then raise exception 'NOT_FOUND: user not found';end if;
 if length(trim(coalesce(p_full_name,''))) not between 1 and 200 or length(trim(coalesce(p_reason,''))) not between 10 and 500
 or (v_old.role='student' and coalesce(p_section,'')!~'^[A-Z]$') then raise exception 'VALIDATION_ERROR: check name, section and reason';end if;
 update public.profiles set full_name=trim(p_full_name),section=case when role='student' then p_section else section end,updated_at=now() where id=p_user_id;
 insert into public.system_audit_events(actor_user_id,actor_name,action,resource_type,resource_id,resource_name,reason,changes)
 select auth.uid(),a.full_name,'user.details.updated','user',p_user_id::text,trim(p_full_name),trim(p_reason),jsonb_build_object('before',jsonb_build_object('name',v_old.full_name,'section',v_old.section),'after',jsonb_build_object('name',trim(p_full_name),'section',case when v_old.role='student' then p_section else v_old.section end)) from public.system_administrators a where a.user_id=auth.uid();
end;$$;
create or replace function public.admin_set_user_suspended(p_user_id uuid,p_suspended boolean,p_reason text)
returns void language plpgsql security definer set search_path=public as $$declare v_old public.profiles%rowtype;v_at timestamptz:=now();v_disabled timestamptz;begin
 if not public.is_system_administrator() then raise exception 'UNAUTHORIZED: administrator required';end if;
 if exists(select 1 from public.system_administrators where user_id=p_user_id) then raise exception 'PROTECTED_ACCOUNT: use administrator access settings';end if;
 if p_suspended is null or length(trim(coalesce(p_reason,''))) not between 10 and 500 then raise exception 'VALIDATION_ERROR: enter a reason';end if;
 select * into v_old from public.profiles where id=p_user_id for update;if not found then raise exception 'NOT_FOUND: user not found';end if;
 if (v_old.suspended_at is not null)=p_suspended then return;end if;
 select disabled_at into v_disabled from public.student_vr_access_codes where student_id=p_user_id for update;
 update public.profiles set suspended_at=case when p_suspended then v_at else null end,prior_vr_disabled_at=case when p_suspended then v_disabled else null end,updated_at=v_at where id=p_user_id;
 if p_suspended then update public.student_vr_access_codes set disabled_at=v_at,updated_at=v_at where student_id=p_user_id;
 else update public.student_vr_access_codes set disabled_at=v_old.prior_vr_disabled_at,updated_at=v_at where student_id=p_user_id and disabled_at=v_old.suspended_at;end if;
 insert into public.system_audit_events(actor_user_id,actor_name,action,resource_type,resource_id,resource_name,reason,changes)
 select auth.uid(),a.full_name,case when p_suspended then 'user.suspended' else 'user.restored' end,'user',p_user_id::text,v_old.full_name,trim(p_reason),jsonb_build_object('before',jsonb_build_object('suspended',v_old.suspended_at is not null),'after',jsonb_build_object('suspended',p_suspended)) from public.system_administrators a where a.user_id=auth.uid();
end;$$;
revoke all on function public.admin_list_users(text,text,text,integer),public.admin_get_user(uuid),public.admin_update_user_profile(uuid,text,text,text),public.admin_set_user_suspended(uuid,boolean,text) from public,anon;
grant execute on function public.admin_list_users(text,text,text,integer),public.admin_get_user(uuid),public.admin_update_user_profile(uuid,text,text,text),public.admin_set_user_suspended(uuid,boolean,text) to authenticated;

create table if not exists public.account_setup_links(
 id uuid primary key default gen_random_uuid(),purpose text not null check(purpose in ('instructor_invitation','password_recovery')),
 email text not null,full_name text not null,target_user_id uuid references auth.users(id) on delete restrict,
 token_hash text not null unique check(token_hash~'^[0-9a-f]{64}$'),token_ciphertext text not null check(length(token_ciphertext) between 40 and 1024),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),expires_at timestamptz not null,
 accepted_at timestamptz,revoked_at timestamptz,claim_id uuid,claimed_at timestamptz,
 check((purpose='instructor_invitation' and target_user_id is null) or (purpose='password_recovery' and target_user_id is not null))
);
create unique index if not exists one_pending_account_setup on public.account_setup_links(purpose,email) where accepted_at is null and revoked_at is null;
alter table public.account_setup_links enable row level security;
revoke all on public.account_setup_links from public,anon,authenticated;
grant select on public.account_setup_links to service_role;

create or replace function public.admin_account_setup(p_operation text,p_id uuid default null,p_email text default null,p_full_name text default null,p_target_user_id uuid default null,p_token_hash text default null,p_ciphertext text default null,p_reason text default null)
returns uuid language plpgsql security definer set search_path=public as $$declare v_row public.account_setup_links%rowtype;v_id uuid;v_email text;v_name text;v_purpose text;begin
 if not public.is_system_administrator() then raise exception 'UNAUTHORIZED: administrator required';end if;
 if p_operation in ('replace','revoke') then
  select * into v_row from public.account_setup_links where id=p_id for update;
  if not found or v_row.accepted_at is not null or v_row.revoked_at is not null then raise exception 'LINK_UNAVAILABLE: link is no longer active';end if;
  if v_row.claimed_at>now()-interval '5 minutes' then raise exception 'SETUP_BUSY: setup is in progress';end if;
  v_id:=v_row.id;v_email:=v_row.email;v_name:=v_row.full_name;v_purpose:=v_row.purpose;
 elsif p_operation='invite' then
  v_email:=lower(trim(coalesce(p_email,'')));v_name:=trim(coalesce(p_full_name,''));v_purpose:='instructor_invitation';
  if v_email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(v_email)>254 or length(v_name) not between 1 and 200 then raise exception 'VALIDATION_ERROR: enter a valid name and email';end if;
  if exists(select 1 from auth.users where lower(email)=v_email) then raise exception 'ACCOUNT_EXISTS: this email already has an account';end if;
 elsif p_operation='recover' then
  if exists(select 1 from public.system_administrators where user_id=p_target_user_id) then raise exception 'PROTECTED_ACCOUNT: administrator recovery is separate';end if;
  select lower(u.email),p.full_name into v_email,v_name from auth.users u join public.profiles p on p.id=u.id where u.id=p_target_user_id;
  if not found then raise exception 'NOT_FOUND: user not found';end if;
  if length(trim(coalesce(p_reason,''))) not between 10 and 500 then raise exception 'VALIDATION_ERROR: recovery requires a reason';end if;v_purpose:='password_recovery';
 else raise exception 'VALIDATION_ERROR: unknown operation';end if;
 if p_operation='revoke' then update public.account_setup_links set revoked_at=now() where id=v_id;
 else
  if coalesce(p_token_hash,'')!~'^[0-9a-f]{64}$' or length(coalesce(p_ciphertext,'')) not between 40 and 1024 then raise exception 'VALIDATION_ERROR: invalid link';end if;
  if p_operation='replace' then update public.account_setup_links set token_hash=p_token_hash,token_ciphertext=p_ciphertext,expires_at=now()+case when purpose='password_recovery' then interval '1 hour' else interval '48 hours' end,claim_id=null,claimed_at=null where id=v_id;
  else
   if exists(select 1 from public.account_setup_links where email=v_email and purpose=v_purpose and accepted_at is null and revoked_at is null) then raise exception 'DUPLICATE_INVITE: replace or revoke the existing link first';end if;
   insert into public.account_setup_links(purpose,email,full_name,target_user_id,token_hash,token_ciphertext,created_by,expires_at)
   values(v_purpose,v_email,v_name,p_target_user_id,p_token_hash,p_ciphertext,auth.uid(),now()+case when v_purpose='password_recovery' then interval '1 hour' else interval '48 hours' end) returning id into v_id;
  end if;
 end if;
 insert into public.system_audit_events(actor_user_id,actor_name,action,resource_type,resource_id,resource_name,reason)
 select auth.uid(),a.full_name,case when v_purpose='password_recovery' then 'account.recovery.' else 'staff.invitation.' end||case when p_operation='revoke' then 'revoked' when p_operation='replace' then 'replaced' else 'created' end,case when v_purpose='password_recovery' then 'account_recovery' else 'staff_invitation' end,v_id::text,v_name,nullif(trim(p_reason),'') from public.system_administrators a where a.user_id=auth.uid();
 return v_id;
end;$$;
revoke all on function public.admin_account_setup(text,uuid,text,text,uuid,text,text,text) from public,anon;
grant execute on function public.admin_account_setup(text,uuid,text,text,uuid,text,text,text) to authenticated;

create or replace function public.claim_account_setup(p_token_hash text,p_claim_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$declare v_row public.account_setup_links%rowtype;begin
 select * into v_row from public.account_setup_links where token_hash=p_token_hash for update;
 if not found or v_row.accepted_at is not null or v_row.revoked_at is not null or v_row.expires_at<=now() then return null;end if;
 if v_row.purpose='password_recovery' and exists(select 1 from public.system_administrators where user_id=v_row.target_user_id) then return null;end if;
 if v_row.claimed_at>now()-interval '5 minutes' then return jsonb_build_object('busy',true);end if;
 update public.account_setup_links set claim_id=p_claim_id,claimed_at=now() where id=v_row.id;
 return jsonb_build_object('id',v_row.id,'purpose',v_row.purpose,'email',v_row.email,'name',v_row.full_name,'target_user_id',v_row.target_user_id);
end;$$;
create or replace function public.finish_account_setup(p_id uuid,p_claim_id uuid,p_user_id uuid,p_release boolean default false)
returns boolean language plpgsql security definer set search_path=public as $$declare v_row public.account_setup_links%rowtype;v_email text;begin
 select * into v_row from public.account_setup_links where id=p_id for update;
 if not found or v_row.claim_id is distinct from p_claim_id or v_row.accepted_at is not null or v_row.revoked_at is not null or v_row.claimed_at<now()-interval '5 minutes' then return false;end if;
 if p_release then update public.account_setup_links set claim_id=null,claimed_at=null where id=p_id;return true;end if;
 if v_row.purpose='password_recovery' and exists(select 1 from public.system_administrators where user_id=v_row.target_user_id) then return false;end if;
 select lower(email) into v_email from auth.users where id=p_user_id;
 if v_email is distinct from v_row.email then return false;end if;
 if v_row.purpose='instructor_invitation' then
  if exists(select 1 from public.profiles where id=p_user_id) or exists(select 1 from public.system_administrators where user_id=p_user_id) then return false;end if;
  insert into public.profiles(id,role,full_name) values(p_user_id,'instructor',v_row.full_name);
 elsif v_row.target_user_id is distinct from p_user_id then return false;end if;
 update public.account_setup_links set accepted_at=now(),claim_id=null,claimed_at=null where id=p_id;
 insert into public.system_audit_events(actor_user_id,actor_name,action,resource_type,resource_id,resource_name)
 values(p_user_id,v_row.full_name,case when v_row.purpose='instructor_invitation' then 'staff.invitation.accepted' else 'account.recovery.completed' end,case when v_row.purpose='instructor_invitation' then 'staff_invitation' else 'account_recovery' end,p_id::text,v_row.full_name);
 return true;
end;$$;
revoke all on function public.claim_account_setup(text,uuid),public.finish_account_setup(uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.claim_account_setup(text,uuid),public.finish_account_setup(uuid,uuid,uuid,boolean) to service_role;
notify pgrst,'reload schema';
commit;
