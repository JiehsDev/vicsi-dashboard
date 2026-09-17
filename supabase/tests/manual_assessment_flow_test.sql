-- supabase/tests/manual_assessment_flow_test.sql
--
-- NOT a migration - do not run this against production, and do not add it to
-- the numbered migrations sequence. Run manually (Supabase SQL editor, or
-- `psql -f`) against a DEVELOPMENT project only, AFTER migrations 006-012
-- have been applied and the minimum dev dataset (one test class, one test
-- assignment 'TEST-ASSIGNMENT-1', two test students) exists - see the
-- completion report's "minimum development data" section for exact ids this
-- script expects, OR edit the `v_student_a`/`v_student_b`/`v_class`/
-- `v_assignment`/`v_scenario` variables below to point at whatever dev ids
-- you actually seeded.
--
-- Each check either passes silently (a RAISE NOTICE) or ABORTS THE WHOLE
-- SCRIPT with a clear exception - there is no "N passed, 1 failed" summary
-- line, by design: a mid-script failure is easiest to diagnose by reading
-- exactly how far the script got before it raised.
--
-- Cleans up everything it creates at the end, in its own transaction, so a
-- clean run leaves the dev database exactly as it found it.

begin;

do $$
declare
  v_student_a uuid; -- set to an existing dev 'student-a@...' profile id
  v_student_b uuid; -- set to an existing dev 'student-b@...' profile id
  v_class uuid;      -- set to an existing dev test class id
  v_assignment uuid; -- set to an existing dev active test assignment id
  v_scenario text := 'CSI-ENVIRONMENT-001';

  v_code_hash text := encode(sha256('manual-test-code-hash-placeholder'::bytea), 'hex'); -- stand-in HMAC digest, real hashing happens in Node
  v_pairing_id uuid;
  v_expires_at timestamptz;

  v_identity record;
  v_token_hash text := encode(sha256('manual-test-token-hash-placeholder'::bytea), 'hex');

  v_session_id text := 'manual-test-session-' || gen_random_uuid()::text;
  v_payload jsonb;
  v_bad_payload jsonb;
  v_result record;
  v_threw boolean;
