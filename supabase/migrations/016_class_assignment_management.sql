-- 016_class_assignment_management.sql
--
-- Instructor-driven assignment create/edit/activate-deactivate, plus the two
-- class-level academic-period columns assignments implicitly inherit. Purely
-- additive: two new nullable class columns + two CHECK constraints, one
-- partial unique index, five new SECURITY DEFINER functions, and one
-- CREATE OR REPLACE of an existing function to close a real gap found while
-- reviewing it (see the create_pairing_code section below) - zero drops,
-- zero data changes to any existing row beyond that.
--
-- REVISION NOTE (this file was revised before ever being applied - the
-- version below is the only version that has ever run anywhere): the first
-- draft added academic_year/semester as columns only, with no RPC able to
-- set them - readable everywhere, settable nowhere from the dashboard. That
-- was a real gap (instructors would have needed direct database access),
-- fixed here by adding create_instructor_class_with_period and
-- update_instructor_class_with_period - see their own section below for why
-- these are NEW, separately-named functions rather than changing
-- create_instructor_class/update_instructor_class's existing parameter
-- lists (015_instructor_class_management.sql's own RPCs are UNCHANGED by
-- this file, in this revision or the last - not one line of 015 is
-- modified here).
--
-- SECURITY MODEL - same shape as 015_instructor_class_management.sql, read
-- that file's own header first if you haven't. Every new RPC below is
-- granted to `authenticated` only, re-derives the caller from auth.uid(),
-- and checks public.is_instructor() plus ownership through the assignment's
-- own class (via public.is_instructor_of_class(class_id), already existing
-- from 013). No new INSERT/UPDATE/DELETE RLS policy is added anywhere -
-- assessment_assignments remains exactly as SELECT-only for direct table
-- access as 007 left it; every write goes through one of the three
-- functions below.
--
-- ACADEMIC PERIOD DECISION: academic_year/semester belong to CLASSES, not
-- assessment_assignments. A class already represents one instructor's one
-- section for one specific term - assignments never span more than one
-- class, so they never span more than one period either. Putting the
-- period on assignments too would just be the same fact duplicated per
-- assignment, with its own chance to drift from the owning class's actual
-- period. Existing rows get NULL for both columns on purpose - this
-- migration does not, and cannot honestly, know what period an
-- already-seeded class belongs to; NULL is the transitional state until an
-- instructor sets one via create_instructor_class_with_period/update_
-- instructor_class_with_period (see below) - the dashboard's own class
-- forms now call these, not the original 015 RPCs, though those originals
-- remain callable for any other caller that still uses them.
--
-- NEW RPC PAIR, not a changed signature: create_instructor_class/update_
-- instructor_class (015) keep their exact original parameter lists,
-- behavior, and grants - unmodified, still callable, still backward
-- compatible with anything already calling them. This migration adds
-- create_instructor_class_with_period/update_instructor_class_with_period
-- alongside them instead of widening the originals with more optional
-- parameters, for two reasons: (1) Postgres/PostgREST resolves an RPC call
-- by name AND argument shape - adding optional parameters to an existing
-- function is technically additive, but a differently-NAMED function makes
-- "this is the period-aware variant" unambiguous to both a human reading
-- the call site and PostgREST's own overload resolution, with zero risk of
-- the two accidentally becoming ambiguous overloads; (2) the period fields
-- are REQUIRED (not optional) on the new functions for a NEW class - see
-- validate_academic_period below - which would have been a breaking
-- behavior change for any existing caller of plain create_instructor_class
-- if bolted onto the same function instead of a new one.
--
-- ATOMICITY: both new functions are ordinary PL/pgSQL functions - a single
-- RPC call already runs inside one transaction end-to-end (same guarantee
-- every other multi-statement function in this project already relies on,
-- e.g. submit_assessment_session's own comment in 011_assessment_rpcs.sql).
-- Name/section/academic_year/semester are validated and written by the SAME
-- statement (an insert or update with all four columns set at once), so
-- there is no way for a partial write (e.g. the class row committed but the
-- period fields left unset) to occur - not "usually atomic," structurally
-- incapable of being anything else, because there is only ever one
-- statement, not two.
--
-- IMMUTABILITY DECISION: update_class_assignment accepts no p_class_id or
-- p_scenario_id parameter at all - an assignment's class and scenario are
-- fixed permanently at creation, never editable, by omission rather than by
-- a conditional "only if no sessions exist yet" check. This is simpler and
-- strictly stronger than what this stage's own requirement ("immutable
-- after sessions exist") asked for, and avoids ever having to answer "what
-- happens to sessions already scored against the old scenario's ground
-- truth if the assignment's scenario changes out from under them" - a
-- question with no safe answer, so the migration just makes it unaskable.
--
-- DUPLICATE-ASSIGNMENT GUARANTEE: assessment_assignments_one_active_idx
-- (a partial unique index on (class_id, scenario_id) WHERE is_active) is
-- the actual guarantee - both create_class_assignment's own pre-check AND
-- this index enforce "at most one active assignment per (class, scenario)
-- pair," the same two-layer belt-and-suspenders shape
-- enroll_student_in_class already used for its own duplicate rule in 015 (a
-- friendly pre-check for the common case, the index for the guarantee that
-- holds even under a race).
--
-- create_pairing_code PATCH: reviewing 011_assessment_rpcs.sql's
-- create_pairing_code against this stage's own requirement ("only allow
-- pairing when ... class is active") found a real gap - that function
-- validates the assignment's own is_active/opens_at/closes_at but has never
-- checked classes.archived_at, because archived_at did not exist when 011
-- was written. Patched here via CREATE OR REPLACE (same function, same
-- signature, same grants - only one new EXISTS check added to its body) so
-- an archived class's still-nominally-active assignment can no longer be
-- paired against. This is the one exception to "do not change the pairing
-- contract" this stage's own instructions anticipated ("unless a real
-- compatibility issue is found") - it is a strict tightening of an existing
-- validation gap, not a contract change: the wire shape, parameters, and
-- every other behavior of create_pairing_code are unchanged.
--
-- Run in the Supabase SQL editor AFTER 015. Safe to re-run (CREATE OR
-- REPLACE / ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS
-- throughout). NOT APPLIED YET - stop for review before running this
-- against any Supabase project, per this stage's own instructions. See the
-- bottom of this file for manual rollback guidance (not executed
-- automatically).

begin;

-- ============================================================================
-- Schema: two additive class columns
-- ============================================================================

alter table public.classes
  add column if not exists academic_year text,
  add column if not exists semester text;

-- Format AND consecutive-year both enforced here, in Postgres - not just in
-- validate_academic_period below. This constraint is what actually protects
-- the table against any future caller (a fixed RPC, a direct service-role
-- update, a manual SQL edit) that skips the RPC-level validation entirely -
-- validate_academic_period is the friendly, specific error message; this is
-- the guarantee that holds regardless.
--
-- SAFETY CORRECTION: the first version of this constraint wrote the rule as
-- `academic_year ~ '^\d{4}-\d{4}$' and split_part(academic_year,'-',2)::int
-- = split_part(academic_year,'-',1)::int + 1`, relying on the regex match
-- being checked (and short-circuiting the AND) before the cast ever ran on
-- a value the regex would have rejected. PostgreSQL's query planner does
-- NOT guarantee left-to-right evaluation order for AND/OR in a general
-- boolean expression (unlike a PL/pgSQL IF, which the SQL standard and
-- Postgres both DO guarantee executes its statements in sequence - see
-- validate_academic_period below, which relies on exactly that procedural
-- guarantee and is therefore fine as written) - a CHECK constraint's
-- expression carries no such guarantee, so a value that fails the regex
-- (e.g. "abc", with no "-" in it at all) could in principle still reach
-- split_part(...)::int and raise an ugly, uncontrolled "invalid input
-- syntax for type integer" error instead of the intended, controlled
-- constraint violation - or, worse, an evaluation order Postgres is free to
-- choose differently across versions/plans. Rewritten below as a single
-- CASE expression: the WHEN guard is evaluated first, and the cast only
-- ever appears in the THEN branch, which correctly runs only when the
-- regex has already matched - no reliance on AND/OR ordering anywhere.
alter table public.classes
  drop constraint if exists classes_academic_year_format;
alter table public.classes
  add constraint classes_academic_year_format
    check (
      academic_year is null
      or case
           when academic_year ~ '^[0-9]{4}-[0-9]{4}$'
           then split_part(academic_year, '-', 2)::integer
                = split_part(academic_year, '-', 1)::integer + 1
           else false
         end
    );

alter table public.classes
  drop constraint if exists classes_semester_controlled_values;
alter table public.classes
  add constraint classes_semester_controlled_values
    check (semester is null or semester in ('1st', '2nd', 'Summer'));

comment on column public.classes.academic_year is
  'e.g. "2026-2027" - ending year must be starting year + 1 (enforced by classes_academic_year_format, not just the UI). Nullable/transitional - existing classes were never assigned a real value and none was invented (see this migration''s own header). Set via create_instructor_class_with_period/update_instructor_class_with_period.';
comment on column public.classes.semester is
  'One of ''1st'', ''2nd'', ''Summer'' (enforced by CHECK, not just the UI) or null. Assignments inherit their period from their owning class - see this migration''s own header for why the column lives here and not on assessment_assignments. Set via create_instructor_class_with_period/update_instructor_class_with_period.';

-- ============================================================================
-- validate_academic_period - shared validation, called by both RPCs below.
-- Raises the same VALIDATION_ERROR-prefixed exception convention every
-- other RPC in this project uses (see 011_assessment_rpcs.sql's own header)
-- so callers get one consistent error shape regardless of which field
-- failed. Deliberately NOT security definer and does no table access - it
-- only inspects its own arguments - so it needs no elevated privilege; it
-- is still schema-qualified (public.validate_academic_period) at every call
-- site for the same ambiguity-avoidance discipline as every other function
-- in this project.
-- ============================================================================
-- SAFETY NOTE: the two `if` statements below ARE safe as sequential
-- PL/pgSQL statements - unlike a single SQL boolean expression (a CHECK
-- constraint, a WHERE clause), Postgres's procedural language guarantees
-- statements run in the written order, so the first `if` raising and
-- exiting the function before the second `if` (the one with the cast) ever
-- runs is a real guarantee, not a hoped-for short-circuit. Rewritten below
-- anyway, as a single CASE mirroring classes_academic_year_format's own
-- expression exactly, so the two places this rule lives can never drift
-- apart and a reader never has to reason about the two functions'
-- guarantees differently.
create or replace function public.validate_academic_period(
  p_academic_year text,
  p_semester      text
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_is_valid_year boolean;
begin
  if p_academic_year is null then
    raise exception 'VALIDATION_ERROR: academic year must look like "2026-2027"';
  end if;

  v_is_valid_year := case
    when p_academic_year ~ '^[0-9]{4}-[0-9]{4}$'
    then split_part(p_academic_year, '-', 2)::integer = split_part(p_academic_year, '-', 1)::integer + 1
    else false
  end;

  if not v_is_valid_year then
    if p_academic_year !~ '^[0-9]{4}-[0-9]{4}$' then
      raise exception 'VALIDATION_ERROR: academic year must look like "2026-2027"';
    else
      raise exception 'VALIDATION_ERROR: academic year''s ending year must be the starting year + 1 (e.g. "2026-2027", not "2026-2028")';
    end if;
  end if;

  if p_semester is null or p_semester not in ('1st', '2nd', 'Summer') then
    raise exception 'VALIDATION_ERROR: semester must be "1st", "2nd", or "Summer"';
  end if;
end;
$$;

revoke all on function public.validate_academic_period(text, text) from public, anon;
grant execute on function public.validate_academic_period(text, text) to authenticated;

-- ============================================================================
-- create_instructor_class_with_period
--
-- The dashboard's /classes/new form calls this, not create_instructor_class
-- (015) - see this file's own header for why a new function rather than a
-- widened one. p_academic_year/p_semester are REQUIRED (no default) -
-- creating a class through this path always sets a real period; the plain
-- create_instructor_class remains available (unmodified) for any caller
-- that still wants a period-less class.
-- ============================================================================
create or replace function public.create_instructor_class_with_period(
  p_name          text,
  p_academic_year text,
  p_semester      text,
  p_section       text default null
)
returns table (
  id            uuid,
  name          text,
  section       text,
  instructor_id uuid,
  academic_year text,
  semester      text,
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

  perform public.validate_academic_period(p_academic_year, p_semester);

  -- One insert, every column together - see this file's own ATOMICITY note.
  insert into public.classes (name, section, instructor_id, academic_year, semester)
  values (v_name, v_section, v_caller, p_academic_year, p_semester)
  returning classes.id into v_new_id;

  return query
    select c.id, c.name, c.section, c.instructor_id, c.academic_year, c.semester, c.archived_at, c.created_at
    from public.classes c
    where c.id = v_new_id;
end;
$$;

revoke all on function public.create_instructor_class_with_period(text, text, text, text) from public, anon;
grant execute on function public.create_instructor_class_with_period(text, text, text, text) to authenticated;

-- ============================================================================
-- update_instructor_class_with_period
--
-- The dashboard's /classes/[classId]/edit form calls this, not
-- update_instructor_class (015). Same required-fields posture as create:
-- every edit through this path leaves the class with a valid period, which
-- is exactly how a legacy NULL-period class gets filled in (submit the edit
-- form once with real values) - see this file's own header, requirement 8.
-- plain update_instructor_class remains available, unmodified, for any
-- caller that only ever touches name/section.
-- ============================================================================
create or replace function public.update_instructor_class_with_period(
  p_class_id      uuid,
  p_name          text,
  p_academic_year text,
  p_semester      text,
  p_section       text default null
)
returns table (
  id            uuid,
  name          text,
  section       text,
  instructor_id uuid,
  academic_year text,
  semester      text,
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

  perform public.validate_academic_period(p_academic_year, p_semester);

  -- One update, every column together - see this file's own ATOMICITY note.
  update public.classes c
  set name = v_name, section = v_section, academic_year = p_academic_year, semester = p_semester, updated_at = now()
  where c.id = p_class_id;

  return query
    select c.id, c.name, c.section, c.instructor_id, c.academic_year, c.semester, c.archived_at, c.updated_at
    from public.classes c
    where c.id = p_class_id;
end;
$$;

revoke all on function public.update_instructor_class_with_period(uuid, text, text, text, text) from public, anon;
grant execute on function public.update_instructor_class_with_period(uuid, text, text, text, text) to authenticated;

-- ============================================================================
-- Schema: at most one ACTIVE assignment per (class, scenario)
-- ============================================================================

create unique index if not exists assessment_assignments_one_active_idx
  on public.assessment_assignments (class_id, scenario_id)
  where is_active;

comment on index public.assessment_assignments_one_active_idx is
  'Guarantees at most one active assignment per (class, scenario) pair, even under a concurrent race - see create_class_assignment/set_assignment_active''s own comments.';

-- ============================================================================
-- create_class_assignment
-- ============================================================================
create or replace function public.create_class_assignment(
  p_class_id    uuid,
  p_scenario_id text,
  p_title       text default null,
  p_opens_at    timestamptz default null,
  p_closes_at   timestamptz default null
)
returns table (
  id          uuid,
  class_id    uuid,
  scenario_id text,
  title       text,
  is_active   boolean,
  opens_at    timestamptz,
  closes_at   timestamptz,
  created_at  timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_title text := nullif(trim(p_title), '');
  v_new_id uuid;
begin
  if v_caller is null then
    raise exception 'UNAUTHORIZED: sign in required';
  end if;
  if not public.is_instructor() then
    raise exception 'UNAUTHORIZED: only instructors can create an assignment';
  end if;
  if p_class_id is null or not public.is_instructor_of_class(p_class_id) then
    raise exception 'NOT_FOUND: no class % owned by the signed-in instructor', p_class_id;
  end if;

  if exists (select 1 from public.classes where classes.id = p_class_id and archived_at is not null) then
    raise exception 'CLASS_ARCHIVED: class % is archived and cannot receive new assignments', p_class_id;
  end if;

  if p_scenario_id is null or not exists (select 1 from public.scenarios where scenarios.scenario_id = p_scenario_id) then
    raise exception 'SCENARIO_NOT_FOUND: no scenario %', p_scenario_id;
  end if;

  if p_opens_at is not null and p_closes_at is not null and p_opens_at >= p_closes_at then
    raise exception 'VALIDATION_ERROR: opening date must be before the due date';
  end if;

  begin
    insert into public.assessment_assignments (class_id, scenario_id, title, opens_at, closes_at, created_by)
    values (p_class_id, p_scenario_id, v_title, p_opens_at, p_closes_at, v_caller)
    returning assessment_assignments.id into v_new_id;
  exception
    when unique_violation then
      raise exception 'DUPLICATE_ASSIGNMENT: class % already has an active assignment for scenario %', p_class_id, p_scenario_id;
  end;

  return query
    select a.id, a.class_id, a.scenario_id, a.title, a.is_active, a.opens_at, a.closes_at, a.created_at
    from public.assessment_assignments a
    where a.id = v_new_id;
end;
$$;

revoke all on function public.create_class_assignment(uuid, text, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.create_class_assignment(uuid, text, text, timestamptz, timestamptz) to authenticated;

-- ============================================================================
-- update_class_assignment
--
-- No p_class_id/p_scenario_id parameter - see this migration's own
-- IMMUTABILITY DECISION comment above. Editable while the owning class is
-- archived (same "fixing metadata isn't the same as creating new
-- obligations" reasoning update_instructor_class already used in 015).
-- ============================================================================
create or replace function public.update_class_assignment(
  p_assignment_id uuid,
  p_title         text,
  p_opens_at      timestamptz default null,
  p_closes_at     timestamptz default null
)
returns table (
  id          uuid,
  class_id    uuid,
  scenario_id text,
  title       text,
  is_active   boolean,
  opens_at    timestamptz,
  closes_at   timestamptz,
  updated_at  timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text := nullif(trim(p_title), '');
  v_class_id uuid;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHORIZED: sign in required';
  end if;
  if not public.is_instructor() then
    raise exception 'UNAUTHORIZED: only instructors can edit an assignment';
  end if;

  select a.class_id into v_class_id from public.assessment_assignments a where a.id = p_assignment_id;
  if v_class_id is null or not public.is_instructor_of_class(v_class_id) then
    raise exception 'NOT_FOUND: no assignment % owned by the signed-in instructor', p_assignment_id;
  end if;

  if p_opens_at is not null and p_closes_at is not null and p_opens_at >= p_closes_at then
    raise exception 'VALIDATION_ERROR: opening date must be before the due date';
  end if;

  update public.assessment_assignments a
  set title = v_title, opens_at = p_opens_at, closes_at = p_closes_at, updated_at = now()
  where a.id = p_assignment_id;

  return query
    select a.id, a.class_id, a.scenario_id, a.title, a.is_active, a.opens_at, a.closes_at, a.updated_at
    from public.assessment_assignments a
    where a.id = p_assignment_id;
end;
$$;

revoke all on function public.update_class_assignment(uuid, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.update_class_assignment(uuid, text, timestamptz, timestamptz) to authenticated;

-- ============================================================================
-- set_assignment_active
--
-- One function for deactivate/reactivate/"reopen", same toggle shape
-- archive_instructor_class (015) already used and the same reasoning: this
-- stage's own RPC list offered "archive_class_assignment or
-- set_assignment_active" as alternatives and asked for "reopen_class_
-- assignment when appropriate" - folding all three into one idempotent
-- toggle is simpler than three near-duplicate functions and was already the
-- precedent this project set for classes.
--
-- Reactivating (p_active = true) is refused if the owning class is
-- archived, or if it would collide with another already-active assignment
-- for the same (class, scenario) - both requirements this stage's own spec
-- named explicitly ("reject assignment reactivation unless the class is
-- restored", "prevent duplicate active assignments").
-- ============================================================================
create or replace function public.set_assignment_active(
  p_assignment_id uuid,
  p_active        boolean default true
)
returns table (
  id        uuid,
  is_active boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class_id uuid;
  v_scenario_id text;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHORIZED: sign in required';
  end if;
  if not public.is_instructor() then
    raise exception 'UNAUTHORIZED: only instructors can activate or deactivate an assignment';
  end if;

  select a.class_id, a.scenario_id into v_class_id, v_scenario_id
  from public.assessment_assignments a where a.id = p_assignment_id;
  if v_class_id is null or not public.is_instructor_of_class(v_class_id) then
    raise exception 'NOT_FOUND: no assignment % owned by the signed-in instructor', p_assignment_id;
  end if;

  if p_active and exists (select 1 from public.classes where classes.id = v_class_id and archived_at is not null) then
    raise exception 'CLASS_ARCHIVED: class % is archived - restore it before reactivating this assignment', v_class_id;
  end if;

  begin
    update public.assessment_assignments a
    set is_active = p_active, updated_at = now()
    where a.id = p_assignment_id;
  exception
    when unique_violation then
      raise exception 'DUPLICATE_ASSIGNMENT: class % already has a different active assignment for scenario %', v_class_id, v_scenario_id;
  end;

  return query select a.id, a.is_active from public.assessment_assignments a where a.id = p_assignment_id;
end;
$$;

revoke all on function public.set_assignment_active(uuid, boolean) from public, anon;
grant execute on function public.set_assignment_active(uuid, boolean) to authenticated;

-- ============================================================================
-- create_pairing_code PATCH - see this migration's own header. Identical to
-- 011's version except for the one new EXISTS check (marked below); every
-- other line, the signature, and the grants are unchanged.
-- ============================================================================
create or replace function public.create_pairing_code(
  p_student_id     uuid,
  p_class_id       uuid,
  p_assignment_id  uuid,
  p_scenario_id    text,
  p_code_hash      text,
  p_ttl_seconds    integer
)
returns table (id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expires_at timestamptz;
  v_new_id uuid;
begin
  if p_student_id is null or p_class_id is null or p_assignment_id is null then
    raise exception 'VALIDATION_ERROR: student, class, and assignment ids are required';
  end if;
  if p_scenario_id is null or length(p_scenario_id) = 0 or length(p_scenario_id) > 200 then
    raise exception 'VALIDATION_ERROR: scenario id must be 1-200 characters';
  end if;
  if p_code_hash is null or length(p_code_hash) <> 64 then
    raise exception 'VALIDATION_ERROR: code_hash must be a 64-character hex digest';
  end if;
  if p_ttl_seconds is null or p_ttl_seconds <= 0 or p_ttl_seconds > 900 then
    raise exception 'VALIDATION_ERROR: ttl_seconds must be between 1 and 900';
  end if;

  if not exists (select 1 from public.profiles where profiles.id = p_student_id and role = 'student') then
    raise exception 'VALIDATION_ERROR: % is not a student profile', p_student_id;
  end if;

  if not exists (
    select 1 from public.class_enrollments
    where class_id = p_class_id and student_id = p_student_id
  ) then
    raise exception 'VALIDATION_ERROR: student % is not enrolled in class %', p_student_id, p_class_id;
  end if;

  -- NEW in 016: the one check 011 could not have had, since archived_at
  -- did not exist yet - see this migration's own header.
  if exists (select 1 from public.classes where classes.id = p_class_id and archived_at is not null) then
    raise exception 'ASSIGNMENT_INACTIVE: class % is archived', p_class_id;
  end if;

  if not exists (
    select 1 from public.assessment_assignments
    where assessment_assignments.id = p_assignment_id
      and class_id = p_class_id
      and scenario_id = p_scenario_id
      and is_active
      and (opens_at is null or opens_at <= now())
      and (closes_at is null or closes_at >= now())
  ) then
    raise exception 'ASSIGNMENT_INACTIVE: assignment % is not an active assignment of class % for scenario %', p_assignment_id, p_class_id, p_scenario_id;
  end if;

  update public.assessment_pairing_codes
  set revoked_at = now()
  where student_id = p_student_id
    and assignment_id = p_assignment_id
    and consumed_at is null
    and revoked_at is null;

  v_expires_at := now() + make_interval(secs => p_ttl_seconds);

  insert into public.assessment_pairing_codes
    (student_id, class_id, assignment_id, scenario_id, code_hash, expires_at)
  values
    (p_student_id, p_class_id, p_assignment_id, p_scenario_id, p_code_hash, v_expires_at)
  returning assessment_pairing_codes.id into v_new_id;

  return query select v_new_id, v_expires_at;
end;
$$;

revoke all on function public.create_pairing_code(uuid, uuid, uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.create_pairing_code(uuid, uuid, uuid, text, text, integer) to service_role;

commit;

-- ============================================================================
-- ROLLBACK GUIDANCE (manual only - nothing below this line is executed by
-- running this migration; copy/paste and run by hand if this migration ever
-- needs to be reverted):
--
--   begin;
--   -- Restore create_pairing_code to its pre-016 body (the archived_at
--   -- check is the only diff) by re-running 011_assessment_rpcs.sql's own
--   -- CREATE OR REPLACE for this function, verbatim.
--   drop function if exists public.set_assignment_active(uuid, boolean);
--   drop function if exists public.update_class_assignment(uuid, text, timestamptz, timestamptz);
--   drop function if exists public.create_class_assignment(uuid, text, text, timestamptz, timestamptz);
--   drop index if exists public.assessment_assignments_one_active_idx;
--   drop function if exists public.update_instructor_class_with_period(uuid, text, text, text, text);
--   drop function if exists public.create_instructor_class_with_period(text, text, text, text);
--   drop function if exists public.validate_academic_period(text, text);
--   -- The original 015 RPCs (create_instructor_class, update_instructor_class)
--   -- are never touched by this migration in either direction - nothing to
--   -- restore for them.
--   -- Only drop these columns if neither was ever set (check first:
--   -- `select count(*) from public.classes where academic_year is not null
--   -- or semester is not null`), since dropping them discards that data:
--   -- alter table public.classes drop column if exists semester;
--   -- alter table public.classes drop column if exists academic_year;
--   commit;
-- ============================================================================
