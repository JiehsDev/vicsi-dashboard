-- Administrator membership is separate from academic identity. No automatic promotions.
-- Run after 021. Existing student/instructor/session SELECT policies are unchanged.
begin;
create table if not exists public.system_administrators (
  user_id uuid primary key references auth.users(id) on delete restrict,
  full_name text not null check(length(trim(full_name)) between 1 and 200),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.system_audit_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_user_id uuid,
  actor_name text not null,
  action text not null,
  resource_type text not null check(resource_type in ('administrator','class','enrollment','invitation')),
  resource_id text not null,
  resource_name text not null,
  reason text,
  changes jsonb not null default '{}'::jsonb check(jsonb_typeof(changes)='object')
);
create index if not exists system_audit_events_time_idx on public.system_audit_events(occurred_at desc,id desc);
create index if not exists system_audit_events_type_time_idx on public.system_audit_events(resource_type,occurred_at desc);
alter table public.system_administrators enable row level security;
alter table public.system_audit_events enable row level security;
revoke all on public.system_administrators,public.system_audit_events from anon,authenticated;
grant select,insert,update,delete on public.system_administrators to service_role;
grant select on public.system_audit_events to service_role;

create or replace function public.is_system_administrator()
returns boolean language sql stable security definer set search_path = public as $$
 select exists(select 1 from public.system_administrators where user_id=auth.uid() and active);
$$;
revoke all on function public.is_system_administrator() from public,anon;
grant execute on function public.is_system_administrator() to authenticated;

create or replace function public.get_system_admin_identity()
returns table(user_id uuid,full_name text)
language sql stable security definer set search_path = public as $$
 select a.user_id,a.full_name from public.system_administrators a where a.user_id=auth.uid() and a.active;
$$;
revoke all on function public.get_system_admin_identity() from public,anon;
grant execute on function public.get_system_admin_identity() to authenticated;

grant select on public.system_administrators,public.system_audit_events to authenticated;
drop policy if exists administrators_read_access on public.system_administrators;
create policy administrators_read_access on public.system_administrators for select to authenticated using(public.is_system_administrator());
drop policy if exists administrators_read_audit on public.system_audit_events;
create policy administrators_read_audit on public.system_audit_events for select to authenticated using(public.is_system_administrator());

create or replace function public.protect_last_system_administrator()
returns trigger language plpgsql security definer set search_path = public as $$
begin
 perform pg_advisory_xact_lock(846273901);
 if old.active and (tg_op='DELETE' or not new.active) and not exists(
   select 1 from public.system_administrators where active and user_id<>old.user_id
 ) then raise exception 'LAST_ADMIN: the last active administrator must remain enabled'; end if;
 if tg_op='DELETE' then return old; end if;
 new.updated_at:=now();return new;
end;
$$;
revoke all on function public.protect_last_system_administrator() from public,anon,authenticated;
drop trigger if exists protect_last_system_administrator on public.system_administrators;
create trigger protect_last_system_administrator before update or delete on public.system_administrators for each row execute function public.protect_last_system_administrator();

-- Record only named, allowlisted fields. Never serialize whole rows or auth/invite credentials.
create or replace function public.record_system_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
 v_actor uuid:=auth.uid();v_actor_name text;v_action text;v_type text;v_id text;v_name text;
 v_before jsonb:='{}'::jsonb;v_after jsonb:='{}'::jsonb;v_reason text;
 v_class uuid;v_student uuid;
