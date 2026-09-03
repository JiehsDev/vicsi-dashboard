-- 003_require_student_section.sql
--
-- Every student belongs to a section (e.g. 'A', 'B'). Previously `section`
-- was a free, optional text column — this makes it a required, validated
-- field for students, enforced at the DB layer (not just the signup form)
-- so no insert path can create a sectionless student.
--
-- Run this in the Supabase SQL editor (or via the CLI) AFTER
-- 001_profiles.sql. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Table constraints
-- ---------------------------------------------------------------------------

alter table public.profiles
  drop constraint if exists student_requires_section;
alter table public.profiles
  add constraint student_requires_section
    check (role <> 'student' or section is not null);

-- A single uppercase letter (A, B, C, ...). Instructors keep section = null.
alter table public.profiles
  drop constraint if exists section_is_single_uppercase_letter;
alter table public.profiles
  add constraint section_is_single_uppercase_letter
    check (section is null or section ~ '^[A-Z]$');

-- ---------------------------------------------------------------------------
-- upsert_profile — validate the section the same way the constraints do,
-- so callers get a readable error instead of a raw constraint-violation
-- message, and normalize case (the signup form sends an exact-case value
-- from a fixed dropdown, but this keeps the RPC safe for any caller).
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
declare
  v_section text := nullif(upper(trim(p_section)), '');
begin
  if p_pin is not null and p_pin !~ '^\d{4}$' then
    raise exception 'PIN must be exactly 4 digits';
  end if;

  if p_role = 'student' and v_section is null then
    raise exception 'Section is required for students';
  end if;

  if v_section is not null and v_section !~ '^[A-Z]$' then
    raise exception 'Section must be a single letter, e.g. A';
  end if;

  insert into public.profiles (id, role, full_name, student_id, section, pin_hash)
  values (
    p_id,
    p_role,
    p_full_name,
    p_student_id,
    v_section,
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
