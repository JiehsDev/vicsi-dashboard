-- supabase/tests/manual_assignment_management_test.sql
--
-- NOT a migration - do not run this against production, and do not add it to
-- the numbered migrations sequence. Run manually (Supabase SQL editor, or
-- `psql -f`) against a DEVELOPMENT project only, AFTER 016_class_assignment_
-- management.sql has been applied and the minimum dev dataset exists (see
-- supabase/seed/seed-assessment-dev-data.mjs and manual_class_management_
-- test.sql's own header for the exact accounts this expects - the same
-- instructor A / instructor B / two students this project already seeds).
--
-- Same conventions as manual_class_management_test.sql: `set local role
-- authenticated` + a fake `request.jwt.claims` GUC to simulate auth.uid()
-- for a given caller; each check RAISE NOTICEs on pass or ABORTS on
-- failure; the whole file runs inside one transaction that ROLLS BACK at
-- the end, so a clean run (or a failing one) leaves the dev database
-- exactly as it found it regardless of the DO block's own inline cleanup.

begin;

do $$
declare
  v_instructor_a uuid;
  v_instructor_b uuid;
  v_student_a uuid;
  v_class uuid; -- instructor A's real seeded class (has real sessions - used ONLY for the
                -- session-preservation and pairing-window checks against its own REAL,
                -- already-existing seeded assignment; never used to create a NEW
                -- assignment, since the seed data already has an active one for
                -- (v_class, v_scenario) and the new partial unique index correctly
                -- refuses a second one - confirmed live when the first draft of this
                -- script tried exactly that and got DUPLICATE_ASSIGNMENT for real)
  v_class_a_temp uuid; -- a FRESH temporary class owned by instructor A, used for every
                        -- create/edit/duplicate/lifecycle check below so none of them
                        -- can ever collide with real seeded data
  v_class_b uuid; -- a class actually owned by instructor B, for the cross-instructor check
  v_scenario text := 'CSI-ENVIRONMENT-001';
  v_real_assignment_id uuid; -- the real seeded assignment for (v_class, v_scenario)

  v_assignment record;
  v_threw boolean;
  v_code_hash text;
  v_pairing_id uuid;
