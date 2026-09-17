-- 013_fix_classes_rls_recursion.sql
--
-- FIXES A REAL BUG, found via live integration testing (not reasoned about):
-- querying `classes` or `class_enrollments` as ANY authenticated role raised
-- "infinite recursion detected in policy for relation 'classes'". Root cause:
--
--   classes.students_read_enrolled_classes       -> subqueries class_enrollments
--   class_enrollments.instructors_read_own_class_enrollments -> subqueries classes
--
-- Postgres evaluates every permissive policy on a table for each query (they
-- combine with OR), so even a query that should only hit ONE of a table's
-- policies still evaluates the other - which is how a student's plain
-- `select from class_enrollments` also evaluates the instructor policy,
-- which touches `classes`, whose own student policy touches
-- `class_enrollments` again, forever.
--
-- This is exactly the class of bug 001_profiles.sql's is_instructor() already
-- exists to prevent ("Without it, an RLS policy on profiles that itself
-- selects from profiles recurses infinitely") - profiles' cycle was
-- self-referential (one table), this one is two tables recursing through
-- each other, but the fix is the identical pattern: move the cross-table
-- check into a SECURITY DEFINER function, which evaluates with the
-- DEFINER's rights and so bypasses RLS entirely inside itself, breaking the
-- cycle.
--
-- This alone is sufficient to fix every downstream table too (assessment_
-- assignments, assessment_sessions, and the 7 session_* child tables all
-- bare-subquery into classes/class_enrollments) - once those two tables'
-- OWN policies stop recursing into each other, nothing downstream can
-- trigger the cycle either.
--
-- Run in the Supabase SQL editor AFTER 012. Safe to re-run.

begin;

create or replace function public.is_enrolled_in_class(p_class_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.class_enrollments
    where class_id = p_class_id and student_id = auth.uid()
  );
$$;

revoke all on function public.is_enrolled_in_class(uuid) from public, anon;
grant execute on function public.is_enrolled_in_class(uuid) to authenticated;

create or replace function public.is_instructor_of_class(p_class_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.classes
    where id = p_class_id and instructor_id = auth.uid()
  );
$$;

revoke all on function public.is_instructor_of_class(uuid) from public, anon;
grant execute on function public.is_instructor_of_class(uuid) to authenticated;

drop policy if exists students_read_enrolled_classes on public.classes;
create policy students_read_enrolled_classes
  on public.classes for select
  to authenticated
  using (public.is_enrolled_in_class(id));

drop policy if exists instructors_read_own_class_enrollments on public.class_enrollments;
create policy instructors_read_own_class_enrollments
  on public.class_enrollments for select
  to authenticated
  using (public.is_instructor_of_class(class_id));

commit;
