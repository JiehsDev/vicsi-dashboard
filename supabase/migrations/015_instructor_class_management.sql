-- 015_instructor_class_management.sql
--
-- Instructor-driven class create/edit/archive and student enrollment. Purely
-- additive: one new nullable column, five new SECURITY DEFINER functions, zero
-- changes to any existing table, column, policy, or function.
--
-- SECURITY MODEL, load-bearing - read before touching this file:
--
--   Every RPC below is granted to `authenticated` (NOT service_role, unlike
--   011_assessment_rpcs.sql's pattern) and re-derives the caller's own
--   identity from auth.uid() itself, then checks it against public.is_instructor()
--   and/or public.is_instructor_of_class() (both already exist - see
--   001_profiles.sql and 013_fix_classes_rls_recursion.sql). This is
--   deliberately the OPPOSITE trust boundary from 011's functions: those are
--   service_role-only because their identity parameters (p_student_id, etc.)
--   are trusted values Node already resolved from an authenticated session or
--   a bearer token; these functions are instead called DIRECTLY by the
--   dashboard's own authenticated browser session, so they must (and do)
--   verify the caller's own identity and ownership themselves, every time,
--   inside the function body - never trusting a class/student id parameter
--   alone to imply the caller is allowed to act on it.
--
--   No new INSERT/UPDATE/DELETE RLS policy is added anywhere in this file on
--   purpose (see this project's own standing preference: "Use protected
--   SECURITY DEFINER RPCs instead of broad browser-side table write
--   policies"). classes/class_enrollments remain exactly as narrow as
--   006/013 left them for direct table access; every write must go through
--   one of the five functions below, each with its own explicit ownership
--   check, rather than through a general-purpose policy a future change
--   could accidentally widen.
--
--   Archiving, never deleting: archive_instructor_class only ever sets/clears
--   classes.archived_at. Nothing in this migration drops a class row, and
--   class_enrollments rows removed by remove_student_from_class are deleted
--   individually (never a class's whole roster) - assessment_sessions and
--   every one of its child tables reference student_id/class_id directly
--   (see 009_assessment_sessions.sql), NOT through class_enrollments, so
--   removing an enrollment row can never cascade into deleting a session, a
--   score, or any other assessment history. That history stays exactly as
--   readable (same RLS, same rows) as before the enrollment was removed.
--
--   archived_at timestamptz, not an is_active boolean - matches this
--   project's own existing idiom for "when did this state change happen"
--   (assessment_pairing_codes.consumed_at/revoked_at, assessment_tokens.
--   revoked_at, assessment_sessions.verified_at_utc all follow this same
--   nullable-timestamp shape rather than a boolean flag). Restoring a class
--   is just nulling this column back out - no separate "restored_at" or
--   history table needed for that alone.
--
-- Run in the Supabase SQL editor AFTER 014. Safe to re-run (CREATE OR REPLACE
-- / ADD COLUMN IF NOT EXISTS throughout). NOT APPLIED YET - stop for review
-- before running this against any Supabase project, per this stage's own
-- instructions. See the bottom of this file for manual rollback guidance
-- (not executed automatically).

begin;

-- ============================================================================
-- Schema: one additive column
-- ============================================================================

alter table public.classes
  add column if not exists archived_at timestamptz;

comment on column public.classes.archived_at is
  'Set when an instructor archives this class (see archive_instructor_class). Null = active. Archived classes stay fully readable (existing SELECT policies are unchanged) but reject new enrollment (see enroll_student_in_class) - archiving never deletes the class, its roster, or any assessment history.';

-- ============================================================================
-- create_instructor_class
-- ============================================================================
create or replace function public.create_instructor_class(
  p_name    text,
  p_section text default null
)
returns table (
  id            uuid,
  name          text,
  section       text,
  instructor_id uuid,
  archived_at   timestamptz,
  created_at    timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_name text := nullif(trim(p_name), '');
  v_section text := nullif(trim(p_section), '');
  v_new_id uuid;
begin
  if v_caller is null then
    raise exception 'UNAUTHORIZED: sign in required';
  end if;
  if not public.is_instructor() then
    raise exception 'UNAUTHORIZED: only instructors can create a class';
  end if;

  if v_name is null or length(v_name) > 200 then
    raise exception 'VALIDATION_ERROR: name is required and must be at most 200 characters';
  end if;
  if v_section is not null and length(v_section) > 50 then
    raise exception 'VALIDATION_ERROR: section must be at most 50 characters';
  end if;

  insert into public.classes (name, section, instructor_id)
  values (v_name, v_section, v_caller)
  returning classes.id into v_new_id;

  return query
    select classes.id, classes.name, classes.section, classes.instructor_id, classes.archived_at, classes.created_at
    from public.classes
    where classes.id = v_new_id;
end;
$$;

revoke all on function public.create_instructor_class(text, text) from public, anon;
grant execute on function public.create_instructor_class(text, text) to authenticated;

-- ============================================================================
-- update_instructor_class
--
-- Deliberately editable while archived (fixing a typo before restoring
-- shouldn't require restoring first) - only NEW ENROLLMENT is blocked by
-- archive state, not editing the class's own name/section.
-- ============================================================================
create or replace function public.update_instructor_class(
  p_class_id uuid,
  p_name     text,
  p_section  text default null
)
returns table (
  id            uuid,
  name          text,
  section       text,
  instructor_id uuid,
  archived_at   timestamptz,
  updated_at    timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := nullif(trim(p_name), '');
  v_section text := nullif(trim(p_section), '');
begin
  if auth.uid() is null then
    raise exception 'UNAUTHORIZED: sign in required';
  end if;
  if not public.is_instructor() then
    raise exception 'UNAUTHORIZED: only instructors can edit a class';
  end if;
  if p_class_id is null or not public.is_instructor_of_class(p_class_id) then
    raise exception 'NOT_FOUND: no class % owned by the signed-in instructor', p_class_id;
  end if;

  if v_name is null or length(v_name) > 200 then
    raise exception 'VALIDATION_ERROR: name is required and must be at most 200 characters';
  end if;
  if v_section is not null and length(v_section) > 50 then
    raise exception 'VALIDATION_ERROR: section must be at most 50 characters';
  end if;

  update public.classes
  set name = v_name, section = v_section, updated_at = now()
  where classes.id = p_class_id;

  return query
    select classes.id, classes.name, classes.section, classes.instructor_id, classes.archived_at, classes.updated_at
    from public.classes
    where classes.id = p_class_id;
end;
$$;

revoke all on function public.update_instructor_class(uuid, text, text) from public, anon;
grant execute on function public.update_instructor_class(uuid, text, text) to authenticated;

-- ============================================================================
-- archive_instructor_class
--
-- One function, both directions (p_archive true = archive, false = restore) -
-- the RPC list this stage asked for names exactly one archive function, not a
-- separate restore one, and a single idempotent toggle is simpler to reason
-- about than two near-duplicate functions. Unconditional (not "only if not
-- already archived") on purpose: re-archiving an already-archived class, or
-- restoring an already-active one, is a harmless no-op, not an error a UI
-- double-click should ever have to handle specially.
-- ============================================================================
create or replace function public.archive_instructor_class(
  p_class_id uuid,
  p_archive  boolean default true
)
returns table (
  id          uuid,
  archived_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'UNAUTHORIZED: sign in required';
  end if;
  if not public.is_instructor() then
    raise exception 'UNAUTHORIZED: only instructors can archive or restore a class';
  end if;
  if p_class_id is null or not public.is_instructor_of_class(p_class_id) then
    raise exception 'NOT_FOUND: no class % owned by the signed-in instructor', p_class_id;
  end if;

  update public.classes
  set archived_at = case when p_archive then now() else null end,
      updated_at = now()
  where classes.id = p_class_id;

  return query
    select classes.id, classes.archived_at
    from public.classes
    where classes.id = p_class_id;
end;
$$;

revoke all on function public.archive_instructor_class(uuid, boolean) from public, anon;
grant execute on function public.archive_instructor_class(uuid, boolean) to authenticated;

-- ============================================================================
-- enroll_student_in_class
--
-- Looks the student up by their existing, unique, already-canonical
-- student_id CODE (profiles.student_id, e.g. "2099-00001") - never by name or
-- email (profiles has no email column at all; auth.users.email is not
-- reachable through the RLS-scoped client this function's caller uses, and
-- exposing a free-text/fuzzy student search here would be exactly the
-- "global student search too broad" case this stage's own instructions warn
-- against). An instructor must know the exact student number to enroll them -
-- the same identifier already printed on every roster/results page in this
-- dashboard.
-- ============================================================================
create or replace function public.enroll_student_in_class(
  p_class_id       uuid,
  p_student_number text
)
returns table (
  class_id            uuid,
  student_id          uuid,
  student_display_name text,
  student_number      text,
  enrolled_at         timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_number text := nullif(trim(p_student_number), '');
  v_student record;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHORIZED: sign in required';
  end if;
  if not public.is_instructor() then
    raise exception 'UNAUTHORIZED: only instructors can enroll a student';
  end if;
  if p_class_id is null or not public.is_instructor_of_class(p_class_id) then
    raise exception 'NOT_FOUND: no class % owned by the signed-in instructor', p_class_id;
  end if;
  if v_student_number is null or length(v_student_number) > 100 then
    raise exception 'VALIDATION_ERROR: a student number is required';
  end if;

  if exists (select 1 from public.classes where classes.id = p_class_id and archived_at is not null) then
    raise exception 'CLASS_ARCHIVED: class % is archived and cannot receive new enrollments', p_class_id;
  end if;

  select profiles.id, profiles.full_name, profiles.student_id
  into v_student
  from public.profiles
  where profiles.student_id = v_student_number and profiles.role = 'student';

  if not found then
    raise exception 'STUDENT_NOT_FOUND: no student profile with student number %', v_student_number;
  end if;

  if exists (
    select 1 from public.class_enrollments ce
    where ce.class_id = p_class_id and ce.student_id = v_student.id
  ) then
    raise exception 'DUPLICATE_ENROLLMENT: student % is already enrolled in class %', v_student_number, p_class_id;
  end if;

  begin
    insert into public.class_enrollments (class_id, student_id)
    values (p_class_id, v_student.id);
  exception
    -- Belt-and-suspenders against a concurrent double-enroll racing past the
    -- pre-check above: class_enrollments' own primary key (class_id,
    -- student_id) - see 006_classes_and_enrollments.sql - guarantees at most
    -- one row can ever exist regardless of this race, and this converts that
    -- guaranteed constraint violation into the same friendly error the
    -- pre-check above already gives the non-racing case.
    when unique_violation then
      raise exception 'DUPLICATE_ENROLLMENT: student % is already enrolled in class %', v_student_number, p_class_id;
  end;

  return query
    select p_class_id, v_student.id, v_student.full_name, v_student.student_id, ce.enrolled_at
    from public.class_enrollments ce
    where ce.class_id = p_class_id and ce.student_id = v_student.id;
end;
$$;

revoke all on function public.enroll_student_in_class(uuid, text) from public, anon;
grant execute on function public.enroll_student_in_class(uuid, text) to authenticated;

-- ============================================================================
-- remove_student_from_class
--
-- Deletes only the class_enrollments row - never touches profiles or
-- assessment_sessions (or any of its child tables), which reference
-- student_id/class_id directly, not through class_enrollments (see
-- 009_assessment_sessions.sql). A removed student's prior results remain
-- exactly as readable to the instructor as before removal.
-- ============================================================================
create or replace function public.remove_student_from_class(
  p_class_id   uuid,
  p_student_id uuid
)
returns table (
  class_id   uuid,
  student_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted record;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHORIZED: sign in required';
  end if;
  if not public.is_instructor() then
    raise exception 'UNAUTHORIZED: only instructors can remove a student';
  end if;
  if p_class_id is null or not public.is_instructor_of_class(p_class_id) then
    raise exception 'NOT_FOUND: no class % owned by the signed-in instructor', p_class_id;
  end if;
  if p_student_id is null then
    raise exception 'VALIDATION_ERROR: student_id is required';
  end if;

  delete from public.class_enrollments ce
  where ce.class_id = p_class_id and ce.student_id = p_student_id
  returning ce.class_id, ce.student_id into v_deleted;

  if not found then
    raise exception 'ENROLLMENT_NOT_FOUND: student % is not enrolled in class %', p_student_id, p_class_id;
  end if;

  return query select v_deleted.class_id, v_deleted.student_id;
end;
$$;

revoke all on function public.remove_student_from_class(uuid, uuid) from public, anon;
grant execute on function public.remove_student_from_class(uuid, uuid) to authenticated;

commit;

-- ============================================================================
-- ROLLBACK GUIDANCE (manual only - nothing below this line is executed by
-- running this migration; copy/paste and run by hand if this migration ever
-- needs to be reverted):
--
--   begin;
--   drop function if exists public.remove_student_from_class(uuid, uuid);
--   drop function if exists public.enroll_student_in_class(uuid, text);
--   drop function if exists public.archive_instructor_class(uuid, boolean);
--   drop function if exists public.update_instructor_class(uuid, text, text);
--   drop function if exists public.create_instructor_class(text, text);
--   -- Only drop the column if NO class was ever archived through it - check
--   -- first (`select count(*) from public.classes where archived_at is not
--   -- null`), since dropping it would silently un-archive every class that
--   -- was:
--   -- alter table public.classes drop column if exists archived_at;
--   commit;
-- ============================================================================