begin
 select full_name into v_actor_name from public.system_administrators where user_id=v_actor;
 if v_actor_name is null then select full_name into v_actor_name from public.profiles where id=v_actor; end if;
 v_actor_name:=coalesce(v_actor_name,'System setup');
 if tg_table_name='system_administrators' then
   v_type:='administrator';v_id:=coalesce(new.user_id,old.user_id)::text;v_name:=coalesce(new.full_name,old.full_name);
   if tg_op<>'INSERT' then v_before:=jsonb_build_object('name',old.full_name,'active',old.active); end if;
   if tg_op<>'DELETE' then v_after:=jsonb_build_object('name',new.full_name,'active',new.active); end if;
   if tg_op='INSERT' then v_action:='admin.access.granted';
   elsif tg_op='DELETE' then v_action:='admin.access.removed';
   elsif new.active is distinct from old.active then v_action:=case when new.active then 'admin.access.enabled' else 'admin.access.disabled' end;
   else v_action:='admin.details.updated';end if;
   v_reason:=nullif(current_setting('vicsi.admin_change_reason',true),'');
 elsif tg_table_name='classes' then
   v_type:='class';v_id:=coalesce(new.id,old.id)::text;v_name:=coalesce(new.name,old.name);
   if tg_op<>'INSERT' then v_before:=jsonb_build_object('name',old.name,'section',old.section,'academic_year',old.academic_year,'semester',old.semester,'archived',old.archived_at is not null); end if;
   if tg_op<>'DELETE' then v_after:=jsonb_build_object('name',new.name,'section',new.section,'academic_year',new.academic_year,'semester',new.semester,'archived',new.archived_at is not null); end if;
   if tg_op='INSERT' then v_action:='class.created';elsif tg_op='DELETE' then v_action:='class.removed';
   elsif new.archived_at is distinct from old.archived_at then v_action:=case when new.archived_at is null then 'class.restored' else 'class.archived' end;
   else v_action:='class.updated';end if;
 elsif tg_table_name='class_enrollments' then
   v_type:='enrollment';v_class:=coalesce(new.class_id,old.class_id);v_student:=coalesce(new.student_id,old.student_id);
   v_id:=v_class::text||'/'||v_student::text;
   select coalesce(p.full_name,'Student')||' / '||coalesce(c.name,'Class') into v_name from public.profiles p cross join public.classes c where p.id=v_student and c.id=v_class;
   v_name:=coalesce(v_name,'Class enrollment');v_action:=case when tg_op='INSERT' then 'class.enrolled' else 'class.unenrolled' end;
 elsif tg_table_name='class_join_invites' then
   v_type:='invitation';v_class:=coalesce(new.class_id,old.class_id);v_id:=v_class::text;
   select name into v_name from public.classes where id=v_class;v_name:=coalesce(v_name,'Class invitation');
   if tg_op='INSERT' then v_action:='class.invitation.created';elsif tg_op='DELETE' then v_action:='class.invitation.removed';
   elsif new.invite_token is distinct from old.invite_token then v_action:='class.invitation.replaced';
   else v_action:=case when new.enabled then 'class.invitation.enabled' else 'class.invitation.disabled' end;end if;
   if tg_op<>'INSERT' then v_before:=jsonb_build_object('enabled',old.enabled);end if;
   if tg_op<>'DELETE' then v_after:=jsonb_build_object('enabled',new.enabled);end if;
 end if;
 if v_action is null or (tg_op='UPDATE' and v_before=v_after and v_action not in ('class.invitation.replaced')) then return new;end if;
 insert into public.system_audit_events(actor_user_id,actor_name,action,resource_type,resource_id,resource_name,reason,changes)
 values(v_actor,v_actor_name,v_action,v_type,v_id,v_name,v_reason,jsonb_build_object('before',v_before,'after',v_after));
 if tg_op='DELETE' then return old;end if;return new;
end;
$$;
revoke all on function public.record_system_change() from public,anon,authenticated;
drop trigger if exists audit_system_administrators on public.system_administrators;
create trigger audit_system_administrators after insert or update or delete on public.system_administrators for each row execute function public.record_system_change();
drop trigger if exists audit_system_classes on public.classes;
create trigger audit_system_classes after insert or update or delete on public.classes for each row execute function public.record_system_change();
drop trigger if exists audit_system_enrollments on public.class_enrollments;
create trigger audit_system_enrollments after insert or delete on public.class_enrollments for each row execute function public.record_system_change();
do $$begin
 if to_regclass('public.class_join_invites') is not null then
  execute 'drop trigger if exists audit_system_invites on public.class_join_invites';
  execute 'create trigger audit_system_invites after insert or update or delete on public.class_join_invites for each row execute function public.record_system_change()';
 end if;
end;$$;

create or replace function public.set_system_admin_access(p_user_id uuid,p_active boolean,p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
 perform pg_advisory_xact_lock(846273901);
 if not public.is_system_administrator() then raise exception 'UNAUTHORIZED: administrator access required';end if;
 if p_active is null or length(trim(coalesce(p_reason,''))) not between 10 and 500 then raise exception 'VALIDATION_ERROR: enter a reason between 10 and 500 characters';end if;
 if not exists(select 1 from public.system_administrators where user_id=p_user_id) then raise exception 'NOT_FOUND: administrator not found';end if;
 perform set_config('vicsi.admin_change_reason',trim(p_reason),true);
 update public.system_administrators set active=p_active where user_id=p_user_id;
end;
$$;
revoke all on function public.set_system_admin_access(uuid,boolean,text) from public,anon;
grant execute on function public.set_system_admin_access(uuid,boolean,text) to authenticated;
notify pgrst,'reload schema';
commit;
