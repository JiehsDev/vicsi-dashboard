-- supabase/tests/manual_vr_upload_tokens_test.sql
--
-- NOT a migration. Run manually (SQL editor / psql -f) against a DEVELOPMENT
-- project only, AFTER 018 and 019. Self-contained and ends in ROLLBACK: creates its
-- own instructor, students, class, scenario and assignment; nothing survives.
--
-- Exercises issue_vr_upload_token (019) and then the REAL, unchanged
-- submit_assessment_session (011) with the tokens it issues - i.e. that a session
-- uploaded through the VR bridge is stored under its original owner, with the
-- token's class/assignment, idempotently, and that ownership can never move.
--
-- Each check RAISEs NOTICE 'PASS: ...' or aborts with 'FAIL: ...'.

begin;

do $$
declare
  v_instructor uuid := gen_random_uuid();
  v_juan uuid := gen_random_uuid();
  v_maria uuid := gen_random_uuid();
  v_ben uuid := gen_random_uuid();     -- code disabled mid-test
  v_zed uuid := gen_random_uuid();     -- has no VR code
  v_lone uuid := gen_random_uuid();    -- enrolled nowhere
  v_class uuid;
  v_class_b uuid;
  v_assignment uuid;
  v_assignment_b uuid;
  v_s1 text := gen_random_uuid()::text;
  v_s2 text := gen_random_uuid()::text;
  v_s3 text := gen_random_uuid()::text;
  v_scenario text := 'VR-TOKEN-TEST-SCENARIO';
  v_hash1 text := encode(extensions.digest('token-one', 'sha256'), 'hex');
  v_hash2 text := encode(extensions.digest('token-two', 'sha256'), 'hex');
  v_hash3 text := encode(extensions.digest('token-three', 'sha256'), 'hex');
  v_hash4 text := encode(extensions.digest('token-four', 'sha256'), 'hex');
  v_hashx text;
  v_row record;
  v_tok public.assessment_tokens%rowtype;
  v_payload jsonb;
  v_disabled_at timestamptz;
  v_threw text;
