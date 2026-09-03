-- 001_profiles.sql
-- Application-level identity for TRACEBOARD.
--
-- Supabase's `auth.users` holds credentials (email + password) but has no
-- concept of "instructor vs student", Student IDs, or the VR game PIN.
-- This table adds that, keyed 1:1 to the auth user.
--
-- Run this in the Supabase SQL editor (or via the CLI) BEFORE running
-- `npm run seed:accounts`.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        text not null check (role in ('instructor', 'student')),
  full_name   text not null,
  student_id  text unique,           -- students only; null for instructors
  section     text,                  -- e.g. 'A' / 'B'
  pin_hash    text,                  -- bcrypt hash of the 4-digit VR PIN
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- A student must be identifiable by Student ID.
  constraint student_requires_student_id
    check (role <> 'student' or student_id is not null),

  -- Instructors never hold a game PIN — they don't log into the headset.
  constraint instructor_has_no_pin
    check (role <> 'instructor' or pin_hash is null)
);

comment on table public.profiles is
  'App-level identity: role, Student ID, section, and hashed VR game PIN.';
comment on column public.profiles.pin_hash is
  'bcrypt hash of the 4-digit VR PIN. NEVER store the PIN in plaintext.';

-- ---------------------------------------------------------------------------
-- Role helper
--
-- SECURITY DEFINER is load-bearing: it runs with the definer's rights and so
-- bypasses RLS *inside* the function. Without it, an RLS policy on `profiles`
-- that itself selects from `profiles` recurses infinitely.
-- ---------------------------------------------------------------------------

create or replace function public.is_instructor()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'instructor'
  );
$$;

revoke all on function public.is_instructor() from public, anon;
grant execute on function public.is_instructor() to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Students see only themselves. Instructors see the whole roster.
-- Nobody may change their own role or PIN through the API — those are
-- service-role / RPC operations only (see upsert_profile below).
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

drop policy if exists "instructors read all profiles" on public.profiles;
create policy "instructors read all profiles"
  on public.profiles for select
  to authenticated
  using (public.is_instructor());

-- Deliberately NO insert/update/delete policies for `authenticated`:
-- a student must not be able to promote themselves to instructor, change
-- their Student ID, or overwrite their own PIN hash via PostgREST.

-- ---------------------------------------------------------------------------
-- Seed / admin RPC
--
-- Takes the PIN in plaintext and hashes it here, so the plaintext never
-- lands in a column, a log, or a migration file. Restricted to service_role.
-- ---------------------------------------------------------------------------

create or replace function public.upsert_profile(
  p_id         uuid,
  p_role       text,
  p_full_name  text,
  p_student_id text default null,
  p_section    text default null,
  p_pin        text default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_pin is not null and p_pin !~ '^\d{4}$' then
    raise exception 'PIN must be exactly 4 digits';
  end if;

  insert into public.profiles (id, role, full_name, student_id, section, pin_hash)
  values (
    p_id,
    p_role,
    p_full_name,
    p_student_id,
    p_section,
    case when p_pin is null then null
         else extensions.crypt(p_pin, extensions.gen_salt('bf')) end
  )
  on conflict (id) do update set
    role       = excluded.role,
    full_name  = excluded.full_name,
    student_id = excluded.student_id,
    section    = excluded.section,
    -- Unqualified `profiles.` is the required form for referencing the
    -- pre-existing row here; schema-qualifying it does not parse.
    -- Keeps the current PIN when the caller passes p_pin => null.
    pin_hash   = coalesce(excluded.pin_hash, profiles.pin_hash),
    updated_at = now();
end;
$$;

revoke all on function public.upsert_profile(uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.upsert_profile(uuid, text, text, text, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- NOT INCLUDED ON PURPOSE: a `verify_student_pin()` RPC.
--
-- A 4-digit PIN is 10,000 combinations. An unauthenticated verify endpoint
-- with no attempt limiting is brute-forceable in seconds, so it must ship
-- TOGETHER WITH server-side rate limiting / lockout — not before it.
-- See BUSINESS_RULES.md §2.3.
-- ---------------------------------------------------------------------------