begin
  -- Targets the dev-only seeded rows specifically (student_id 2099-000xx,
  -- see supabase/seed/seed-assessment-dev-data.mjs) rather than "any student"
  -- - an arbitrary pre-existing student/class pairing may not actually be
  -- enrolled in each other, which would fail this script's setup for a
  -- reason that has nothing to do with what it's actually testing.
  select id into v_student_a from public.profiles where role = 'student' and student_id = '2099-00001';
  select id into v_student_b from public.profiles where role = 'student' and student_id = '2099-00002';
  select id into v_class from public.classes where name = 'ViCSI Dev Test Class';
  select id into v_assignment from public.assessment_assignments where scenario_id = v_scenario and is_active and class_id = v_class;

  if v_student_a is null or v_class is null or v_assignment is null then
    raise exception 'SETUP: no dev student/class/active assignment found - seed minimum dev data first (see completion report section 9)';
  end if;

  raise notice 'Using student_a=%, class=%, assignment=%', v_student_a, v_class, v_assignment;

  -- --- 1. create_pairing_code + consume_pairing_code round trip ---
  select id, expires_at into v_pairing_id, v_expires_at
    from public.create_pairing_code(v_student_a, v_class, v_assignment, v_scenario, v_code_hash, 300);
  if v_pairing_id is null then
    raise exception 'FAIL: create_pairing_code did not return a row';
  end if;
  raise notice 'PASS: create_pairing_code created %', v_pairing_id;

  select * into v_identity from public.consume_pairing_code(v_code_hash, v_scenario);
  if v_identity.student_id <> v_student_a then
    raise exception 'FAIL: consume_pairing_code resolved the wrong student';
  end if;
  raise notice 'PASS: consume_pairing_code resolved student %', v_identity.student_id;

  -- --- 2. Code reuse fails (PAIRING_CODE_USED) ---
  v_threw := false;
  begin
    perform public.consume_pairing_code(v_code_hash, v_scenario);
  exception when others then
    v_threw := true;
    if sqlerrm not like 'PAIRING_CODE_USED:%' then
      raise exception 'FAIL: reused code raised the wrong error: %', sqlerrm;
    end if;
  end;
  if not v_threw then
    raise exception 'FAIL: reusing a consumed pairing code did not raise';
  end if;
  raise notice 'PASS: reusing a consumed code correctly raises PAIRING_CODE_USED';

  -- --- 3. Mint a token the way the exchange route would, then submit a session ---
  insert into public.assessment_tokens (token_hash, student_id, class_id, assignment_id, scenario_id, expires_at)
  values (v_token_hash, v_student_a, v_class, v_assignment, v_scenario, now() + interval '4 hours');

  v_payload := jsonb_build_object(
    'payloadVersion', 1,
    'sessionId', v_session_id,
    'scenarioId', v_scenario,
    'scenarioVersion', '1.0.0',
    'scoringRulesVersion', '1.0.0',
    'startedAtUtc', now()::text,
    'completedAtUtc', now()::text,
    'durationSeconds', 120.5,
    'evidenceResults', jsonb_build_array(jsonb_build_object('evidenceId', 'EVD-1', 'finalStatus', 'Processed')),
    'orderedEvents', jsonb_build_array(jsonb_build_object('sequenceNumber', 0, 'timestampMs', 0, 'eventType', 'SessionStarted'))
  );

  select * into v_result from public.submit_assessment_session(
    v_token_hash, v_payload, encode(sha256(v_payload::text::bytea), 'hex')
  );
  if v_result.duplicate then
    raise exception 'FAIL: first submission was reported as a duplicate';
  end if;
  raise notice 'PASS: first submission accepted, receipt=%', v_result.receipt_id;

  if (select count(*) from public.session_evidence_results where session_id = v_session_id) <> 1 then
    raise exception 'FAIL: expected exactly 1 evidence child row';
  end if;
  raise notice 'PASS: child row (session_evidence_results) inserted';

  -- --- 4. Identical resubmission returns duplicate:true with the SAME receipt ---
  select * into v_result from public.submit_assessment_session(
    v_token_hash, v_payload, encode(sha256(v_payload::text::bytea), 'hex')
  );
  if not v_result.duplicate then
    raise exception 'FAIL: identical resubmission was not reported as a duplicate';
  end if;
  raise notice 'PASS: identical resubmission returns duplicate:true, receipt=%', v_result.receipt_id;

  -- --- 5. Conflicting resubmission (same sessionId, different payload) raises SESSION_PAYLOAD_CONFLICT ---
  v_threw := false;
  begin
    perform public.submit_assessment_session(
      v_token_hash,
      v_payload || jsonb_build_object('durationSeconds', 999.9),
      encode(sha256((v_payload || jsonb_build_object('durationSeconds', 999.9))::text::bytea), 'hex')
    );
  exception when others then
    v_threw := true;
    if sqlerrm not like 'SESSION_PAYLOAD_CONFLICT:%' then
      raise exception 'FAIL: conflicting resubmission raised the wrong error: %', sqlerrm;
    end if;
  end;
  if not v_threw then
    raise exception 'FAIL: conflicting resubmission did not raise';
  end if;
  raise notice 'PASS: conflicting resubmission correctly raises SESSION_PAYLOAD_CONFLICT';

  -- --- 6. Rollback on invalid child: a malformed timestampMs aborts the WHOLE submission ---
  v_bad_payload := jsonb_build_object(
    'payloadVersion', 1,
    'sessionId', v_session_id || '-rollback',
    'scenarioId', v_scenario,
    'scenarioVersion', '1.0.0',
    'scoringRulesVersion', '1.0.0',
    'evidenceResults', jsonb_build_array(jsonb_build_object('evidenceId', 'EVD-1', 'finalStatus', 'Processed')),
    'orderedEvents', jsonb_build_array(jsonb_build_object('sequenceNumber', 0, 'timestampMs', 'not-a-number', 'eventType', 'SessionStarted'))
  );
  v_threw := false;
  begin
    perform public.submit_assessment_session(
      v_token_hash, v_bad_payload, encode(sha256(v_bad_payload::text::bytea), 'hex')
    );
  exception when others then
    v_threw := true; -- expected: casting 'not-a-number'::bigint fails
  end;
  if not v_threw then
    raise exception 'FAIL: malformed child payload did not raise';
  end if;
  if exists (select 1 from public.assessment_sessions where session_id = v_session_id || '-rollback') then
    raise exception 'FAIL: a session row was left behind after a rolled-back submission - PARTIAL WRITE, atomicity is broken';
  end if;
  if exists (select 1 from public.session_evidence_results where session_id = v_session_id || '-rollback') then
    raise exception 'FAIL: a child row was left behind after a rolled-back submission - PARTIAL WRITE, atomicity is broken';
  end if;
  raise notice 'PASS: a failed child insert rolls back the entire submission (no orphan session or child rows)';

  -- --- 7. Event sequence numbers remain ordered / unique per session ---
  if (select count(*) from public.session_events where session_id = v_session_id) <>
     (select count(distinct sequence_number) from public.session_events where session_id = v_session_id) then
    raise exception 'FAIL: duplicate sequence_number values for one session';
  end if;
  raise notice 'PASS: session_events.sequence_number values are unique per session';

  raise notice '=== ALL CHECKS PASSED ===';
end $$;

-- No manual cleanup needed - ROLLBACK below reverts every insert this script
-- made (the pairing code, the token, the session and its child rows),
-- regardless of which checks passed, leaving the dev database exactly as it
-- was found.
rollback;
