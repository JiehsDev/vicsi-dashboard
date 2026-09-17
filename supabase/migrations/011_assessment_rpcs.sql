-- 011_assessment_rpcs.sql
--
-- Three SECURITY DEFINER functions, each restricted to service_role only (same
-- revoke-then-grant idiom as upsert_profile in 001_profiles.sql) - the entire
-- read/write surface Route Handlers use to touch the pairing-code/token/session
-- tables. No table in 008/009 has any client-facing write policy; this file is
-- deliberately the ONLY place those tables are ever mutated from application code.
--
-- Error-reporting convention used throughout: RAISE EXCEPTION with a message
-- prefixed by a stable, all-caps error code and a colon (e.g.
-- 'PAIRING_CODE_EXPIRED: code expired at ...'). Postgres exceptions raised this way
-- surface as `error.message` on the Supabase JS client end; the calling Route
-- Handler (src/lib/assessmentErrors.ts) parses the prefix up to the first colon and
-- maps it directly to the matching documented API error code. This keeps the
-- Postgres function as the single source of truth for WHICH error occurred while
-- keeping HTTP-shape concerns (status codes, JSON envelope) entirely in Node.
--
-- Run in the Supabase SQL editor AFTER 010. Safe to re-run (CREATE OR REPLACE).
--
-- TRUST BOUNDARY, load-bearing: every function below is granted to
-- service_role ONLY (see each "revoke all ... grant execute" pair) - anon and
-- authenticated are explicitly revoked, so a compromised anon/publishable key
-- or a student's own authenticated session can never call these functions at
-- all, let alone with attacker-chosen parameters. The identity parameters
-- (p_student_id, p_class_id, etc.) are trusted INSIDE these functions
-- precisely because the only caller that can ever reach them is this
-- project's own server code, which itself derives every identity value from
-- either an authenticated Supabase session (createSupabaseServerClient +
-- auth.getUser(), for the dashboard-facing pairing-code creation call) or a
-- server-resolved bearer token (for the Unity-facing exchange/submission
-- calls) - never from a request body field. These functions cannot
-- independently re-verify that chain (a SECURITY DEFINER function invoked by
-- service_role has no auth.uid() of its own to check against), so that
-- verification is Node's job (see src/app/api/v1/**/route.ts and
-- src/app/pairing/actions.ts) and this comment documents, rather than
-- re-implements, the boundary.

begin;

-- ============================================================================
-- create_pairing_code
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
  -- HMAC-SHA256 hex digest is always exactly 64 characters (see
  -- hmacPairingCodeHash in src/lib/assessmentCrypto.ts) - reject anything
  -- else outright rather than storing a malformed hash that could never
  -- match a real exchange attempt anyway.
  if p_code_hash is null or length(p_code_hash) <> 64 then
    raise exception 'VALIDATION_ERROR: code_hash must be a 64-character hex digest';
  end if;
  -- 15 minutes is a generous upper bound above the 5-minute default
  -- recommendation - caps how long a lost/shoulder-surfed code stays valid
  -- even if a future caller passes a much larger ttl by mistake.
  if p_ttl_seconds is null or p_ttl_seconds <= 0 or p_ttl_seconds > 900 then
    raise exception 'VALIDATION_ERROR: ttl_seconds must be between 1 and 900';
  end if;

  -- Table-qualified "profiles.id" (not bare "id") is required here: this
  -- function's own RETURNS TABLE(id uuid, ...) makes "id" ambiguous between
  -- the OUT parameter and the column otherwise - PL/pgSQL raises "column
  -- reference id is ambiguous" at CALL time (not at CREATE FUNCTION time),
  -- so this only surfaces the first time the function actually runs.
  if not exists (select 1 from public.profiles where profiles.id = p_student_id and role = 'student') then
    raise exception 'VALIDATION_ERROR: % is not a student profile', p_student_id;
  end if;

  if not exists (
    select 1 from public.class_enrollments
    where class_id = p_class_id and student_id = p_student_id
  ) then
    raise exception 'VALIDATION_ERROR: student % is not enrolled in class %', p_student_id, p_class_id;
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

  -- Invalidate the student's older unused codes for the SAME assignment - "the
  -- student's older unused code for the same assignment" is revoked, not deleted,
  -- so the attempt history stays intact for audit.
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

