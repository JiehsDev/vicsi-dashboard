-- supabase/tests/manual_class_management_test.sql
--
-- NOT a migration - do not run this against production, and do not add it to
-- the numbered migrations sequence. Run manually (Supabase SQL editor, or
-- `psql -f`) against a DEVELOPMENT project only, AFTER BOTH
-- 015_instructor_class_management.sql AND 016_class_assignment_management.sql
-- have been applied (checks 17+ below exercise 016's academic-period RPCs)
-- and the minimum dev dataset exists - see
-- supabase/seed/seed-assessment-dev-data.mjs. Expects, by role/student_id
-- (edit the v_* variables below if your dev data uses different ids):
--   - an instructor profile with email dev-instructor@test.traceboard.invalid
--   - a SECOND instructor profile to test cross-instructor rejection against -
--     this project's own seed script already creates one: the "[ADMIN
--     STAND-IN, role=instructor]" account (role='instructor' seeded for a
--     completely different reason, but it owns no class, which is exactly
--     what this script needs - any instructor profile that owns none of the
--     test student's classes would do)
--   - two student profiles with student_id '2099-00001' and '2099-00002'
--
-- SIMULATING auth.uid() FROM RAW SQL: every RPC this stage added derives the
-- caller's identity from auth.uid()/auth.role(), which only resolve from a
-- real PostgREST request's JWT in production. To exercise that same code
-- path from a plain SQL script, this file uses Supabase's standard local
-- testing technique - `set local role authenticated` plus a fake
-- `request.jwt.claims` GUC carrying the target user's own id as `sub`. This
-- is the documented Supabase approach as of this project's Postgres version;
-- if a future Supabase upgrade changes how auth.uid() reads its claim (rare,
-- but possible), the `as_user()` helper below is the one place to update -
-- every check in this file goes through it rather than duplicating the GUC
-- calls, specifically so there is exactly one place to fix.
--
-- Each check either passes silently (a RAISE NOTICE) or ABORTS THE WHOLE
-- SCRIPT with a clear exception - same discipline as manual_assessment_flow_
-- test.sql. Cleans up everything it creates at the end, in its own
-- transaction, so a clean run leaves the dev database exactly as it found it
-- (the class it creates, and any enrollment into it, are both deleted at the
-- end; the two pre-existing seed students/instructors are never modified).

begin;

do $$
declare
  v_instructor_a uuid; -- dev-instructor@test.traceboard.invalid
  v_instructor_b uuid; -- the seeded admin stand-in (also role=instructor, owns no class)
  v_student_a uuid;    -- student_id '2099-00001'
  v_student_b uuid;    -- student_id '2099-00002'

  v_class record;
  v_class2 record;
  v_result record;
  v_threw boolean;
