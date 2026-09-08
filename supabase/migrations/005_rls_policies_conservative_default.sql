-- 005_rls_policies_conservative_default.sql
--
-- Replaces "deny everyone" (the interim state from 004) with "deny everyone
-- except instructors (all rows) and students (their own rows only, joined
-- through profiles.student_id)". Writes remain fully denied to every client
-- role -- no insert/update/delete policy is added anywhere in this file, so
-- only service-role (which bypasses RLS) can write, exactly as it does today
-- for manual and seed inserts. This is deliberate: nothing should write to
-- these tables from a client until a real, trusted ingest endpoint exists.
--
-- This is a conservative starting point, not a final design. It should be
-- revisited once real access-rule decisions are confirmed -- particularly
-- whether instructor access needs section-scoping rather than all-rows, and
-- whether scenario_aggregate should also be readable by students. Both are
-- easy, narrow, non-breaking changes to make later; this file intentionally
-- starts narrower than it might eventually need to be, per this project's
-- standing rule that under-sharing is a fixable annoyance and over-sharing
-- is the failure mode everything here is trying to prevent.
--
-- REVIEW BEFORE APPLYING -- confirm is_instructor()'s actual definition
-- first (see note below). This file assumes but does not independently
-- verify its exact behavior.
--
-- REVIEWED against the live database (not just this repo's migration
-- history) before being committed here:
--   - is_instructor() (defined in 001_profiles.sql) genuinely exists on the
--     live project and was called for real, signed in as both seeded
--     accounts: returns true for instructor@psu.edu.ph, false for the
--     seeded student. Matches what every policy below assumes.
--   - profiles.student_id exists and holds the expected value ("2021-04521")
--     for the seeded student account.
--   - The students_read_own_sessions / students_read_own_events join
--     (profiles.student_id = student_session_summary.id) has no column-name
--     mismatch against the live schema on either side.
--   - One real, expected consequence of that join, not a bug: the seeded
--     test row's id is "TEST-STUDENT-001", which matches no real student's
--     student_id, so the seeded student account would see zero rows from
--     student_session_summary under this policy -- only the instructor
--     account (is_instructor() grants all rows) sees it. TEST-STUDENT-001
--     is a test artifact, not a real account, so this is correct as-is.
--   - Not applied here. Applying this is a separate, deliberate manual step
--     via the Supabase SQL editor, same as every other migration in this
--     project.

begin;

-- student_session_summary ----------------------------------------------------

drop policy if exists instructors_read_all_sessions on student_session_summary;
create policy instructors_read_all_sessions
  on student_session_summary
  for select
  to authenticated
  using (is_instructor());

drop policy if exists students_read_own_sessions on student_session_summary;
create policy students_read_own_sessions
  on student_session_summary
  for select
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.student_id = student_session_summary.id
    )
  );

-- evidence_events --------------------------------------------------------------

drop policy if exists instructors_read_all_events on evidence_events;
create policy instructors_read_all_events
  on evidence_events
  for select
  to authenticated
  using (is_instructor());

drop policy if exists students_read_own_events on evidence_events;
create policy students_read_own_events
  on evidence_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from student_session_summary sss
      join profiles p on p.id = auth.uid()
      where sss.session_id = evidence_events.session_id
        and p.student_id = sss.id
    )
  );

-- scenario_aggregate -------------------------------------------------------------
-- Instructor-only for now. This table has no student identity column at all
-- to scope a "read your own" rule against, and there's no confirmed need yet
-- for students to see it. Opening it later is a one-line addition; starting
-- narrow costs nothing.

drop policy if exists instructors_read_scenario_aggregate on scenario_aggregate;
create policy instructors_read_scenario_aggregate
  on scenario_aggregate
  for select
  to authenticated
  using (is_instructor());

commit;
