-- Self-service account details. No identity, enrollment, score or VR-code changes.
-- Requires 012, 022 and 023. Apply as the database owner.
begin;

create or replace function public.get_my_account_profile()
returns table(id uuid,full_name text,role text,student_id text,section text)
language plpgsql stable security definer set search_path=public as $$
begin
 if auth.uid() is null or public.is_account_suspended() then return;end if;
 if exists(select 1 from public.system_administrators a where a.user_id=auth.uid()) then
  return query select a.user_id,a.full_name,'admin'::text,null::text,null::text
    from public.system_administrators a where a.user_id=auth.uid() and a.active;
 else
  return query select p.id,p.full_name,p.role,p.student_id,p.section
    from public.profiles p where p.id=auth.uid() and p.suspended_at is null;
 end if;
end;
$$;
revoke all on function public.get_my_account_profile() from public,anon;
grant execute on function public.get_my_account_profile() to authenticated;

create or replace function public.update_my_account_name(p_full_name text)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_me record;v_name text:=trim(p_full_name);v_allowed boolean;
begin
 select * into v_me from public.get_my_account_profile();
 if v_me.id is null then raise exception 'UNAUTHORIZED: active account required';end if;
 if v_name is null or length(v_name) not between 1 and 200 or v_name ~ '[[:cntrl:]]' then
  raise exception 'VALIDATION_ERROR: name required';end if;
 select allowed into v_allowed from public.check_rate_limit('profile-name:'||auth.uid()::text,5,600);
 if v_allowed is distinct from true then raise exception 'RATE_LIMITED: wait before saving again';end if;
 if v_me.full_name=v_name then return true;end if;
 if v_me.role='admin' then
  update public.system_administrators set full_name=v_name,updated_at=now() where user_id=auth.uid() and active;
 else
  update public.profiles set full_name=v_name,updated_at=now() where id=auth.uid() and suspended_at is null;
 end if;
 if not found then return false;end if;
 insert into public.system_audit_events(actor_user_id,actor_name,action,resource_type,resource_id,resource_name,changes)
 values(auth.uid(),v_name,'account.name.updated','user',auth.uid()::text,v_name,
   jsonb_build_object('before',jsonb_build_object('name',v_me.full_name),'after',jsonb_build_object('name',v_name)));
 return true;
end;
$$;
revoke all on function public.update_my_account_name(text) from public,anon;
grant execute on function public.update_my_account_name(text) to authenticated;

-- Server-only: the server verifies the password and derives this UUID from the
-- current authenticated session. Browsers cannot call this RPC directly.
create or replace function public.change_verified_student_pin(p_user_id uuid,p_pin text)
returns boolean language plpgsql security definer set search_path=public,extensions as $$
declare v_name text;
begin
 if p_pin is null or p_pin !~ '^[0-9]{4}$' or p_pin ~ '^([0-9])\1\1\1$' or p_pin in ('1234','4321','0123','9876') then
  raise exception 'VALIDATION_ERROR: choose a stronger four digit PIN';end if;
 if exists(select 1 from public.system_administrators where user_id=p_user_id) then return false;end if;
 update public.profiles set pin_hash=extensions.crypt(p_pin,extensions.gen_salt('bf',10)),updated_at=now()
   where id=p_user_id and role='student' and suspended_at is null returning full_name into v_name;
 if not found then return false;end if;
 insert into public.system_audit_events(actor_user_id,actor_name,action,resource_type,resource_id,resource_name)
 values(p_user_id,v_name,'account.pin.changed','user',p_user_id::text,v_name);
 return true;
end;
$$;
revoke all on function public.change_verified_student_pin(uuid,text) from public,anon,authenticated;
grant execute on function public.change_verified_student_pin(uuid,text) to service_role;

-- Never accepts arbitrary log content or secret-bearing payloads.
create or replace function public.record_account_security_event(p_user_id uuid,p_event text)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_name text;
begin
 if p_event is null or p_event not in ('password','sessions') then return false;end if;
 select full_name into v_name from public.system_administrators where user_id=p_user_id and active;
 if v_name is null then select full_name into v_name from public.profiles where id=p_user_id and suspended_at is null;end if;
 if v_name is null then return false;end if;
 insert into public.system_audit_events(actor_user_id,actor_name,action,resource_type,resource_id,resource_name)
 values(p_user_id,v_name,case p_event when 'password' then 'account.password.changed' else 'account.sessions.revoked' end,'user',p_user_id::text,v_name);
 return true;
end;
$$;
revoke all on function public.record_account_security_event(uuid,text) from public,anon,authenticated;
grant execute on function public.record_account_security_event(uuid,text) to service_role;

notify pgrst,'reload schema';
commit;
