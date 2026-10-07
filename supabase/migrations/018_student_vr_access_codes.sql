-- 018_student_vr_access_codes.sql
--
-- Permanent, human-friendly VR access codes for students (e.g. K7M4-PQ2D) - a
-- classroom LOOKUP credential the headset uses to say "this is student X". The
-- code is never an identity of its own: every row is keyed by profiles.id (the
-- stable student UUID that assessment_sessions.student_id and every other
-- student-owned table already reference), so regenerating, disabling or
-- re-enabling a code never touches which student owns which session.
--
-- Purely additive: one new table, one trigger on profiles (AFTER INSERT/UPDATE
-- OF role - never modifies a profiles row), seven new functions. No existing
-- table, column, policy or function is changed.
--
-- WHY A SEPARATE TABLE, NOT A COLUMN ON profiles - load-bearing:
--
--   profiles' own RLS lets EVERY instructor read EVERY profile row ("instructors
--   read all profiles", 001), and the dashboard reads it with select("*")
--   (getMyProfile / getProfileById in src/lib/supabaseClient.ts). A code column
--   there would hand every instructor every student's code, including students
--   they don't teach, and hiding one column via column privileges would break
--   those select("*") reads. A separate table with RLS enabled and ZERO
--   policies is unreadable by any client role; every read/write goes through
--   the SECURITY DEFINER functions below, each with its own explicit check.
--
-- WHY THE CODE IS STORED IN PLAINTEXT (unlike pin_hash / code_hash / token_hash):
--
--   Those are secrets nobody ever needs to read back. This code is a permanent
--   classroom credential an instructor hands out and must be able to show again,
--   and the headset needs a lookup form of it for offline identification. It is
--   explicitly NOT a password (BUSINESS_RULES.md 2.5: identification, not
--   authentication). Protection is therefore access control - no client role
--   can select the table - not hashing. The VR directory API sends the headset
--   only a salted, slow derived hash of each code, never the code itself (see
--   src/lib/vrAccessCodes.ts).
--
-- CODE FORMAT: 8 characters from a 31-symbol alphabet with the lookalikes
-- removed (no 0/O, 1/I, L): ABCDEFGHJKMNPQRSTUVWXYZ23456789. Stored canonical:
-- uppercase, no separator (K7M4PQ2D). Displayed grouped 4-4 (K7M4-PQ2D) by the
-- app. Case-insensitive because every lookup normalizes input to that canonical
-- form first. ~39.6 bits; generated here in Postgres from gen_random_bytes with
-- rejection sampling (no modulo bias), never derived from the student id.
--
-- NO EXPIRY: a code stays valid until an instructor regenerates or disables it.
--
-- Run in the Supabase SQL editor AFTER 017. Safe to re-run (IF NOT EXISTS /
-- CREATE OR REPLACE / DROP ... IF EXISTS throughout). NOT APPLIED YET. After
-- applying, run `select public.ensure_student_vr_access_codes();` (service_role,
-- or as the SQL editor's postgres role) once to give every existing student a
-- code - see that function. Manual rollback guidance is at the bottom.

begin;

create extension if not exists pgcrypto with schema extensions;

-- ============================================================================
-- Table
-- ============================================================================

create table if not exists public.student_vr_access_codes (
  student_id    uuid primary key references public.profiles (id) on delete cascade,
  access_code   text not null,
  code_version  integer not null default 1,
  disabled_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.profiles (id) on delete set null,

  constraint student_vr_access_codes_code_format
    check (access_code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$'),
  constraint student_vr_access_codes_version_positive
    check (code_version >= 1)
);

-- Unique across ALL rows, disabled ones included: a disabled code still belongs
-- to its student (it can be re-enabled), so it must never be handed to anyone else.
create unique index if not exists student_vr_access_codes_access_code_key
  on public.student_vr_access_codes (access_code);

comment on table public.student_vr_access_codes is
  'Permanent VR access code per student (lookup credential, not a password). One row per student, keyed by profiles.id. RLS on with no policies: read/write only through the SECURITY DEFINER functions in 018_student_vr_access_codes.sql.';
comment on column public.student_vr_access_codes.access_code is
  'Canonical form: 8 chars, uppercase, no separator, alphabet ABCDEFGHJKMNPQRSTUVWXYZ23456789. Displayed as XXXX-XXXX. Never log it.';
comment on column public.student_vr_access_codes.code_version is
  'Starts at 1, +1 on every regeneration. Lets an offline headset tell its cached code is stale.';
comment on column public.student_vr_access_codes.disabled_at is
  'Null = enabled. Set = code refuses to validate for new VR logins. Never deletes the student or any history.';

-- Only students hold a VR code - same trigger shape as class_enrollments_student_is_student (006).
create or replace function public.student_vr_access_codes_student_is_student()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = new.student_id and role = 'student'
  ) then
    raise exception 'student_vr_access_codes.student_id must reference a profile with role = student';
  end if;
  return new;
end;
$$;

drop trigger if exists student_vr_access_codes_student_is_student_trigger on public.student_vr_access_codes;
create trigger student_vr_access_codes_student_is_student_trigger
  before insert or update of student_id on public.student_vr_access_codes
  for each row execute function public.student_vr_access_codes_student_is_student();

alter table public.student_vr_access_codes enable row level security;
-- No policies on purpose: no client role (anon/authenticated) may read or write
-- this table directly. See the class comment above.

-- ============================================================================
-- Code generation (internal)
-- ============================================================================

-- One random code. Rejection sampling: only bytes < 248 (= 31 * 8) are used, so
-- every symbol is exactly equally likely. Not granted to any client role.
create or replace function public.generate_vr_access_code()
returns text
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text := '';
  v_bytes bytea;
  v_byte integer;
  i integer;
begin
  while length(v_code) < 8 loop
    v_bytes := extensions.gen_random_bytes(16);
    for i in 0 .. 15 loop
      exit when length(v_code) >= 8;
      v_byte := get_byte(v_bytes, i);
      if v_byte < 248 then
        v_code := v_code || substr(v_alphabet, (v_byte % 31) + 1, 1);
      end if;
    end loop;
  end loop;
  return v_code;
end;
$$;

revoke all on function public.generate_vr_access_code() from public, anon, authenticated;

-- Gives one student a code if they have none; returns true if a row was created.
-- Never overwrites an existing code (enabled or disabled). Collision-safe: a
-- unique violation on access_code just draws again (bounded retries).
create or replace function public.ensure_student_vr_access_code(p_student_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_attempt integer := 0;
  v_inserted integer;
begin
  if not exists (select 1 from public.profiles where id = p_student_id and role = 'student') then
    return false;
  end if;

  loop
    v_attempt := v_attempt + 1;
    begin
      insert into public.student_vr_access_codes (student_id, access_code)
      values (p_student_id, public.generate_vr_access_code())
      on conflict (student_id) do nothing;
      get diagnostics v_inserted = row_count;
      return v_inserted > 0;
    exception when unique_violation then
      -- Only access_code can collide here (student_id conflicts are DO NOTHING).
      if v_attempt >= 10 then
        raise exception 'SERVER_ERROR: could not generate a unique VR access code';
      end if;
    end;
  end loop;
end;
$$;

revoke all on function public.ensure_student_vr_access_code(uuid) from public, anon, authenticated;
grant execute on function public.ensure_student_vr_access_code(uuid) to service_role;

-- Backfill: every student profile without a code gets one. Idempotent - a second
-- run creates nothing. Returns how many codes were created by this run.
create or replace function public.ensure_student_vr_access_codes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student uuid;
  v_created integer := 0;
begin
  for v_student in
    select p.id from public.profiles p
    where p.role = 'student'
      and not exists (select 1 from public.student_vr_access_codes c where c.student_id = p.id)
    order by p.created_at, p.id
  loop
    if public.ensure_student_vr_access_code(v_student) then
      v_created := v_created + 1;
    end if;
  end loop;
  return v_created;
end;
$$;

revoke all on function public.ensure_student_vr_access_codes() from public, anon, authenticated;
grant execute on function public.ensure_student_vr_access_codes() to service_role;

-- New students get a code automatically (signup's upsert_profile, seed scripts,
-- a profile later switched to role = student). AFTER trigger: it never alters the
-- profiles row itself, and ensure_student_vr_access_code never overwrites.
create or replace function public.profiles_ensure_vr_access_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'student' then
    perform public.ensure_student_vr_access_code(new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists profiles_ensure_vr_access_code_trigger on public.profiles;
create trigger profiles_ensure_vr_access_code_trigger
  after insert or update of role on public.profiles
  for each row execute function public.profiles_ensure_vr_access_code();

-- ============================================================================
-- Instructor actions (called with the instructor's own session, like 015)
-- ============================================================================

-- True when the caller is an instructor who teaches at least one class the
-- student is enrolled in (archived classes included - an instructor can still
-- manage a former student's code). Same ownership notion as is_instructor_of_class (013).
create or replace function public.is_instructor_of_student(p_student_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.class_enrollments ce
    join public.classes c on c.id = ce.class_id
    where ce.student_id = p_student_id
      and c.instructor_id = auth.uid()
  );
$$;

revoke all on function public.is_instructor_of_student(uuid) from public, anon;
grant execute on function public.is_instructor_of_student(uuid) to authenticated;

-- Issues a brand-new code: the old one stops validating immediately, the student
-- id never changes, code_version +1. A student who had no code yet gets their
-- first one (version 1). Returns the new canonical code - the one place an
-- instructor receives it. Regenerating a disabled code leaves it disabled.
create or replace function public.regenerate_student_vr_access_code(p_student_id uuid)
returns table (student_id uuid, access_code text, code_version integer, enabled boolean, updated_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller uuid := auth.uid();
  v_attempt integer := 0;
begin
  if v_caller is null then
    raise exception 'UNAUTHORIZED: sign in required';
  end if;
  if not public.is_instructor() or not public.is_instructor_of_student(p_student_id) then
    raise exception 'UNAUTHORIZED: only an instructor of this student can change their VR code';
  end if;

  -- A student with no code yet just gets their first one (version 1).
  if not public.ensure_student_vr_access_code(p_student_id) then
    loop
      v_attempt := v_attempt + 1;
      begin
        update public.student_vr_access_codes c
        set access_code  = public.generate_vr_access_code(),
            code_version = c.code_version + 1,
            updated_at   = now(),
            updated_by   = v_caller
        where c.student_id = p_student_id;
        exit;
      exception when unique_violation then
        if v_attempt >= 10 then
          raise exception 'SERVER_ERROR: could not generate a unique VR access code';
        end if;
      end;
    end loop;
  end if;

  return query
    select c.student_id, c.access_code, c.code_version, (c.disabled_at is null), c.updated_at
    from public.student_vr_access_codes c
    where c.student_id = p_student_id;
end;
$$;

revoke all on function public.regenerate_student_vr_access_code(uuid) from public, anon;
grant execute on function public.regenerate_student_vr_access_code(uuid) to authenticated;

-- Disables (p_enabled = false) or re-enables a student's code. Never deletes the
-- student, their enrollment, or any session. Does not change the code or its
-- version (re-enabling restores the same code); updated_at moves either way so a
-- syncing headset sees the change.
create or replace function public.set_student_vr_access_code_enabled(p_student_id uuid, p_enabled boolean)
returns table (student_id uuid, code_version integer, enabled boolean, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'UNAUTHORIZED: sign in required';
  end if;
  if not public.is_instructor() or not public.is_instructor_of_student(p_student_id) then
    raise exception 'UNAUTHORIZED: only an instructor of this student can change their VR code';
  end if;
  if p_enabled is null then
    raise exception 'VALIDATION_ERROR: enabled is required';
  end if;

  perform public.ensure_student_vr_access_code(p_student_id);

  update public.student_vr_access_codes c
  set disabled_at = case when p_enabled then null else coalesce(c.disabled_at, now()) end,
      updated_at  = now(),
      updated_by  = v_caller
  where c.student_id = p_student_id;

  return query
    select c.student_id, c.code_version, (c.disabled_at is null), c.updated_at
    from public.student_vr_access_codes c
    where c.student_id = p_student_id;
end;
$$;

revoke all on function public.set_student_vr_access_code_enabled(uuid, boolean) from public, anon;
grant execute on function public.set_student_vr_access_code_enabled(uuid, boolean) to authenticated;

-- ============================================================================
-- Headset-facing reads (service_role only - called by the VR API routes, which
-- authenticate the device themselves, same trust boundary as 011's RPCs)
-- ============================================================================

-- One row per (student, active class). Students only appear through an enrollment
-- in a non-archived class. Disabled codes are listed (enabled = false) WITHOUT the
-- code, so a headset can drop a cached entry rather than keep accepting it.
-- p_class_id narrows to one class; null = every active class.
create or replace function public.get_vr_student_directory(p_class_id uuid default null)
returns table (
  student_id    uuid,
  display_name  text,
  class_id      uuid,
  class_name    text,
  class_section text,
  access_code   text,
  code_version  integer,
  enabled       boolean,
  updated_at    timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.id,
    p.full_name,
    c.id,
    c.name,
    c.section,
    case when v.disabled_at is null then v.access_code else null end,
    v.code_version,
    (v.disabled_at is null),
    v.updated_at
  from public.student_vr_access_codes v
  join public.profiles p on p.id = v.student_id and p.role = 'student'
  join public.class_enrollments ce on ce.student_id = p.id
  join public.classes c on c.id = ce.class_id and c.archived_at is null
  where p_class_id is null or c.id = p_class_id
  order by c.name, c.id, p.full_name, p.id;
$$;

revoke all on function public.get_vr_student_directory(uuid) from public, anon, authenticated;
grant execute on function public.get_vr_student_directory(uuid) to service_role;

-- Online validation of one code. p_access_code must already be canonical (the API
-- normalizes first). Unknown or disabled -> zero rows (the caller can't tell which).
-- Otherwise one row per active class (class columns null if the student has none).
create or replace function public.validate_vr_access_code(p_access_code text)
returns table (
  student_id    uuid,
  display_name  text,
  code_version  integer,
  class_id      uuid,
  class_name    text,
  class_section text
)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.full_name, v.code_version, ac.id, ac.name, ac.section
  from public.student_vr_access_codes v
  join public.profiles p on p.id = v.student_id and p.role = 'student'
  left join lateral (
    select c.id, c.name, c.section
    from public.class_enrollments ce
    join public.classes c on c.id = ce.class_id and c.archived_at is null
    where ce.student_id = p.id
  ) ac on true
  where v.access_code = p_access_code
    and v.disabled_at is null
  order by ac.name nulls last, ac.id;
$$;

revoke all on function public.validate_vr_access_code(text) from public, anon, authenticated;
grant execute on function public.validate_vr_access_code(text) to service_role;

commit;

-- ============================================================================
-- ROLLBACK GUIDANCE (manual only - nothing below this line runs as part of the
-- migration). Dropping the table destroys every issued code: students would need
-- new codes after re-applying. No other table references it, and no session,
-- enrollment or profile row is touched by dropping it.
--
--   begin;
--   drop trigger if exists profiles_ensure_vr_access_code_trigger on public.profiles;
--   drop function if exists public.profiles_ensure_vr_access_code();
--   drop function if exists public.validate_vr_access_code(text);
--   drop function if exists public.get_vr_student_directory(uuid);
--   drop function if exists public.set_student_vr_access_code_enabled(uuid, boolean);
--   drop function if exists public.regenerate_student_vr_access_code(uuid);
--   drop function if exists public.is_instructor_of_student(uuid);
--   drop function if exists public.ensure_student_vr_access_codes();
--   drop function if exists public.ensure_student_vr_access_code(uuid);
--   drop function if exists public.generate_vr_access_code();
--   drop table if exists public.student_vr_access_codes;  -- drops its own trigger
--   drop function if exists public.student_vr_access_codes_student_is_student();
--   commit;
--
-- Recovery without dropping: a code that leaked is fixed by
-- regenerate_student_vr_access_code (old code stops working at once); a student
-- who must be locked out of headsets is fixed by set_student_vr_access_code_enabled(id, false).
-- ============================================================================