begin
  select id into v_instructor_a from public.profiles where role = 'instructor' and full_name = 'Dev Instructor (Test)';
  select id into v_instructor_b from public.profiles where role = 'instructor' and full_name like '%ADMIN STAND-IN%';
  select id into v_student_a from public.profiles where role = 'student' and student_id = '2099-00001';
  select id into v_class from public.classes where name = 'ViCSI Dev Test Class';

  if v_instructor_a is null or v_instructor_b is null or v_student_a is null or v_class is null then
    raise exception 'SETUP: missing seeded dev instructor(s)/student/class - seed minimum dev data first';
  end if;

  select id into v_real_assignment_id from public.assessment_assignments where class_id = v_class and scenario_id = v_scenario and is_active limit 1;
  if v_real_assignment_id is null then
    raise exception 'SETUP: no active seeded assignment found for (class, scenario) - seed minimum dev data first';
  end if;

  raise notice 'Using instructor_a=%, instructor_b=%, student_a=%, class=%, real_assignment=%', v_instructor_a, v_instructor_b, v_student_a, v_class, v_real_assignment_id;

  -- Throwaway classes for instructor A (create/edit/duplicate/lifecycle
  -- checks) and instructor B (cross-instructor check) - created directly
  -- (bypassing RLS as this connection's own role) rather than via
  -- create_instructor_class, to avoid needing yet another role-switch just
  -- for setup.
  insert into public.classes (name, section, instructor_id)
  values ('Manual Assignment Test - Instructor A Temp Class', 'Y', v_instructor_a)
  returning id into v_class_a_temp;

  insert into public.classes (name, section, instructor_id)
  values ('Manual Assignment Test - Instructor B Class', 'X', v_instructor_b)
  returning id into v_class_b;

  -- --- 1. Instructor A creates an assignment for their own (fresh, empty)
  --     class - NOT the real seeded v_class, which already has an active
  --     assignment for this exact scenario (see v_class_a_temp's own
  --     declaration comment above). ---
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_instructor_a::text, 'role', 'authenticated')::text, true);

  select * into v_assignment from public.create_class_assignment(v_class_a_temp, v_scenario, 'Manual Test Assignment', null, null);
  if v_assignment.id is null or v_assignment.class_id <> v_class_a_temp or v_assignment.scenario_id <> v_scenario or not v_assignment.is_active then
    raise exception 'FAIL: create_class_assignment did not return the expected row';
  end if;
  raise notice 'PASS: create_class_assignment created % for class %', v_assignment.id, v_class_a_temp;

  -- --- 2. Instructor A edits it ---
  select * into v_assignment from public.update_class_assignment(v_assignment.id, 'Manual Test Assignment (Renamed)', null, null);
  if v_assignment.title <> 'Manual Test Assignment (Renamed)' then
    raise exception 'FAIL: update_class_assignment did not persist the new title';
  end if;
  raise notice 'PASS: update_class_assignment renamed the assignment';

  -- --- 3. Invalid date range is rejected ---
  v_threw := false;
  begin
    perform public.update_class_assignment(v_assignment.id, 'bad dates', now() + interval '1 day', now());
  exception when others then
    v_threw := true;
    if sqlerrm not like 'VALIDATION_ERROR:%' then
      raise exception 'FAIL: invalid date range raised the wrong error: %', sqlerrm;
    end if;
  end;
  if not v_threw then raise exception 'FAIL: opens_at >= closes_at did not raise'; end if;
  raise notice 'PASS: an opening date on/after the due date correctly raises VALIDATION_ERROR';

  -- --- 4. Invalid scenario is rejected ---
  v_threw := false;
  begin
    perform public.create_class_assignment(v_class_a_temp, 'NO-SUCH-SCENARIO', null, null, null);
  exception when others then
    v_threw := true;
    if sqlerrm not like 'SCENARIO_NOT_FOUND:%' then
      raise exception 'FAIL: invalid scenario raised the wrong error: %', sqlerrm;
    end if;
  end;
  if not v_threw then raise exception 'FAIL: an invalid scenario id did not raise'; end if;
  raise notice 'PASS: an invalid scenario id correctly raises SCENARIO_NOT_FOUND';

  -- --- 5. Duplicate active assignment (same class+scenario) is rejected ---
  v_threw := false;
  begin
    perform public.create_class_assignment(v_class_a_temp, v_scenario, 'Duplicate attempt', null, null);
  exception when others then
    v_threw := true;
    if sqlerrm not like 'DUPLICATE_ASSIGNMENT:%' then
      raise exception 'FAIL: duplicate active assignment raised the wrong error: %', sqlerrm;
    end if;
  end;
  if not v_threw then raise exception 'FAIL: a duplicate active assignment did not raise'; end if;
  raise notice 'PASS: a duplicate active assignment correctly raises DUPLICATE_ASSIGNMENT';

  -- --- 6. Concurrent duplicate creation produces only one row - deactivate
  --     the first, then raw-insert a second active row bypassing the RPC
  --     layer (same "simulate a second concurrent SECURITY DEFINER call" as
  --     manual_class_management_test.sql's own step 5), proving the partial
  --     unique index is the real guarantee, not just the RPC's pre-check.
  --     reset role BEFORE the deactivation, not after - assessment_
  --     assignments has no UPDATE policy for `authenticated` (007/016 are
  --     both SELECT-only), so running this update while still in the
  --     instructor_a session would silently affect zero rows (no policy =
  --     no rows visible to UPDATE, not an error) and leave v_assignment
  --     still active, which would make the very next insert below hit the
  --     unique index for the wrong reason before the test even got to what
  --     it means to check - confirmed live, not hypothetical: this exact
  --     ordering bug is what the first run of this script actually hit. ---
  reset role;
  update public.assessment_assignments set is_active = false where id = v_assignment.id;
  insert into public.assessment_assignments (class_id, scenario_id, is_active, created_by)
  values (v_class_a_temp, v_scenario, true, v_instructor_a);
  v_threw := false;
  begin
    insert into public.assessment_assignments (class_id, scenario_id, is_active, created_by)
    values (v_class_a_temp, v_scenario, true, v_instructor_a);
  exception when unique_violation then
    v_threw := true;
  end;
  if not v_threw then raise exception 'FAIL: a second raw active-duplicate insert did not hit the partial unique index'; end if;
  if (select count(*) from public.assessment_assignments where class_id = v_class_a_temp and scenario_id = v_scenario and is_active) <> 1 then
    raise exception 'FAIL: more than one active assignment exists for the same (class, scenario)';
  end if;
  raise notice 'PASS: the partial unique index guarantees at most one active assignment per (class, scenario)';
  -- Clean up the raw row this step inserted directly (the RPC-created one,
  -- v_assignment, is reused for the rest of the script).
  delete from public.assessment_assignments where class_id = v_class_a_temp and scenario_id = v_scenario and is_active;
  update public.assessment_assignments set is_active = true where id = v_assignment.id;

  -- --- 7. Instructor A deactivates and reactivates their own assignment ---
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_instructor_a::text, 'role', 'authenticated')::text, true);

  select * into v_assignment from public.set_assignment_active(v_assignment.id, false);
  if v_assignment.is_active then raise exception 'FAIL: set_assignment_active(false) did not deactivate'; end if;
  raise notice 'PASS: set_assignment_active(false) deactivated the assignment';

  select * into v_assignment from public.set_assignment_active(v_assignment.id, true);
  if not v_assignment.is_active then raise exception 'FAIL: set_assignment_active(true) did not reactivate'; end if;
  raise notice 'PASS: set_assignment_active(true) reactivated the assignment';

  -- --- 8. A student cannot call any assignment-management RPC ---
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_student_a::text, 'role', 'authenticated')::text, true);

  v_threw := false;
  begin
    perform public.create_class_assignment(v_class_a_temp, v_scenario, 'Student attempt', null, null);
  exception when others then
    v_threw := true;
    if sqlerrm not like 'UNAUTHORIZED:%' then
      raise exception 'FAIL: student create_class_assignment raised the wrong error: %', sqlerrm;
    end if;
  end;
  if not v_threw then raise exception 'FAIL: a student was able to create an assignment'; end if;
  raise notice 'PASS: a student cannot call create_class_assignment';

  v_threw := false;
  begin
    perform public.set_assignment_active(v_assignment.id, false);
  exception when others then
    v_threw := true;
    if sqlerrm not like 'UNAUTHORIZED:%' then
      raise exception 'FAIL: student set_assignment_active raised the wrong error: %', sqlerrm;
    end if;
  end;
  if not v_threw then raise exception 'FAIL: a student was able to deactivate an assignment'; end if;
  raise notice 'PASS: a student cannot call set_assignment_active';

  -- --- 9. Instructor A cannot manage instructor B's assignment ---
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_instructor_b::text, 'role', 'authenticated')::text, true);
  declare
    v_assignment_b record;
  begin
    select * into v_assignment_b from public.create_class_assignment(v_class_b, v_scenario, 'Instructor B''s own assignment', null, null);
  end;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_instructor_a::text, 'role', 'authenticated')::text, true);
  v_threw := false;
  begin
    perform public.update_class_assignment((select id from public.assessment_assignments where class_id = v_class_b limit 1), 'Hijacked', null, null);
  exception when others then
    v_threw := true;
    if sqlerrm not like 'NOT_FOUND:%' then
      raise exception 'FAIL: cross-instructor update raised the wrong error: %', sqlerrm;
    end if;
  end;
  if not v_threw then raise exception 'FAIL: instructor A was able to update instructor B''s assignment'; end if;
  raise notice 'PASS: a different instructor cannot update another instructor''s assignment';

  -- --- 10. Archived class rejects new assignment creation ---
  reset role;
  update public.classes set archived_at = now() where id = v_class_b;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_instructor_b::text, 'role', 'authenticated')::text, true);

  v_threw := false;
  begin
    perform public.create_class_assignment(v_class_b, v_scenario, 'Should be refused', null, null);
  exception when others then
    v_threw := true;
    if sqlerrm not like 'CLASS_ARCHIVED:%' then
      raise exception 'FAIL: creating an assignment in an archived class raised the wrong error: %', sqlerrm;
    end if;
  end;
  if not v_threw then raise exception 'FAIL: an archived class accepted a new assignment'; end if;
  raise notice 'PASS: an archived class correctly rejects new assignment creation';

  -- --- 11. Archived class rejects assignment reactivation ---
  declare
    v_assignment_b_id uuid;
  begin
    select id into v_assignment_b_id from public.assessment_assignments where class_id = v_class_b limit 1;
    perform public.set_assignment_active(v_assignment_b_id, false);

    v_threw := false;
    begin
      perform public.set_assignment_active(v_assignment_b_id, true);
    exception when others then
      v_threw := true;
      if sqlerrm not like 'CLASS_ARCHIVED:%' then
        raise exception 'FAIL: reactivating an assignment in an archived class raised the wrong error: %', sqlerrm;
      end if;
    end;
    if not v_threw then raise exception 'FAIL: an assignment in an archived class was reactivated'; end if;
    raise notice 'PASS: an archived class correctly rejects assignment reactivation';
  end;

  -- --- 12. Class/scenario immutability: update_class_assignment has no
  --     parameter for either - a structural guarantee, verified here by
  --     confirming the function's own signature, not by attempting and
  --     catching a runtime error (there is no runtime path that could even
  --     attempt it). ---
  if exists (
    select 1 from pg_proc
    where proname = 'update_class_assignment'
      and pg_get_function_identity_arguments(oid) like '%uuid%'
      and pg_get_function_identity_arguments(oid) not like '%p_class_id%'
      and pg_get_function_identity_arguments(oid) not like '%p_scenario_id%'
  ) then
    raise notice 'PASS: update_class_assignment has no class_id/scenario_id parameter - immutable by construction';
  else
    raise exception 'FAIL: update_class_assignment unexpectedly accepts a class_id or scenario_id parameter';
  end if;

  -- --- 13. Deactivation preserves session history (structural: no FK path
  --     from assessment_sessions through is_active at all - confirmed by
  --     reading 009_assessment_sessions.sql; nothing to delete because
  --     nothing ever pointed at "is_active" in the first place). Verified
  --     directly here against the real seeded session data, deactivating
  --     the REAL seeded assignment (v_real_assignment_id) - not v_assignment,
  --     which belongs to the empty temp class and has no sessions to
  --     meaningfully check against. Reactivated again immediately after;
  --     the whole script rolls back at the end regardless (belt-and-
  --     suspenders, same as every other real-row mutation in this file).
  --
  --     Re-establishes instructor_a's own session first - steps 10/11 left
  --     the role context as instructor_b (who owns none of v_class), and
  --     RLS (instructors_read_own_class_sessions) correctly, silently
  --     returns zero rows for a class the current caller doesn't own -
  --     confirmed live: the first run of this corrected script still hit
  --     the SKIPPED branch for exactly this reason, against a class that
  --     genuinely has 2 real seeded sessions. ---
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_instructor_a::text, 'role', 'authenticated')::text, true);
  if (select count(*) from public.assessment_sessions where class_id = v_class) = 0 then
    raise notice 'SKIPPED: no seeded sessions for class % to verify against', v_class;
  else
    declare
      v_before integer;
      v_after integer;
    begin
      select count(*) into v_before from public.assessment_sessions where class_id = v_class;
      set local role authenticated;
      perform set_config('request.jwt.claims', json_build_object('sub', v_instructor_a::text, 'role', 'authenticated')::text, true);
      perform public.set_assignment_active(v_real_assignment_id, false);
      select count(*) into v_after from public.assessment_sessions where class_id = v_class;
      if v_before <> v_after then
        raise exception 'FAIL: deactivating an assignment changed the session count (% -> %)', v_before, v_after;
      end if;
      perform public.set_assignment_active(v_real_assignment_id, true);
      raise notice 'PASS: deactivating an assignment does not touch assessment_sessions (% sessions, unchanged)', v_before;
    end;
  end if;

  -- --- 14/15. Pairing works only when active + in-window + class active;
  --     fails with a controlled error otherwise. create_pairing_code is
  --     service_role-only (011/016), so these calls run with RLS bypassed
  --     the same way Node's own server code reaches it - see
  --     manual_assessment_flow_test.sql for the same pattern. Exercised
  --     against v_real_assignment_id (the REAL seeded assignment) because
  --     create_pairing_code also requires the student to be enrolled in the
  --     assignment's own class (see 011's own check), and v_student_a is
  --     only enrolled in the real v_class, not the fresh v_class_a_temp
  --     these pairing checks would otherwise have no enrolled student for. ---
  reset role;

  -- Currently active, no window set -> pairing should succeed.
  v_code_hash := encode(sha256(('manual-assignment-test-' || gen_random_uuid()::text)::bytea), 'hex');
  select id into v_pairing_id from public.create_pairing_code(v_student_a, v_class, v_real_assignment_id, v_scenario, v_code_hash, 300);
  if v_pairing_id is null then raise exception 'FAIL: pairing was refused for an active, in-window, active-class assignment'; end if;
  raise notice 'PASS: pairing succeeds for an active assignment with no window restriction';
  update public.assessment_pairing_codes set revoked_at = now() where id = v_pairing_id; -- clean up before next attempt

  -- Upcoming (opens in the future) -> refused.
  update public.assessment_assignments set opens_at = now() + interval '1 day', closes_at = null where id = v_real_assignment_id;
  v_threw := false;
  begin
    perform public.create_pairing_code(v_student_a, v_class, v_real_assignment_id, v_scenario, encode(sha256(gen_random_uuid()::text::bytea), 'hex'), 300);
  exception when others then
    v_threw := true;
    if sqlerrm not like 'ASSIGNMENT_INACTIVE:%' then
      raise exception 'FAIL: pairing against an upcoming assignment raised the wrong error: %', sqlerrm;
    end if;
  end;
  if not v_threw then raise exception 'FAIL: pairing succeeded against an upcoming (not-yet-open) assignment'; end if;
  raise notice 'PASS: pairing against an upcoming assignment correctly raises ASSIGNMENT_INACTIVE';

  -- Closed (closed in the past) -> refused.
  update public.assessment_assignments set opens_at = null, closes_at = now() - interval '1 day' where id = v_real_assignment_id;
  v_threw := false;
  begin
    perform public.create_pairing_code(v_student_a, v_class, v_real_assignment_id, v_scenario, encode(sha256(gen_random_uuid()::text::bytea), 'hex'), 300);
  exception when others then
    v_threw := true;
    if sqlerrm not like 'ASSIGNMENT_INACTIVE:%' then
      raise exception 'FAIL: pairing against a closed assignment raised the wrong error: %', sqlerrm;
    end if;
  end;
  if not v_threw then raise exception 'FAIL: pairing succeeded against a closed assignment'; end if;
  raise notice 'PASS: pairing against a closed assignment correctly raises ASSIGNMENT_INACTIVE';

  -- Inactive -> refused.
  update public.assessment_assignments set opens_at = null, closes_at = null, is_active = false where id = v_real_assignment_id;
  v_threw := false;
  begin
    perform public.create_pairing_code(v_student_a, v_class, v_real_assignment_id, v_scenario, encode(sha256(gen_random_uuid()::text::bytea), 'hex'), 300);
  exception when others then
    v_threw := true;
    if sqlerrm not like 'ASSIGNMENT_INACTIVE:%' then
      raise exception 'FAIL: pairing against an inactive assignment raised the wrong error: %', sqlerrm;
    end if;
  end;
  if not v_threw then raise exception 'FAIL: pairing succeeded against an inactive assignment'; end if;
  raise notice 'PASS: pairing against an inactive assignment correctly raises ASSIGNMENT_INACTIVE';

  -- Archived class -> refused, even with an otherwise-active assignment
  -- (this is the NEW check 016 added to create_pairing_code).
  update public.assessment_assignments set is_active = true where id = v_real_assignment_id;
  update public.classes set archived_at = now() where id = v_class;
  v_threw := false;
  begin
    perform public.create_pairing_code(v_student_a, v_class, v_real_assignment_id, v_scenario, encode(sha256(gen_random_uuid()::text::bytea), 'hex'), 300);
  exception when others then
    v_threw := true;
    if sqlerrm not like 'ASSIGNMENT_INACTIVE:%' then
      raise exception 'FAIL: pairing against an archived class raised the wrong error: %', sqlerrm;
    end if;
  end;
  if not v_threw then raise exception 'FAIL: pairing succeeded against an assignment whose class is archived'; end if;
  raise notice 'PASS: pairing against an archived class correctly raises ASSIGNMENT_INACTIVE (the new 016 check)';
  update public.classes set archived_at = null where id = v_class; -- restore the real seeded class

  raise notice 'ALL CHECKS PASSED';

  -- --- Cleanup: only what this script created ---
  delete from public.assessment_assignments where id = v_assignment.id;
  delete from public.assessment_assignments where class_id = v_class_a_temp;
  delete from public.classes where id = v_class_a_temp;
  delete from public.assessment_assignments where class_id = v_class_b;
  delete from public.classes where id = v_class_b;
end $$;

rollback;
-- ROLLBACK, not commit, on purpose - same second-independent-safety-net
-- reasoning as manual_class_management_test.sql's own footer.
