-- Class invitations: authenticated students join themselves; instructors manage only their own invites.
-- Existing roster/session policies and manual enrollment RPCs are unchanged.
begin;
create table if not exists public.class_join_invites (
  class_id uuid primary key references public.classes(id) on delete cascade,
  join_code text not null unique check (join_code ~ '^[A-HJ-NP-Z2-9]{10}$'),
  invite_token text not null unique check (invite_token ~ '^[0-9a-f]{64}$'),
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.class_join_invites enable row level security;
revoke all on public.class_join_invites from anon, authenticated;
grant select on public.class_join_invites to authenticated;
drop policy if exists instructors_read_own_invites on public.class_join_invites;
create policy instructors_read_own_invites on public.class_join_invites for select to authenticated
  using (public.is_instructor_of_class(class_id));

create or replace function public.manage_class_invitation(p_class_id uuid, p_action text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_class public.classes%rowtype;
  v_code text;
  v_bytes bytea;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  select * into v_class from public.classes where id=p_class_id for update;
  if not found or auth.uid() is null or v_class.instructor_id<>auth.uid() or not public.is_instructor() then
    raise exception 'UNAUTHORIZED: class owner required';
  end if;
  if p_action='disable' then
    update public.class_join_invites set enabled=false,updated_at=now() where class_id=p_class_id;
    return;
  end if;
  if v_class.archived_at is not null then raise exception 'CLASS_ARCHIVED: restore class first'; end if;
  if p_action='enable' then
    update public.class_join_invites set enabled=true,updated_at=now() where class_id=p_class_id;
    return;
  end if;
  if p_action not in ('create','reset') or p_action is null then raise exception 'VALIDATION_ERROR: invalid action'; end if;
  if p_action='create' and exists(select 1 from public.class_join_invites where class_id=p_class_id) then return; end if;
  -- Rejection/retry only on a uniqueness collision. The alphabet has exactly 32 characters.
  for attempt in 1..10 loop
    v_bytes:=extensions.gen_random_bytes(10);v_code:='';
    for i in 0..9 loop v_code:=v_code||substr(v_alphabet,1+get_byte(v_bytes,i)%32,1); end loop;
    begin
      insert into public.class_join_invites(class_id,join_code,invite_token,enabled)
        values(p_class_id,v_code,encode(extensions.gen_random_bytes(32),'hex'),true)
      on conflict(class_id) do update set join_code=excluded.join_code,invite_token=excluded.invite_token,enabled=true,updated_at=now();
      return;
    exception when unique_violation then null;
    end;
  end loop;
  raise exception 'INVITE_UNAVAILABLE: try again';
end;
$$;

create or replace function public.student_class_invitation(p_code text default null,p_token text default null,p_join boolean default false)
returns table(status text,class_id uuid,class_name text,class_section text,instructor_name text,academic_year text,semester text,already_enrolled boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_caller uuid:=auth.uid();
  v_allowed boolean;
  v_id uuid;
  v_class public.classes%rowtype;
  v_invite public.class_join_invites%rowtype;
  v_code text:=upper(regexp_replace(coalesce(p_code,''),'[[:space:]-]','','g'));
  v_token text:=coalesce(p_token,'');
  v_teacher text;
  v_enrolled boolean;
begin
  if v_caller is null or not exists(select 1 from public.profiles where id=v_caller and role='student') then
    return query select 'student_only'::text,null::uuid,null::text,null::text,null::text,null::text,null::text,false;return;
  end if;
  select r.allowed into v_allowed from public.check_rate_limit('class-join:'||v_caller::text,30,600) r;
  -- Return errors instead of raising: failed guesses must commit their rate-limit counter.
  if not coalesce(v_allowed,false) then
    return query select 'rate_limited'::text,null::uuid,null::text,null::text,null::text,null::text,null::text,false;return;
  end if;
  if (v_code='' and v_token='') or (v_code<>'' and v_token<>'') or length(v_code)>10 or length(v_token)>64 then
    return query select 'invalid'::text,null::uuid,null::text,null::text,null::text,null::text,null::text,false;return;
  end if;
  select i.class_id into v_id from public.class_join_invites i
    where (v_code<>'' and i.join_code=v_code) or (v_token<>'' and i.invite_token=v_token);
  if v_id is not null then
    -- Same lock order as invite reset and class archive. Revalidate after taking the locks.
    select * into v_class from public.classes where id=v_id for update;
    select * into v_invite from public.class_join_invites where class_join_invites.class_id=v_id for update;
  end if;
  if v_id is null or v_class.archived_at is not null or not coalesce(v_invite.enabled,false)
    or (v_code<>'' and v_invite.join_code<>v_code) or (v_token<>'' and v_invite.invite_token<>v_token) then
    return query select 'invalid'::text,null::uuid,null::text,null::text,null::text,null::text,null::text,false;return;
  end if;
  select full_name into v_teacher from public.profiles where id=v_class.instructor_id;
  v_enrolled:=exists(select 1 from public.class_enrollments ce where ce.class_id=v_id and ce.student_id=v_caller);
  if p_join and not v_enrolled then
    insert into public.class_enrollments(class_id,student_id) values(v_id,v_caller) on conflict do nothing;
  end if;
  return query select case when v_enrolled then 'already_enrolled' when p_join then 'joined' else 'ready' end,
    v_id,v_class.name,v_class.section,v_teacher,v_class.academic_year,v_class.semester,v_enrolled;
end;
$$;
revoke all on function public.manage_class_invitation(uuid,text) from public,anon;
revoke all on function public.student_class_invitation(text,text,boolean) from public,anon;
grant execute on function public.manage_class_invitation(uuid,text) to authenticated;
grant execute on function public.student_class_invitation(text,text,boolean) to authenticated;
commit;