begin
  select id into v_instructor_a from public.profiles where role = 'instructor' and full_name = 'Dev Instructor (Test)';
  select id into v_instructor_b from public.profiles where role = 'instructor' and full_name like '%ADMIN STAND-IN%';
  select id into v_student_a from public.profiles where role = 'student' and student_id = '2099-00001';
  select id into v_student_b from public.profiles where role = 'student' and student_id = '2099-00002';

  if v_instructor_a is null or v_instructor_b is null or v_student_a is null or v_student_b is null then
    raise exception 'SETUP: missing seeded dev instructor(s) or student(s) - seed minimum dev data first';
  end if;

  raise notice 'Using instructor_a=%, instructor_b=%, student_a=%, student_b=%', v_instructor_a, v_instructor_b, v_student_a, v_student_b;

  -- --- 1. Instructor A creates a class ---
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_instructor_a::text, 'role', 'authenticated')::text, true);

  select * into v_class from public.create_instructor_class('Manual Test Class', 'T');
  if v_class.id is null or v_class.name <> 'Manual Test Class' or v_class.instructor_id <> v_instructor_a then
    raise exception 'FAIL: create_instructor_class did not return the expected row';
  end if;
  raise notice 'PASS: create_instructor_class created % owned by %', v_class.id, v_instructor_a;

  -- --- 2. Instructor A edits their class ---
  select * into v_class from public.update_instructor_class(v_class.id, 'Manual Test Class (Renamed)', 'T2');
  if v_class.name <> 'Manual Test Class (Renamed)' or v_class.section <> 'T2' then
    raise exception 'FAIL: update_instructor_class did not persist the new name/section';
  end if;
  raise notice 'PASS: update_instructor_class renamed the class';

  -- --- 3. Instructor A enrolls a student ---
  select * into v_result from public.enroll_student_in_class(v_class.id, '2099-00001');
  if v_result.student_id <> v_student_a or v_result.student_number <> '2099-00001' then
    raise exception 'FAIL: enroll_student_in_class did not return the expected row';
  end if;
  raise notice 'PASS: enroll_student_in_class enrolled student %', v_result.student_number;

  -- --- 4. Duplicate enrollment is rejected ---
  v_threw := false;
  begin
    perform public.enroll_student_in_class(v_class.id, '2099-00001');
  exception when others then
    v_threw := true;
    if sqlerrm not like 'DUPLICATE_ENROLLMENT:%' then
      raise exception 'FAIL: duplicate enrollment raised the wrong error: %', sqlerrm;
    end if;
  end;
  if not v_threw then raise exception 'FAIL: duplicate enrollment did not raise'; end if;
  raise notice 'PASS: duplicate enrollment correctly raises DUPLICATE_ENROLLMENT';

  -- --- 4b. Direct browser-style write remains blocked by RLS: no INSERT
  --     policy exists on class_enrollments (see 006/015's own comments), so
  --     a raw insert AS the authenticated role - exactly what a compromised
  --     or bypassed dashboard request would attempt - is rejected before it
  --     ever reaches the primary key, regardless of whether the row would
  --     even be a duplicate. ---
  v_threw := false;
  begin
    insert into public.class_enrollments (class_id, student_id) values (v_class.id, v_student_b);
  exception when insufficient_privilege then
    v_threw := true;
  end;
  if not v_threw then raise exception 'FAIL: a raw authenticated-role insert into class_enrollments was NOT blocked by RLS'; end if;
  if exists (select 1 from public.class_enrollments where class_id = v_class.id and student_id = v_student_b) then
    raise exception 'FAIL: the blocked insert somehow still created a row';
  end if;
  raise notice 'PASS: a direct authenticated-role insert into class_enrollments is blocked by RLS (no INSERT policy exists)';

  -- --- 5. Concurrent duplicate produces only one row. A real race is two
  --     simultaneous SECURITY DEFINER calls, both of which run with the
  --     FUNCTION OWNER's rights (bypassing RLS on class_enrollments
  --     entirely, same as any SECURITY DEFINER call) - so the accurate way
  --     to simulate "a second concurrent RPC call reaching the insert" from
  --     serial SQL is a raw insert with RLS bypassed the same way (`reset
  --     role` back to this connection's own owner/superuser role), not a
  --     raw insert AS `authenticated` (which - as this script's own first
  --     run against real dev Supabase actually caught - hits RLS's "no
  --     insert policy" wall before it would ever reach the primary key at
  --     all, proving a DIFFERENT guarantee, requirement #17's "direct
  --     browser-style writes remain blocked," not this one). ---
  reset role;
  v_threw := false;
  begin
    insert into public.class_enrollments (class_id, student_id) values (v_class.id, v_student_a);
  exception when unique_violation then
    v_threw := true;
  end;
  if not v_threw then raise exception 'FAIL: a raw duplicate insert bypassing RLS did not hit the PK constraint'; end if;
  if (select count(*) from public.class_enrollments where class_id = v_class.id and student_id = v_student_a) <> 1 then
    raise exception 'FAIL: more than one enrollment row exists for the same (class, student)';
  end if;
  raise notice 'PASS: the class_enrollments primary key guarantees exactly one row regardless of caller';

  -- Re-establish instructor A's simulated session for the rest of the script.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_instructor_a::text, 'role', 'authenticated')::text, true);

  -- --- 6. Missing student fails safely ---
  v_threw := false;
  begin
    perform public.enroll_student_in_class(v_class.id, 'NO-SUCH-STUDENT');
  exception when others then
    v_threw := true;
    if sqlerrm not like 'STUDENT_NOT_FOUND:%' then
      raise exception 'FAIL: unknown student number raised the wrong error: %', sqlerrm;
    end if;
  end;
  if not v_threw then raise exception 'FAIL: enrolling an unknown student number did not raise'; end if;
  raise notice 'PASS: unknown student number correctly raises STUDENT_NOT_FOUND';

  -- --- 7. Invalid class id fails safely ---
  v_threw := false;
  begin
    perform public.enroll_student_in_class('00000000-0000-0000-0000-000000000000'::uuid, '2099-00002');
  exception when others then
    v_threw := true;
    if sqlerrm not like 'NOT_FOUND:%' then
      raise exception 'FAIL: nonexistent class id raised the wrong error: %', sqlerrm;
    end if;
  end;
  if not v_threw then raise exception 'FAIL: enrolling into a nonexistent class did not raise'; end if;
  raise notice 'PASS: nonexistent class id correctly raises NOT_FOUND';

  -- --- 8. Instructor B (a different instructor) cannot touch instructor A's class ---
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_instructor_b::text, 'role', 'authenticated')::text, true);

  v_threw := false;
  begin
    perform public.update_instructor_class(v_class.id, 'Hijacked name', null);
  exception when others then
    v_threw := true;
    if sqlerrm not like 'NOT_FOUND:%' then
      raise exception 'FAIL: cross-instructor update raised the wrong error: %', sqlerrm;
    end if;
  end;
  if not v_threw then raise exception 'FAIL: instructor B was able to update instructor A''s class'; end if;
  raise notice 'PASS: a different instructor cannot update another instructor''s class';

  v_threw := false;
  begin
    perform public.enroll_student_in_class(v_class.id, '2099-00002');
  exception when others then
    v_threw := true;
    if sqlerrm not like 'NOT_FOUND:%' then
      raise exception 'FAIL: cross-instructor enrollment raised the wrong error: %', sqlerrm;
    end if;
  end;
  if not v_threw then raise exception 'FAIL: instructor B was able to enroll a student into instructor A''s class'; end if;
  raise notice 'PASS: a different instructor cannot enroll into another instructor''s class';

  -- --- 9. A student cannot call any management RPC, even for their own enrollment ---
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_student_a::text, 'role', 'authenticated')::text, true);

  v_threw := false;
  begin
    perform public.create_instructor_class('Student-created class', null);
  exception when others then
    v_threw := true;
    if sqlerrm not like 'UNAUTHORIZED:%' then
      raise exception 'FAIL: student create_instructor_class raised the wrong error: %', sqlerrm;
    end if;
  end;
  if not v_threw then raise exception 'FAIL: a student was able to create a class'; end if;
  raise notice 'PASS: a student cannot call create_instructor_class';

  v_threw := false;
  begin
    -- Student A tries to remove themself from the class they're actually in.
    perform public.remove_student_from_class(v_class.id, v_student_a);
  exception when others then
    v_threw := true;
    if sqlerrm not like 'UNAUTHORIZED:%' then
      raise exception 'FAIL: student self-removal raised the wrong error: %', sqlerrm;
    end if;
  end;
  if not v_threw then raise exception 'FAIL: a student was able to remove their own enrollment'; end if;
  raise notice 'PASS: a student cannot call remove_student_from_class, even against their own enrollment';

  -- --- 10. Back to instructor A: archive rejects new enrollment ---
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_instructor_a::text, 'role', 'authenticated')::text, true);

  select * into v_class from public.archive_instructor_class(v_class.id, true);
  if v_class.archived_at is null then
    raise exception 'FAIL: archive_instructor_class did not set archived_at';
  end if;
  raise notice 'PASS: archive_instructor_class archived the class';

  v_threw := false;
  begin
    perform public.enroll_student_in_class(v_class.id, '2099-00002');
  exception when others then
    v_threw := true;
    if sqlerrm not like 'CLASS_ARCHIVED:%' then
      raise exception 'FAIL: enrolling into an archived class raised the wrong error: %', sqlerrm;
    end if;
  end;
  if not v_threw then raise exception 'FAIL: an archived class accepted a new enrollment'; end if;
  raise notice 'PASS: an archived class correctly rejects new enrollment';

  -- --- 11. Restore un-archives ---
  select * into v_class from public.archive_instructor_class(v_class.id, false);
  if v_class.archived_at is not null then
    raise exception 'FAIL: archive_instructor_class(false) did not clear archived_at';
  end if;
  raise notice 'PASS: archive_instructor_class(false) restored the class';

  -- --- 12. Remove the enrollment; the student's own session history (if any)
  --     stays untouched - class_enrollments carries no FK relationship to
  --     assessment_sessions at all (see 009_assessment_sessions.sql), so
  --     this is really a structural guarantee, not a per-row check; this
  --     step only confirms the enrollment row itself is actually gone. ---
  select * into v_result from public.remove_student_from_class(v_class.id, v_student_a);
  if v_result.student_id <> v_student_a then
    raise exception 'FAIL: remove_student_from_class did not return the expected row';
  end if;
  if exists (select 1 from public.class_enrollments where class_id = v_class.id and student_id = v_student_a) then
    raise exception 'FAIL: the enrollment row still exists after removal';
  end if;
  raise notice 'PASS: remove_student_from_class removed the enrollment';

  v_threw := false;
  begin
    perform public.remove_student_from_class(v_class.id, v_student_a);
  exception when others then
    v_threw := true;
    if sqlerrm not like 'ENROLLMENT_NOT_FOUND:%' then
      raise exception 'FAIL: removing an already-removed enrollment raised the wrong error: %', sqlerrm;
    end if;
  end;
  if not v_threw then raise exception 'FAIL: removing a nonexistent enrollment did not raise'; end if;
  raise notice 'PASS: removing an already-removed enrollment correctly raises ENROLLMENT_NOT_FOUND';

  -- ==========================================================================
  -- ACADEMIC PERIOD (016_class_assignment_management.sql, revised) -
  -- create_instructor_class_with_period / update_instructor_class_with_period
  -- ==========================================================================

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_instructor_a::text, 'role', 'authenticated')::text, true);

  -- --- 17. New class created with a valid academic period ---
  select * into v_class2 from public.create_instructor_class_with_period('Manual Period Test Class', '2026-2027', '1st', 'P');
  if v_class2.id is null or v_class2.academic_year <> '2026-2027' or v_class2.semester <> '1st' then
    raise exception 'FAIL: create_instructor_class_with_period did not return the expected period';
  end if;
  raise notice 'PASS: create_instructor_class_with_period created % with academic_year=%, semester=%', v_class2.id, v_class2.academic_year, v_class2.semester;

  -- --- 18. Every malformed academic-year value is rejected with a
  --     controlled VALIDATION_ERROR - never an uncontrolled cast error
  --     (e.g. "invalid input syntax for type integer") and never a partial
  --     row. Exercises validate_academic_period's CASE-guarded cast (see
  --     this migration's own SAFETY NOTE) against exactly the inputs that
  --     would have been dangerous under the old AND-based expression. ---
  declare
    v_bad_year text;
    v_bad_years text[] := array['abc', '2026', '2026-', '-2027', '202A-2027', '2026-20B7', '', '   '];
    v_count_before integer;
    v_count_after integer;
  begin
    foreach v_bad_year in array v_bad_years loop
      select count(*) into v_count_before from public.classes where name = 'Bad Format Probe';
      v_threw := false;
      begin
        perform public.create_instructor_class_with_period('Bad Format Probe', v_bad_year, '1st', null);
      exception when others then
        v_threw := true;
        if sqlerrm not like 'VALIDATION_ERROR:%' then
          raise exception 'FAIL: academic_year=%L raised the wrong error (expected a controlled VALIDATION_ERROR): %', v_bad_year, sqlerrm;
        end if;
      end;
      if not v_threw then
        raise exception 'FAIL: academic_year=%L was accepted but should have been rejected', v_bad_year;
      end if;
      select count(*) into v_count_after from public.classes where name = 'Bad Format Probe';
      if v_count_before <> v_count_after then
        raise exception 'FAIL: a rejected academic_year=%L still left a partial row behind', v_bad_year;
      end if;
      raise notice 'PASS: academic_year=%L correctly raises a controlled VALIDATION_ERROR, no partial row', v_bad_year;
    end loop;
  end;

  -- --- 18b. The exact same set, applied directly at the table level
  --     (bypassing the RPC, bypassing validate_academic_period entirely) -
  --     confirms classes_academic_year_format itself is the real guarantee,
  --     with the same CASE-guarded safety, not just the RPC's own check. ---
  declare
    v_bad_year text;
    v_bad_years text[] := array['abc', '2026', '2026-', '-2027', '202A-2027', '2026-20B7', '2026-2028', '', '   '];
  begin
    reset role;
    foreach v_bad_year in array v_bad_years loop
      v_threw := false;
      begin
        update public.classes set academic_year = v_bad_year where id = v_class2.id;
      exception when check_violation then
        v_threw := true;
      when others then
        raise exception 'FAIL: academic_year=%L raised an uncontrolled error at the table level (expected check_violation): %', v_bad_year, sqlerrm;
      end;
      if not v_threw then
        raise exception 'FAIL: the table CHECK constraint accepted academic_year=%L', v_bad_year;
      end if;
      raise notice 'PASS: classes_academic_year_format rejects academic_year=%L with a controlled check_violation, not a cast error', v_bad_year;
    end loop;
  end;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_instructor_a::text, 'role', 'authenticated')::text, true);

  -- --- 19. Non-consecutive academic year is rejected (e.g. 2026-2028) ---
  v_threw := false;
  begin
    perform public.create_instructor_class_with_period('Non-consecutive class', '2026-2028', '1st', null);
  exception when others then
    v_threw := true;
    if sqlerrm not like 'VALIDATION_ERROR:%' then
      raise exception 'FAIL: non-consecutive academic year raised the wrong error: %', sqlerrm;
    end if;
  end;
  if not v_threw then raise exception 'FAIL: a non-consecutive academic year (2026-2028) did not raise'; end if;
  raise notice 'PASS: a non-consecutive academic year correctly raises VALIDATION_ERROR';

  -- --- 19b. Same-year "range" (2026-2026, ending year NOT starting+1) is
  --     also rejected - a distinct edge case from 2026-2028 (one year past,
  --     this one is zero years past). ---
  v_threw := false;
  begin
    perform public.create_instructor_class_with_period('Same-year class', '2026-2026', '1st', null);
  exception when others then
    v_threw := true;
    if sqlerrm not like 'VALIDATION_ERROR:%' then
      raise exception 'FAIL: a same-year academic year (2026-2026) raised the wrong error: %', sqlerrm;
    end if;
  end;
  if not v_threw then raise exception 'FAIL: a same-year academic year (2026-2026) did not raise'; end if;
  raise notice 'PASS: a same-year academic year (2026-2026) correctly raises VALIDATION_ERROR';

  -- Table-level rejection of 2026-2028 (and every other malformed value) is
  -- already covered exhaustively by step 18b above - not repeated here.

  -- --- 20. Invalid semester is rejected ---
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_instructor_a::text, 'role', 'authenticated')::text, true);
  v_threw := false;
  begin
    perform public.create_instructor_class_with_period('Bad semester class', '2026-2027', '3rd', null);
  exception when others then
    v_threw := true;
    if sqlerrm not like 'VALIDATION_ERROR:%' then
      raise exception 'FAIL: invalid semester raised the wrong error: %', sqlerrm;
    end if;
  end;
  if not v_threw then raise exception 'FAIL: an invalid semester value did not raise'; end if;
  raise notice 'PASS: an invalid semester value correctly raises VALIDATION_ERROR';

  -- --- 21. Failure in any field rolls back the ENTIRE creation - a bad
  --     semester alongside an otherwise-valid name/year must not leave any
  --     partial row behind. RAISE EXCEPTION inside a PL/pgSQL function
  --     always rolls back everything that function itself did (see
  --     011_assessment_rpcs.sql's own comment on submit_assessment_session
  --     for the same guarantee) - verified directly here, not just asserted. ---
  declare
    v_count_before integer;
    v_count_after integer;
  begin
    select count(*) into v_count_before from public.classes where name = 'Rollback Test Class';
    begin
      perform public.create_instructor_class_with_period('Rollback Test Class', '2026-2027', 'NOT-A-SEMESTER', null);
    exception when others then
      null; -- expected; the point is to check nothing was left behind
    end;
    select count(*) into v_count_after from public.classes where name = 'Rollback Test Class';
    if v_count_before <> v_count_after then
      raise exception 'FAIL: a failed create_instructor_class_with_period call left a partial row behind';
    end if;
    raise notice 'PASS: a validation failure on any field rolls back the entire class creation - no partial row';
  end;

  -- --- 22. Existing NULL-period class (v_class, created earlier via the
  --     plain create_instructor_class - see step 1 - so it still has
  --     academic_year/semester both null) can be updated to fill them in.
  --     v_class's own record shape has drifted through several earlier
  --     RETURNS TABLE shapes since (archive_instructor_class returns only
  --     id/archived_at) - re-fetched fresh from the table itself here
  --     rather than assumed, so this step doesn't depend on which columns
  --     an unrelated earlier step happened to return. ---
  select id, name, section, academic_year, semester into v_class from public.classes where classes.id = v_class.id;
  if v_class.academic_year is not null or v_class.semester is not null then
    raise exception 'SETUP: v_class unexpectedly already has a period set - can''t verify the NULL-fill case';
  end if;
  select * into v_class from public.update_instructor_class_with_period(v_class.id, v_class.name, '2027-2028', '2nd', v_class.section);
  if v_class.academic_year <> '2027-2028' or v_class.semester <> '2nd' then
    raise exception 'FAIL: update_instructor_class_with_period did not fill in the previously-null period';
  end if;
  raise notice 'PASS: update_instructor_class_with_period fills in a legacy class''s previously-null academic period';

  -- --- 23. Class detail preserves the period after a SUBSEQUENT edit that
  --     only changes the name - confirms the period isn't accidentally
  --     cleared by an unrelated edit through the same RPC. ---
  select * into v_class from public.update_instructor_class_with_period(v_class.id, v_class.name || ' (renamed again)', v_class.academic_year, v_class.semester, v_class.section);
  if v_class.academic_year <> '2027-2028' or v_class.semester <> '2nd' then
    raise exception 'FAIL: a follow-up edit lost the previously-set academic period';
  end if;
  raise notice 'PASS: the academic period survives a follow-up edit to unrelated fields';

  -- --- 24. A student cannot set an academic period ---
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_student_a::text, 'role', 'authenticated')::text, true);
  v_threw := false;
  begin
    perform public.create_instructor_class_with_period('Student period attempt', '2026-2027', '1st', null);
  exception when others then
    v_threw := true;
    if sqlerrm not like 'UNAUTHORIZED:%' then
      raise exception 'FAIL: student create_instructor_class_with_period raised the wrong error: %', sqlerrm;
    end if;
  end;
  if not v_threw then raise exception 'FAIL: a student was able to create a class with an academic period'; end if;
  raise notice 'PASS: a student cannot call create_instructor_class_with_period';

  v_threw := false;
  begin
    perform public.update_instructor_class_with_period(v_class.id, v_class.name, '2030-2031', '1st', v_class.section);
  exception when others then
    v_threw := true;
    if sqlerrm not like 'UNAUTHORIZED:%' then
      raise exception 'FAIL: student update_instructor_class_with_period raised the wrong error: %', sqlerrm;
    end if;
  end;
  if not v_threw then raise exception 'FAIL: a student was able to update an academic period'; end if;
  raise notice 'PASS: a student cannot call update_instructor_class_with_period';

  -- --- 25. Instructor A cannot update instructor B's academic period ---
  reset role;
  declare
    v_class_b_id uuid;
  begin
    insert into public.classes (name, section, instructor_id)
    values ('Manual Period Test - Instructor B Class', 'Q', v_instructor_b)
    returning id into v_class_b_id;

    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_instructor_a::text, 'role', 'authenticated')::text, true);
    v_threw := false;
    begin
      perform public.update_instructor_class_with_period(v_class_b_id, 'Hijacked', '2026-2027', '1st', null);
    exception when others then
      v_threw := true;
      if sqlerrm not like 'NOT_FOUND:%' then
        raise exception 'FAIL: cross-instructor period update raised the wrong error: %', sqlerrm;
      end if;
    end;
    if not v_threw then raise exception 'FAIL: instructor A was able to set instructor B''s class''s academic period'; end if;
    raise notice 'PASS: a different instructor cannot set another instructor''s class''s academic period';

    reset role;
    delete from public.classes where id = v_class_b_id;
  end;

  raise notice 'ALL CHECKS PASSED';

  -- --- Cleanup: reset role, delete only what this script created ---
  reset role;
  delete from public.classes where id = v_class.id;
  delete from public.classes where id = v_class2.id;
  delete from public.classes where name = 'Rollback Test Class';
end $$;

rollback;
-- ROLLBACK, not commit, on purpose: even though the script's own DO block
-- already deletes the class it created, running the whole file inside a
-- transaction that rolls back is a second, independent safety net - a
-- mid-script failure (which raises out of the DO block before the manual
-- cleanup at the bottom ever runs) still leaves the dev database exactly as
-- it was found, with nothing left to clean up by hand.
