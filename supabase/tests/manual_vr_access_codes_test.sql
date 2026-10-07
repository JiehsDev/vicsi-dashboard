-- supabase/tests/manual_vr_access_codes_test.sql
--
-- NOT a migration - do not add it to the numbered sequence. Run manually
-- (Supabase SQL editor, or `psql -f`) against a DEVELOPMENT project only, AFTER
-- 018_student_vr_access_codes.sql has been applied. Self-contained: it creates
-- its own two instructors, three students and two classes, and the whole script
-- ends in ROLLBACK, so a run leaves the database exactly as it found it (no
-- users, profiles, classes or codes survive, and no existing student's code is
-- changed).
--
-- auth.uid() is simulated the same way as manual_class_management_test.sql:
-- `set local role authenticated` plus a request.jwt.claims GUC carrying `sub`.
--
-- Each check RAISEs NOTICE 'PASS: ...' or aborts the whole script with 'FAIL: ...'.
--
-- Covers: generation (format, alphabet, no duplicates), uniqueness constraint,
-- auto-code for new students, idempotent backfill that never overwrites,
-- canonical lookup, valid/invalid/disabled codes, regeneration invalidating the
-- old code with the student id unchanged and version +1, re-enable restoring the
-- same code, instructor-only authorization, directory contents (new student
-- listed, disabled marked without code, unenrolled/archived excluded), and that
-- no client role can read the table or call the headset RPCs directly.

begin;

do $$
declare
  v_instructor_a uuid := gen_random_uuid(); -- teaches the test class
  v_instructor_b uuid := gen_random_uuid(); -- teaches nothing of S1's
  v_s1 uuid := gen_random_uuid();           -- enrolled in the active class
  v_s2 uuid := gen_random_uuid();           -- enrolled only in an archived class
  v_s3 uuid := gen_random_uuid();           -- not enrolled anywhere
  v_class uuid;
  v_archived_class uuid;

  v_code text;
  v_code2 text;
  v_version integer;
  v_row record;
  v_count integer;
  v_threw boolean;
  v_codes text[];
  v_before text;
