-- 017_session_findings_insights.sql
--
-- Adds the two child tables AssessmentSessionUploadDto gained after 009/011 were
-- written: confirmedFindingIds / unlockedInsightIds (see
-- Assets/_Project/Scripts/Assessment/AssessmentSessionUploadDto.cs in the Unity
-- repo — added alongside the ViCSI Findings/Insights reasoning layer). Both are
-- plain string arrays in the payload (stable ids only, never a display name),
-- unlike every other array on the DTO which holds objects — hence
-- jsonb_array_elements_text below rather than jsonb_array_elements.
--
-- Purely additive: no existing table, column, or policy from 009/010/011 is
-- altered. Same shape as session_relationships/session_hypotheses (009), same
-- RLS pattern as the other seven child tables (010), same CREATE OR REPLACE
-- extension of submit_assessment_session already used by every migration since
-- 011 that has touched it.
--
-- Run in the Supabase SQL editor AFTER 016. Safe to re-run.

begin;

create table if not exists public.session_findings (
  id            bigint generated always as identity primary key,
  session_id    text not null references public.assessment_sessions (session_id) on delete cascade,
  finding_id    text not null,
  unique (session_id, finding_id)
);
create index if not exists session_findings_session_id_idx on public.session_findings (session_id);

create table if not exists public.session_insights (
  id            bigint generated always as identity primary key,
  session_id    text not null references public.assessment_sessions (session_id) on delete cascade,
  insight_id    text not null,
  unique (session_id, insight_id)
);
create index if not exists session_insights_session_id_idx on public.session_insights (session_id);

alter table public.session_findings enable row level security;
alter table public.session_insights enable row level security;

-- Same students_read_own_% / instructors_read_own_class_% pair every other
-- child table gets in 010_assessment_sessions_rls.sql — extended here rather
-- than re-run there, since 010 already shipped and this project's migrations
-- are append-only (see this file's own header).
do $$
declare
  child text;
begin
  foreach child in array array['session_findings', 'session_insights']
  loop
    execute format(
      'drop policy if exists students_read_own_%1$s on public.%1$s;
       create policy students_read_own_%1$s
         on public.%1$s for select
         to authenticated
         using (
           exists (
             select 1 from public.assessment_sessions s
             where s.session_id = %1$s.session_id and s.student_id = auth.uid()
           )
         );',
      child
    );

    execute format(
      'drop policy if exists instructors_read_own_class_%1$s on public.%1$s;
       create policy instructors_read_own_class_%1$s
         on public.%1$s for select
         to authenticated
         using (
           exists (
             select 1
             from public.assessment_sessions s
             join public.classes c on c.id = s.class_id
             where s.session_id = %1$s.session_id and c.instructor_id = auth.uid()
           )
         );',
      child
    );
  end loop;
end $$;

-- ============================================================================
-- submit_assessment_session — CREATE OR REPLACE, adding the two new insert
-- loops. Everything else in this function is byte-for-byte unchanged from
-- 011_assessment_rpcs.sql; only the declare block and the two new loops
-- (placed after the existing hypothesis loop) are new. See that file's own
-- header for the atomicity/error-code conventions this preserves unchanged.
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
  v_finding_id text;
  v_insight_id text;
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
    or jsonb_array_length(coalesce(p_payload->'confirmedFindingIds', '[]'::jsonb)) > v_max_child_rows
    or jsonb_array_length(coalesce(p_payload->'unlockedInsightIds', '[]'::jsonb)) > v_max_child_rows
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

  -- New in this migration: confirmedFindingIds / unlockedInsightIds are plain
  -- string arrays, so jsonb_array_elements_text (not jsonb_array_elements) -
  -- it yields text directly, no ->> needed.
  for v_finding_id in select * from jsonb_array_elements_text(coalesce(p_payload->'confirmedFindingIds', '[]'::jsonb))
  loop
    insert into public.session_findings (session_id, finding_id)
    values (v_session_id, v_finding_id)
    on conflict (session_id, finding_id) do nothing;
  end loop;

  for v_insight_id in select * from jsonb_array_elements_text(coalesce(p_payload->'unlockedInsightIds', '[]'::jsonb))
  loop
    insert into public.session_insights (session_id, insight_id)
    values (v_session_id, v_insight_id)
    on conflict (session_id, insight_id) do nothing;
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