-- ============================================================================
-- consume_pairing_code
--
-- Single-use, concurrency-safe: `select ... for update` takes a row lock on the
-- matched code for the duration of this function call, so a second concurrent
-- call for the SAME code_hash blocks until the first commits - by which point
-- consumed_at is already set, and the second call's own check correctly reports
-- PAIRING_CODE_USED instead of racing the first into a double consumption.
-- ============================================================================
create or replace function public.consume_pairing_code(
  p_code_hash    text,
  p_scenario_id  text
)
returns table (
  student_id      uuid,
  class_id        uuid,
  assignment_id   uuid,
  scenario_id     text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.assessment_pairing_codes%rowtype;
  v_max_attempts constant integer := 5;
begin
  if p_code_hash is null or length(p_code_hash) <> 64 then
    raise exception 'PAIRING_CODE_INVALID: malformed code hash';
  end if;
  if p_scenario_id is null or length(p_scenario_id) = 0 or length(p_scenario_id) > 200 then
    raise exception 'VALIDATION_ERROR: scenario id must be 1-200 characters';
  end if;

  select * into v_row
  from public.assessment_pairing_codes
  where code_hash = p_code_hash
  for update;

  if not found then
    raise exception 'PAIRING_CODE_INVALID: no code matches the supplied hash';
  end if;

  update public.assessment_pairing_codes
  set attempt_count = attempt_count + 1
  where assessment_pairing_codes.id = v_row.id;

  if v_row.attempt_count + 1 > v_max_attempts then
    update public.assessment_pairing_codes set revoked_at = now() where assessment_pairing_codes.id = v_row.id;
    raise exception 'PAIRING_CODE_INVALID: too many attempts against this code';
  end if;

  if v_row.revoked_at is not null then
    raise exception 'PAIRING_CODE_INVALID: code has been revoked';
  end if;

  if v_row.consumed_at is not null then
    raise exception 'PAIRING_CODE_USED: code was already consumed at %', v_row.consumed_at;
  end if;

  if v_row.expires_at < now() then
    raise exception 'PAIRING_CODE_EXPIRED: code expired at %', v_row.expires_at;
  end if;

  if v_row.scenario_id <> p_scenario_id then
    raise exception 'SCENARIO_MISMATCH: code is for scenario %, exchange requested %', v_row.scenario_id, p_scenario_id;
  end if;

  update public.assessment_pairing_codes
  set consumed_at = now()
  where assessment_pairing_codes.id = v_row.id;

  return query select v_row.student_id, v_row.class_id, v_row.assignment_id, v_row.scenario_id;
end;
$$;

revoke all on function public.consume_pairing_code(text, text) from public, anon, authenticated;
grant execute on function public.consume_pairing_code(text, text) to service_role;

-- ============================================================================
-- submit_assessment_session
--
-- Atomicity is free here: a Postgres function body runs inside the transaction of
-- its calling statement, so ANY exception raised below (including one from a
-- failed insert, a violated constraint, or an explicit RAISE) rolls back every
-- change this function made, automatically - no manual BEGIN/COMMIT/ROLLBACK
-- needed, and no partial session (a summary row with missing child rows) can ever
-- be left behind. See the Route Handler for how a rolled-back call surfaces.
-- ============================================================================
create or replace function public.submit_assessment_session(
  p_token_hash    text,
  p_payload       jsonb,
  p_payload_hash  text
)
returns table (
  receipt_id  uuid,
  session_id  text,
  duplicate   boolean,
  verification_status text,
  server_received_at_utc timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token public.assessment_tokens%rowtype;
  v_session_id text;
  v_existing public.assessment_sessions%rowtype;
  v_new_receipt uuid;
  v_now timestamptz := now();
  v_evidence jsonb;
  v_report_line jsonb;
  v_violation jsonb;
  v_relationship jsonb;
  v_hypothesis jsonb;
  v_event jsonb;
  -- Defense-in-depth mirrors of the limits the Route Handler already enforces
  -- (MAX_EVENTS_PER_REQUEST in src/app/api/v1/assessment-sessions/route.ts) -
  -- this function is the LAST line of defense against an unbounded payload,
  -- since it's the only place that can never be bypassed by a Node-side bug.
  v_max_child_rows constant integer := 5000;
  v_max_events constant integer := 20000;
begin
  if p_token_hash is null or length(p_token_hash) <> 64 then
    raise exception 'TOKEN_INVALID: malformed token hash';
  end if;
  if p_payload_hash is null or length(p_payload_hash) <> 64 then
    raise exception 'VALIDATION_ERROR: malformed payload hash';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'VALIDATION_ERROR: payload must be a JSON object';
  end if;
  if jsonb_array_length(coalesce(p_payload->'evidenceResults', '[]'::jsonb)) > v_max_child_rows
    or jsonb_array_length(coalesce(p_payload->'reportLineResults', '[]'::jsonb)) > v_max_child_rows
    or jsonb_array_length(coalesce(p_payload->'proceduralViolations', '[]'::jsonb)) > v_max_child_rows
    or jsonb_array_length(coalesce(p_payload->'relationshipResults', '[]'::jsonb)) > v_max_child_rows
    or jsonb_array_length(coalesce(p_payload->'hypothesisResults', '[]'::jsonb)) > v_max_child_rows
  then
    raise exception 'VALIDATION_ERROR: one or more result arrays exceed % rows', v_max_child_rows;
  end if;
  if jsonb_array_length(coalesce(p_payload->'orderedEvents', '[]'::jsonb)) > v_max_events then
    raise exception 'EVENT_LIMIT_EXCEEDED: orderedEvents exceeds % rows', v_max_events;
  end if;

  select * into v_token
  from public.assessment_tokens
  where token_hash = p_token_hash
  for update;

  if not found then
    raise exception 'TOKEN_INVALID: no token matches the supplied hash';
  end if;
  if v_token.revoked_at is not null then
    raise exception 'TOKEN_INVALID: token has been revoked';
  end if;
  if v_token.expires_at < v_now then
    raise exception 'TOKEN_EXPIRED: token expired at %', v_token.expires_at;
  end if;

  v_session_id := p_payload->>'sessionId';
  if v_session_id is null or length(v_session_id) = 0 or length(v_session_id) > 200 then
    raise exception 'VALIDATION_ERROR: payload.sessionId is required and must be at most 200 characters';
  end if;

  update public.assessment_tokens set last_used_at = v_now where id = v_token.id;

  -- Table-qualified "assessment_sessions.session_id" (not bare "session_id")
  -- is required - this function's own RETURNS TABLE(..., session_id text,
  -- ...) makes bare "session_id" ambiguous otherwise (same class of bug as
  -- create_pairing_code's "id" - see that function's own comment).
  select * into v_existing from public.assessment_sessions where assessment_sessions.session_id = v_session_id;

  if found then
    if v_existing.payload_hash = p_payload_hash then
      return query select v_existing.receipt_id, v_existing.session_id, true,
        v_existing.verification_status, v_existing.server_received_at_utc;
      return;
    else
      raise exception 'SESSION_PAYLOAD_CONFLICT: session % already submitted with a different payload', v_session_id;
    end if;
  end if;

  -- Identity/scope come from the TOKEN, never from the payload - the payload's own
  -- studentId/classId fields (AssessmentSessionUploadDto.studentId/classId) are
  -- informational-only by design (see that DTO's own class comment) and are never
  -- read here at all.
  insert into public.assessment_sessions (
    session_id, student_id, class_id, assignment_id, scenario_id,
    scenario_version, scoring_rules_version, ground_truth_version,
    payload_version, payload_hash, client_version,
    started_at_utc, completed_at_utc, duration_seconds,
    selected_conclusion_id, resolved_ending_id,
    has_client_reported_scores,
    client_relationships_correct, client_relationships_incorrect,
    client_objectives_completed, client_objectives_failed, client_procedural_violation_count
  ) values (
    v_session_id, v_token.student_id, v_token.class_id, v_token.assignment_id, v_token.scenario_id,
    p_payload->>'scenarioVersion', p_payload->>'scoringRulesVersion', p_payload->>'groundTruthVersion',
    (p_payload->>'payloadVersion')::integer, p_payload_hash, p_payload->>'clientVersion',
    nullif(p_payload->>'startedAtUtc', '')::timestamptz, nullif(p_payload->>'completedAtUtc', '')::timestamptz,
    (p_payload->>'durationSeconds')::double precision,
    nullif(p_payload->>'selectedConclusionId', ''), nullif(p_payload->>'resolvedEndingId', ''),
    coalesce((p_payload->>'hasClientReportedScores')::boolean, false),
    (p_payload->'clientReportedScores'->>'relationshipsCompletedCorrect')::integer,
    (p_payload->'clientReportedScores'->>'relationshipsCompletedIncorrect')::integer,
    (p_payload->'clientReportedScores'->>'objectivesCompleted')::integer,
    (p_payload->'clientReportedScores'->>'objectivesFailed')::integer,
    (p_payload->'clientReportedScores'->>'proceduralViolationCount')::integer
  )
  returning assessment_sessions.receipt_id into v_new_receipt;

  for v_evidence in select * from jsonb_array_elements(coalesce(p_payload->'evidenceResults', '[]'::jsonb))
  loop
    insert into public.session_evidence_results
      (session_id, evidence_id, final_status, swabbing_done, fingerprinting_done, is_flipped, fingerprint_lab_status, tent_number, tent_letter)
    values (
      v_session_id, v_evidence->>'evidenceId', v_evidence->>'finalStatus',
      coalesce((v_evidence->>'swabbingDone')::boolean, false),
      coalesce((v_evidence->>'fingerprintingDone')::boolean, false),
      coalesce((v_evidence->>'isFlipped')::boolean, false),
      v_evidence->>'fingerprintLabStatus',
      nullif(v_evidence->>'tentNumber', '0')::integer,
      nullif(v_evidence->>'tentLetter', '')
    );
  end loop;

  for v_report_line in select * from jsonb_array_elements(coalesce(p_payload->'reportLineResults', '[]'::jsonb))
  loop
    insert into public.session_report_lines (session_id, evidence_id, line_id)
    values (v_session_id, v_report_line->>'evidenceId', v_report_line->>'lineId');
  end loop;

  for v_violation in select * from jsonb_array_elements(coalesce(p_payload->'proceduralViolations', '[]'::jsonb))
  loop
    insert into public.session_procedure_violations (session_id, event_type, target_id, timestamp_ms, detail)
    values (
      v_session_id, v_violation->>'eventType', v_violation->>'targetId',
      (v_violation->>'timestampMs')::bigint, v_violation->>'detail'
    );
  end loop;

  for v_relationship in select * from jsonb_array_elements(coalesce(p_payload->'relationshipResults', '[]'::jsonb))
  loop
    insert into public.session_relationships (session_id, relationship_id, source_id, target_id, relationship_type, state, was_ever_selected)
    values (
      v_session_id, v_relationship->>'relationshipId', v_relationship->>'sourceId', v_relationship->>'targetId',
      v_relationship->>'relationshipType', v_relationship->>'state',
      coalesce((v_relationship->>'wasEverSelected')::boolean, false)
    );
  end loop;

  for v_hypothesis in select * from jsonb_array_elements(coalesce(p_payload->'hypothesisResults', '[]'::jsonb))
  loop
    insert into public.session_hypotheses (session_id, checkpoint_id, selected_option_id, reasoning_option_id)
    values (
      v_session_id, v_hypothesis->>'checkpointId', v_hypothesis->>'selectedOptionId',
      nullif(v_hypothesis->>'reasoningOptionId', '')
    );
  end loop;

  for v_event in select * from jsonb_array_elements(coalesce(p_payload->'orderedEvents', '[]'::jsonb))
  loop
    insert into public.session_events (session_id, sequence_number, timestamp_ms, event_type, target_id, payload)
    values (
      v_session_id, (v_event->>'sequenceNumber')::integer, (v_event->>'timestampMs')::bigint,
      v_event->>'eventType', v_event->>'targetId', coalesce(v_event->'payload', '[]'::jsonb)
    );
  end loop;

  return query select v_new_receipt, v_session_id, false, 'pending_verification'::text, v_now;
end;
$$;

revoke all on function public.submit_assessment_session(text, jsonb, text) from public, anon, authenticated;
grant execute on function public.submit_assessment_session(text, jsonb, text) to service_role;

commit;