begin
  -- ------------------------------------------------------------------ setup
  insert into auth.users (id, email) values
    (v_instructor, 'vr-upload-test-instructor@test.traceboard.invalid'),
    (v_juan, '2099-92001@students.traceboard.internal'),
    (v_maria, '2099-92002@students.traceboard.internal'),
    (v_ben, '2099-92003@students.traceboard.internal'),
    (v_zed, '2099-92004@students.traceboard.internal'),
    (v_lone, '2099-92005@students.traceboard.internal');
  perform public.upsert_profile(v_instructor, 'instructor', 'VR Upload Test Instructor');
  perform public.upsert_profile(v_juan, 'student', 'Juan Test', '2099-92001', 'A', '1234');
  perform public.upsert_profile(v_maria, 'student', 'Maria Test', '2099-92002', 'A', '1234');
  perform public.upsert_profile(v_ben, 'student', 'Ben Test', '2099-92003', 'A', '1234');
  perform public.upsert_profile(v_zed, 'student', 'Zed Test', '2099-92004', 'A', '1234');
  perform public.upsert_profile(v_lone, 'student', 'Lone Test', '2099-92005', 'A', '1234');
  delete from public.student_vr_access_codes where student_id = v_zed;

  insert into public.scenarios (scenario_id, display_name, scenario_version, scoring_rules_version, ground_truth_version)
  values (v_scenario, 'VR token test', '1.0.0', '1.0.0', '1.0.0');
  insert into public.classes (name, section, instructor_id) values ('VR Upload Test A', 'A', v_instructor) returning id into v_class;
  insert into public.classes (name, section, instructor_id) values ('VR Upload Test B', 'B', v_instructor) returning id into v_class_b;
  insert into public.class_enrollments (class_id, student_id) values
    (v_class, v_juan), (v_class, v_maria), (v_class, v_ben), (v_class, v_zed), (v_class_b, v_juan);
  insert into public.assessment_assignments (class_id, scenario_id, title, is_active, created_by)
    values (v_class, v_scenario, 'Active A', true, v_instructor) returning id into v_assignment;
  insert into public.assessment_assignments (class_id, scenario_id, title, is_active, created_by, created_at)
    values (v_class_b, v_scenario, 'Old B', false, v_instructor, now() - interval '30 days') returning id into v_assignment_b;

  v_payload := jsonb_build_object(
    'payloadVersion', 1, 'sessionId', v_s1, 'scenarioVersion', '1.0.0', 'scoringRulesVersion', '1.0.0',
    'studentId', 'informational only - must be ignored', 'evidenceResults', '[]'::jsonb, 'orderedEvents', '[]'::jsonb);

  -- ------------------------------------------- 1. issue for the session's owner
  select * into v_row from public.issue_vr_upload_token(v_juan, v_s1, v_scenario, null, false, now() - interval '20 minutes', v_hash1, 600);
  select * into v_tok from public.assessment_tokens where token_hash = v_hash1;
  if v_row.assignment_id <> v_assignment or v_row.class_id <> v_class
     or v_tok.student_id <> v_juan or v_tok.purpose <> 'vr_session_upload' or v_tok.bound_session_id <> v_s1
     or v_tok.is_test_session or v_tok.expires_at > now() + interval '601 seconds' or v_tok.expires_at < now() + interval '590 seconds' then
    raise exception 'FAIL: issued token row is not a 10-minute vr_session_upload token bound to S1 for Juan with the active assignment';
  end if;
  raise notice 'PASS: token issued for Juan, bound to S1, 10 min, active assignment in his class';

  -- ------------------------------------------- 2. the REAL submit stores it under Juan
  select * into v_row from public.submit_assessment_session(v_hash1, v_payload, encode(extensions.digest(v_payload::text, 'sha256'), 'hex'));
  if v_row.duplicate or (select student_id from public.assessment_sessions where session_id = v_s1) <> v_juan
     or (select assignment_id from public.assessment_sessions where session_id = v_s1) <> v_assignment then
    raise exception 'FAIL: submit with the VR token did not store S1 under Juan with the token''s assignment';
  end if;
  raise notice 'PASS: unchanged submit_assessment_session stored S1 under Juan (payload studentId ignored)';

  -- ------------------------------------------- 3. ownership can never move
  v_threw := null;
  begin
    perform public.issue_vr_upload_token(v_maria, v_s1, v_scenario, null, false, now(), v_hash2, 600);
  exception when others then v_threw := sqlerrm; end;
  if v_threw is null or v_threw not like 'SESSION_OWNER_MISMATCH:%' then
    raise exception 'FAIL: a token for Maria was issued for Juan''s stored session (%).', v_threw;
  end if;
  raise notice 'PASS: a token for another student on an already-stored session is refused (SESSION_OWNER_MISMATCH)';

  -- ------------------------------------------- 4. re-upload by the same owner is idempotent
  perform public.issue_vr_upload_token(v_juan, v_s1, v_scenario, null, false, now() - interval '20 minutes', v_hash2, 600);
  select * into v_row from public.submit_assessment_session(v_hash2, v_payload, encode(extensions.digest(v_payload::text, 'sha256'), 'hex'));
  if not v_row.duplicate or (select count(*) from public.assessment_sessions where session_id = v_s1) <> 1 then
    raise exception 'FAIL: re-uploading the same session with a fresh token was not an idempotent duplicate';
  end if;
  raise notice 'PASS: fresh token + same payload -> duplicate, still one row';

  -- ------------------------------------------- 5. expired token -> TOKEN_EXPIRED, fresh token works
  perform public.issue_vr_upload_token(v_juan, v_s2, v_scenario, null, false, now() - interval '5 minutes', v_hash3, 600);
  update public.assessment_tokens set expires_at = now() - interval '1 second' where token_hash = v_hash3;
  v_payload := jsonb_set(v_payload, '{sessionId}', to_jsonb(v_s2));
  v_threw := null;
  begin
    perform public.submit_assessment_session(v_hash3, v_payload, encode(extensions.digest(v_payload::text, 'sha256'), 'hex'));
  exception when others then v_threw := sqlerrm; end;
  if v_threw is null or v_threw not like 'TOKEN_EXPIRED:%' then
    raise exception 'FAIL: an expired VR token was accepted (%)', v_threw;
  end if;
  perform public.issue_vr_upload_token(v_juan, v_s2, v_scenario, null, false, now() - interval '5 minutes', v_hash4, 600);
  select * into v_row from public.submit_assessment_session(v_hash4, v_payload, encode(extensions.digest(v_payload::text, 'sha256'), 'hex'));
  if (select student_id from public.assessment_sessions where session_id = v_s2) <> v_juan then
    raise exception 'FAIL: the retry with a fresh token did not store S2 under Juan';
  end if;
  raise notice 'PASS: expired token refused (TOKEN_EXPIRED); a fresh token uploads the same session under Juan';

  -- ------------------------------------------- 6. class hint, closed assignments
  v_hashx := encode(extensions.digest('hint', 'sha256'), 'hex');
  select * into v_row from public.issue_vr_upload_token(v_juan, v_s3, v_scenario, v_class_b, false, now(), v_hashx, 600);
  if v_row.class_id <> v_class_b or v_row.assignment_id <> v_assignment_b then
    raise exception 'FAIL: the recorded class hint was not preferred';
  end if;
  update public.assessment_assignments set is_active = false where id = v_assignment;
  v_hashx := encode(extensions.digest('closed', 'sha256'), 'hex');
  select * into v_row from public.issue_vr_upload_token(v_maria, gen_random_uuid()::text, v_scenario, null, false, now() - interval '1 day', v_hashx, 600);
  if v_row.assignment_id <> v_assignment then
    raise exception 'FAIL: a session completed before its assignment closed could not get a token';
  end if;
  update public.assessment_assignments set is_active = true where id = v_assignment;
  raise notice 'PASS: class hint preferred; a closed assignment still accepts a completed session';

  -- ------------------------------------------- 7. disabled-code policy
  update public.student_vr_access_codes set disabled_at = now() - interval '1 hour' where student_id = v_ben;
  v_disabled_at := now() - interval '1 hour';
  v_hashx := encode(extensions.digest('ben-before', 'sha256'), 'hex');
  perform public.issue_vr_upload_token(v_ben, gen_random_uuid()::text, v_scenario, null, false, v_disabled_at - interval '30 minutes', v_hashx, 600);
  v_threw := null;
  begin
    perform public.issue_vr_upload_token(v_ben, gen_random_uuid()::text, v_scenario, null, false, now(), encode(extensions.digest('ben-after', 'sha256'), 'hex'), 600);
  exception when others then v_threw := sqlerrm; end;
  if v_threw is null or v_threw not like 'STUDENT_DISABLED:%' then
    raise exception 'FAIL: a session started after the code was disabled got a token (%)', v_threw;
  end if;
  v_threw := null;
  begin
    perform public.issue_vr_upload_token(v_ben, gen_random_uuid()::text, v_scenario, null, false, null, encode(extensions.digest('ben-null', 'sha256'), 'hex'), 600);
  exception when others then v_threw := sqlerrm; end;
  if v_threw is null or v_threw not like 'STUDENT_DISABLED:%' then
    raise exception 'FAIL: a disabled student with no session start time got a token';
  end if;
  raise notice 'PASS: disabled code - work started BEFORE disabling still uploads; newer/undated sessions refused';

  -- ------------------------------------------- 8. regenerating a code changes nothing about uploads/ownership
  update public.student_vr_access_codes set access_code = public.generate_vr_access_code(), code_version = code_version + 1 where student_id = v_juan;
  v_hashx := encode(extensions.digest('after-regen', 'sha256'), 'hex');
  perform public.issue_vr_upload_token(v_juan, gen_random_uuid()::text, v_scenario, null, false, now(), v_hashx, 600);
  if (select student_id from public.assessment_sessions where session_id = v_s1) <> v_juan then
    raise exception 'FAIL: regenerating the code moved an existing session';
  end if;
  raise notice 'PASS: after regeneration Juan still gets tokens and his stored sessions are unchanged';

  -- ------------------------------------------- 9. refusals
  v_threw := null;
  begin perform public.issue_vr_upload_token(v_zed, gen_random_uuid()::text, v_scenario, null, false, now(), encode(extensions.digest('z', 'sha256'), 'hex'), 600);
  exception when others then v_threw := sqlerrm; end;
  if v_threw not like 'STUDENT_NOT_PERMITTED:%' then raise exception 'FAIL: student without a VR code got a token (%)', v_threw; end if;
  v_threw := null;
  begin perform public.issue_vr_upload_token(gen_random_uuid(), gen_random_uuid()::text, v_scenario, null, false, now(), encode(extensions.digest('u', 'sha256'), 'hex'), 600);
  exception when others then v_threw := sqlerrm; end;
  if v_threw not like 'STUDENT_NOT_FOUND:%' then raise exception 'FAIL: unknown student got a token (%)', v_threw; end if;
  v_threw := null;
  begin perform public.issue_vr_upload_token(v_instructor, gen_random_uuid()::text, v_scenario, null, false, now(), encode(extensions.digest('i', 'sha256'), 'hex'), 600);
  exception when others then v_threw := sqlerrm; end;
  if v_threw not like 'STUDENT_NOT_FOUND:%' then raise exception 'FAIL: an instructor id got a token (%)', v_threw; end if;
  v_threw := null;
  begin perform public.issue_vr_upload_token(v_lone, gen_random_uuid()::text, v_scenario, null, false, now(), encode(extensions.digest('l', 'sha256'), 'hex'), 600);
  exception when others then v_threw := sqlerrm; end;
  if v_threw not like 'NO_ASSIGNMENT:%' then raise exception 'FAIL: a student with no assignment got a token (%)', v_threw; end if;
  v_threw := null;
  begin perform public.issue_vr_upload_token(v_juan, 'not-a-uuid', v_scenario, null, false, now(), encode(extensions.digest('b', 'sha256'), 'hex'), 600);
  exception when others then v_threw := sqlerrm; end;
  if v_threw not like 'VALIDATION_ERROR:%' then raise exception 'FAIL: malformed session id accepted (%)', v_threw; end if;
  v_threw := null;
  begin perform public.issue_vr_upload_token(v_juan, gen_random_uuid()::text, 'NO-SUCH-SCENARIO', null, false, now(), encode(extensions.digest('s', 'sha256'), 'hex'), 600);
  exception when others then v_threw := sqlerrm; end;
  if v_threw not like 'VALIDATION_ERROR:%' then raise exception 'FAIL: unknown scenario accepted (%)', v_threw; end if;
  v_threw := null;
  begin perform public.issue_vr_upload_token(v_juan, gen_random_uuid()::text, v_scenario, null, false, now(), encode(extensions.digest('t', 'sha256'), 'hex'), 86400);
  exception when others then v_threw := sqlerrm; end;
  if v_threw not like 'VALIDATION_ERROR:%' then raise exception 'FAIL: a day-long VR token was issued (%)', v_threw; end if;
  raise notice 'PASS: no-VR-code, unknown, instructor, unassigned, malformed id, unknown scenario, over-long ttl all refused';

  -- ------------------------------------------- 10. test-session flag carried on the token
  v_hashx := encode(extensions.digest('test-mode', 'sha256'), 'hex');
  perform public.issue_vr_upload_token(v_maria, gen_random_uuid()::text, v_scenario, null, true, now(), v_hashx, 600);
  if not (select is_test_session from public.assessment_tokens where token_hash = v_hashx) then
    raise exception 'FAIL: isTestSession was not recorded on the token';
  end if;
  raise notice 'PASS: test-session flag recorded on the token (the upload route copies it to the session)';

  -- ------------------------------------------- 11. legacy pairing tokens unchanged; constraint holds
  insert into public.assessment_tokens (token_hash, student_id, class_id, assignment_id, scenario_id, expires_at)
  values (encode(extensions.digest('legacy', 'sha256'), 'hex'), v_maria, v_class, v_assignment, v_scenario, now() + interval '4 hours');
  if (select purpose from public.assessment_tokens where token_hash = encode(extensions.digest('legacy', 'sha256'), 'hex')) <> 'pairing'
     or (select bound_session_id from public.assessment_tokens where token_hash = encode(extensions.digest('legacy', 'sha256'), 'hex')) is not null then
    raise exception 'FAIL: a pairing-style insert did not default to purpose=pairing, unbound';
  end if;
  v_threw := null;
  begin
    insert into public.assessment_tokens (token_hash, student_id, class_id, assignment_id, scenario_id, expires_at, purpose)
    values (encode(extensions.digest('unbound', 'sha256'), 'hex'), v_maria, v_class, v_assignment, v_scenario, now() + interval '1 hour', 'vr_session_upload');
  exception when check_violation then v_threw := 'blocked'; end;
  if v_threw is null then raise exception 'FAIL: an unbound vr_session_upload token could be stored'; end if;
  raise notice 'PASS: pairing tokens default to purpose=pairing/unbound; an unbound VR upload token cannot exist';

  -- ------------------------------------------- 12. client roles cannot call it
  set local role authenticated;
  v_threw := null;
  begin
    perform public.issue_vr_upload_token(v_juan, gen_random_uuid()::text, v_scenario, null, false, now(), encode(extensions.digest('auth', 'sha256'), 'hex'), 600);
  exception when insufficient_privilege then v_threw := 'denied'; end;
  reset role;
  if v_threw is null then raise exception 'FAIL: the authenticated role can mint upload tokens'; end if;
  raise notice 'PASS: only service_role (the device-authenticated route) can mint upload tokens';

  raise notice 'ALL VR UPLOAD TOKEN CHECKS PASSED';
end;
$$;

rollback;