begin
  -- ---------------------------------------------------------------- setup
  insert into auth.users (id, email) values
    (v_instructor_a, 'vr-test-instructor-a@test.traceboard.invalid'),
    (v_instructor_b, 'vr-test-instructor-b@test.traceboard.invalid'),
    (v_s1, '2099-91001@students.traceboard.internal'),
    (v_s2, '2099-91002@students.traceboard.internal'),
    (v_s3, '2099-91003@students.traceboard.internal');

  perform public.upsert_profile(v_instructor_a, 'instructor', 'VR Test Instructor A');
  perform public.upsert_profile(v_instructor_b, 'instructor', 'VR Test Instructor B');
  perform public.upsert_profile(v_s1, 'student', 'VR Test Student One', '2099-91001', 'A', '1234');
  perform public.upsert_profile(v_s2, 'student', 'VR Test Student Two', '2099-91002', 'A', '1234');
  perform public.upsert_profile(v_s3, 'student', 'VR Test Student Three', '2099-91003', 'A', '1234');

  insert into public.classes (name, section, instructor_id) values ('VR Test Class', 'A', v_instructor_a) returning id into v_class;
  insert into public.classes (name, section, instructor_id, archived_at) values ('VR Test Archived', 'A', v_instructor_a, now()) returning id into v_archived_class;
  insert into public.class_enrollments (class_id, student_id) values (v_class, v_s1), (v_archived_class, v_s2);

  -- -------------------------------------------------- 1. generation format
  select array_agg(public.generate_vr_access_code()) into v_codes from generate_series(1, 2000);
  if exists (select 1 from unnest(v_codes) c where c !~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$') then
    raise exception 'FAIL: generate_vr_access_code produced a code outside the 8-char lookalike-free alphabet';
  end if;
  if (select count(distinct c) from unnest(v_codes) c) <> 2000 then
    raise exception 'FAIL: 2000 generated codes contained a duplicate';
  end if;
  if (select count(distinct ch) from unnest(v_codes) c, regexp_split_to_table(c, '') ch) <> 31 then
    raise exception 'FAIL: generated codes did not use all 31 alphabet symbols';
  end if;
  raise notice 'PASS: 2000 generated codes - all well-formed, no duplicates, all 31 symbols used';

  -- --------------------------------------- 2. new students get a code; instructors don't
  select access_code, code_version into v_code, v_version from public.student_vr_access_codes where student_id = v_s1;
  if v_code is null or v_version <> 1 then
    raise exception 'FAIL: a newly created student did not automatically get a version-1 code';
  end if;
  if exists (select 1 from public.student_vr_access_codes where student_id in (v_instructor_a, v_instructor_b)) then
    raise exception 'FAIL: an instructor received a VR code';
  end if;
  v_threw := false;
  begin
    insert into public.student_vr_access_codes (student_id, access_code) values (v_instructor_a, 'ABCDEFGH');
  exception when others then
    v_threw := true;
  end;
  if not v_threw then raise exception 'FAIL: a code row could be created for an instructor'; end if;
  raise notice 'PASS: new students get a code automatically (version 1); instructors cannot hold one';

  -- ------------------------------------------------- 3. uniqueness is enforced
  v_threw := false;
  begin
    update public.student_vr_access_codes set access_code = v_code where student_id = v_s2;
  exception when unique_violation then
    v_threw := true;
  end;
  if not v_threw then raise exception 'FAIL: two students could hold the same code'; end if;
  raise notice 'PASS: unique index rejects a second student holding the same code';

  -- ------------------------- 4. backfill: idempotent, fills gaps, never overwrites
  select access_code into v_before from public.student_vr_access_codes where student_id = v_s1;
  delete from public.student_vr_access_codes where student_id = v_s3;  -- simulate a pre-018 student
  v_count := public.ensure_student_vr_access_codes();
  if v_count < 1 or not exists (select 1 from public.student_vr_access_codes where student_id = v_s3) then
    raise exception 'FAIL: backfill did not give the code-less student a code';
  end if;
  if public.ensure_student_vr_access_codes() <> 0 then
    raise exception 'FAIL: a second backfill run created codes again (not idempotent)';
  end if;
  if (select access_code from public.student_vr_access_codes where student_id = v_s1) <> v_before then
    raise exception 'FAIL: backfill overwrote an existing valid code';
  end if;
  if (select count(*) from public.profiles where id = v_s3) <> 1 then
    raise exception 'FAIL: backfill duplicated a student';
  end if;
  raise notice 'PASS: backfill filled the gap (% created), second run created 0, existing code untouched', v_count;

  -- --------------------------------------------- 5. valid / invalid lookup
  select * into v_row from public.validate_vr_access_code(v_code);
  if v_row.student_id is distinct from v_s1 or v_row.display_name <> 'VR Test Student One'
     or v_row.code_version <> 1 or v_row.class_id is distinct from v_class then
    raise exception 'FAIL: a valid code did not resolve to its student/class/version';
  end if;
  if exists (select 1 from public.validate_vr_access_code('ZZZZ9999')) and v_code <> 'ZZZZ9999' then
    raise exception 'FAIL: an unissued code validated';
  end if;
  if exists (select 1 from public.validate_vr_access_code(lower(v_code))) then
    raise exception 'FAIL: the RPC matched a non-canonical code (the API must normalize first, the DB must not guess)';
  end if;
  raise notice 'PASS: valid code -> student, class and version; unissued and non-canonical codes -> nothing';

  -- ------------------------------------------------ 6. authorization
  set local role authenticated;

  perform set_config('request.jwt.claims', json_build_object('sub', v_s1::text, 'role', 'authenticated')::text, true);
  v_threw := false;
  begin
    perform public.regenerate_student_vr_access_code(v_s1);
  exception when others then
    v_threw := sqlerrm like 'UNAUTHORIZED:%';
  end;
  if not v_threw then raise exception 'FAIL: a student could regenerate their own code'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_instructor_b::text, 'role', 'authenticated')::text, true);
  v_threw := false;
  begin
    perform public.set_student_vr_access_code_enabled(v_s1, false);
  exception when others then
    v_threw := sqlerrm like 'UNAUTHORIZED:%';
  end;
  if not v_threw then raise exception 'FAIL: an instructor who does not teach the student could disable their code'; end if;

  select count(*) into v_count from public.student_vr_access_codes;
  if v_count <> 0 then raise exception 'FAIL: the authenticated role can read student_vr_access_codes directly (% rows)', v_count; end if;

  v_threw := false;
  begin
    perform public.get_vr_student_directory(null);
  exception when insufficient_privilege then
    v_threw := true;
  end;
  if not v_threw then raise exception 'FAIL: the authenticated role can call get_vr_student_directory'; end if;
  v_threw := false;
  begin
    perform public.validate_vr_access_code(v_code);
  exception when insufficient_privilege then
    v_threw := true;
  end;
  if not v_threw then raise exception 'FAIL: the authenticated role can call validate_vr_access_code'; end if;
  raise notice 'PASS: students and non-teaching instructors are refused; client roles cannot read the table or call the headset RPCs';

  -- ---------------------- 7. regeneration: new code, old one dead, same student, version +1
  perform set_config('request.jwt.claims', json_build_object('sub', v_instructor_a::text, 'role', 'authenticated')::text, true);
  select * into v_row from public.regenerate_student_vr_access_code(v_s1);
  v_code2 := v_row.access_code;
  if v_row.student_id <> v_s1 or v_code2 = v_code or v_row.code_version <> 2 or not v_row.enabled then
    raise exception 'FAIL: regenerate did not return a new code at version 2 for the same student';
  end if;

  reset role;
  if exists (select 1 from public.validate_vr_access_code(v_code)) then
    raise exception 'FAIL: the old code still validates after regeneration';
  end if;
  select * into v_row from public.validate_vr_access_code(v_code2);
  if v_row.student_id is distinct from v_s1 or v_row.code_version <> 2 then
    raise exception 'FAIL: the regenerated code does not resolve to the same student id at version 2';
  end if;
  if (select updated_by from public.student_vr_access_codes where student_id = v_s1) <> v_instructor_a then
    raise exception 'FAIL: regeneration did not record which instructor did it';
  end if;
  raise notice 'PASS: regeneration issued a new code (v2), old code invalid, student id unchanged';

  -- repeated regeneration never collides with any live code
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_instructor_a::text, 'role', 'authenticated')::text, true);
  for v_count in 1 .. 50 loop
    perform public.regenerate_student_vr_access_code(v_s1);
  end loop;
  reset role;
  if (select code_version from public.student_vr_access_codes where student_id = v_s1) <> 52 then
    raise exception 'FAIL: 50 more regenerations did not land on version 52';
  end if;
  if (select count(*) from public.student_vr_access_codes) <> (select count(distinct access_code) from public.student_vr_access_codes) then
    raise exception 'FAIL: duplicate codes exist after repeated regeneration';
  end if;
  select access_code into v_code2 from public.student_vr_access_codes where student_id = v_s1;
  raise notice 'PASS: 50 further regenerations - version 52, still no duplicate codes';

  -- ------------------------------------------- 8. directory
  if not exists (select 1 from public.get_vr_student_directory(null) d
                 where d.student_id = v_s1 and d.class_id = v_class and d.access_code = v_code2 and d.enabled and d.code_version = 52) then
    raise exception 'FAIL: the directory does not list the enrolled student with their current code and version';
  end if;
  if exists (select 1 from public.get_vr_student_directory(null) d where d.student_id in (v_s2, v_s3)) then
    raise exception 'FAIL: the directory lists a student who is only in an archived class, or in no class';
  end if;
  if exists (select 1 from public.get_vr_student_directory(v_archived_class)) then
    raise exception 'FAIL: filtering by an archived class returned rows';
  end if;
  if (select count(*) from public.get_vr_student_directory(v_class)) <> 1 then
    raise exception 'FAIL: filtering by the test class did not return exactly its one student';
  end if;
  raise notice 'PASS: directory lists the enrolled student with current code/version; archived and unenrolled excluded; class filter works';

  -- ------------------------------------------- 9. disable / re-enable
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_instructor_a::text, 'role', 'authenticated')::text, true);
  select * into v_row from public.set_student_vr_access_code_enabled(v_s1, false);
  if v_row.enabled or v_row.code_version <> 52 then
    raise exception 'FAIL: disable did not report enabled=false with the version unchanged';
  end if;
  reset role;
  if exists (select 1 from public.validate_vr_access_code(v_code2)) then
    raise exception 'FAIL: a disabled code still validates';
  end if;
  select * into v_row from public.get_vr_student_directory(v_class) d where d.student_id = v_s1;
  if v_row.enabled or v_row.access_code is not null then
    raise exception 'FAIL: the directory did not mark the disabled code (enabled=false, no code)';
  end if;
  if not exists (select 1 from public.profiles where id = v_s1)
     or not exists (select 1 from public.class_enrollments where student_id = v_s1) then
    raise exception 'FAIL: disabling a code removed the student or their enrollment';
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_instructor_a::text, 'role', 'authenticated')::text, true);
  perform public.set_student_vr_access_code_enabled(v_s1, true);
  reset role;
  select * into v_row from public.validate_vr_access_code(v_code2);
  if v_row.student_id is distinct from v_s1 or v_row.code_version <> 52 then
    raise exception 'FAIL: re-enabling did not restore the same code at the same version';
  end if;
  raise notice 'PASS: disabled code refused and marked in the directory without its code; student/enrollment kept; re-enable restores the same code';

  raise notice 'ALL VR ACCESS CODE CHECKS PASSED';
end;
$$;

rollback;
-- ROLLBACK on purpose: nothing this script created (users, profiles, classes,
-- enrollments, codes) survives, and no pre-existing row was changed.
