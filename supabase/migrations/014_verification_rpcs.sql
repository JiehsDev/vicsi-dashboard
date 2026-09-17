-- 014_verification_rpcs.sql
--
-- Two SECURITY DEFINER functions that let server-only Node code (the TypeScript
-- scorer in src/lib/scoring/) persist a verification RESULT atomically. Neither
-- function computes a score - the actual scoring algorithm (ported from
-- Tools/EvidenceScorer/Program.cs) runs entirely in Node/TypeScript, per this
-- feature's own requirement to keep the formula in one place, portable and
-- testable against the .NET reference. These functions are pure storage:
-- "given these already-computed category values, write them and flip
-- verification_status - all or nothing."
--
-- Same trust boundary as 011_assessment_rpcs.sql - service_role only, called
-- exclusively from src/lib/scoring/verify.ts, never reachable from a student's
-- or instructor's own session.
--
-- Run in the Supabase SQL editor AFTER 013. Safe to re-run (CREATE OR REPLACE).

begin;

-- ============================================================================
-- save_verified_score
--
-- p_categories is a JSON object of {category_key: number}, e.g.
-- {"criticalRecall": 1.0, "precision": 0.85, ...} - NaN/undefined categories
-- (a scenario with zero Distractor items, say) are simply omitted by the
-- caller rather than sent as a fabricated 0, matching the .NET scorer's own
-- Ratio()-returns-NaN discipline.
-- ============================================================================
create or replace function public.save_verified_score(
  p_session_id            text,
  p_scoring_rules_version text,
  p_ground_truth_version  text,
  p_categories            jsonb,
  p_overall_score         numeric,
  p_verification_message  text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_value jsonb;
begin
  if p_session_id is null or length(p_session_id) = 0 then
    raise exception 'VALIDATION_ERROR: session_id is required';
  end if;
  if not exists (select 1 from public.assessment_sessions where assessment_sessions.session_id = p_session_id) then
    raise exception 'VALIDATION_ERROR: no assessment_sessions row for session %', p_session_id;
  end if;
  if p_categories is null or jsonb_typeof(p_categories) <> 'object' then
    raise exception 'VALIDATION_ERROR: categories must be a JSON object';
  end if;

  for v_key, v_value in select * from jsonb_each(p_categories)
  loop
    -- NaN/null category values are skipped, never written as a fabricated 0 -
    -- mirrors Ratio()'s own "no denominator -> NaN, never 0.0" rule.
    if v_value is null or jsonb_typeof(v_value) <> 'number' then
      continue;
    end if;

    insert into public.session_score_categories (session_id, category_key, category_value, source)
    values (p_session_id, v_key, (v_value)::text::double precision, 'server')
    on conflict (session_id, category_key, source)
    do update set category_value = excluded.category_value;
  end loop;

  update public.assessment_sessions
  set verification_status = 'verified',
      verified_score = p_overall_score,
      verified_at_utc = now(),
      scoring_rules_version = coalesce(p_scoring_rules_version, assessment_sessions.scoring_rules_version),
      ground_truth_version = coalesce(p_ground_truth_version, assessment_sessions.ground_truth_version),
      verification_message = p_verification_message
  where assessment_sessions.session_id = p_session_id;
end;
$$;

revoke all on function public.save_verified_score(text, text, text, jsonb, numeric, text) from public, anon, authenticated;
grant execute on function public.save_verified_score(text, text, text, jsonb, numeric, text) to service_role;

-- ============================================================================
-- mark_verification_failed
--
-- p_status must be 'verification_failed' (a scoring bug/data problem - safe to
-- retry once fixed) or 'requires_review' (the scorer ran but flagged something
-- an instructor should look at, e.g. an UnclassifiedMarks/ReasoningUnclassified
-- count > 0 - a stale ground-truth export, not necessarily the student's
-- fault). p_message must never contain a stack trace, raw exception text, or
-- any internal path - callers are expected to have already reduced the error
-- to a safe summary before calling this (see verify.ts's own error handling).
-- ============================================================================
create or replace function public.mark_verification_failed(
  p_session_id  text,
  p_status      text,
  p_message     text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_session_id is null or length(p_session_id) = 0 then
    raise exception 'VALIDATION_ERROR: session_id is required';
  end if;
  if p_status not in ('verification_failed', 'requires_review') then
    raise exception 'VALIDATION_ERROR: status must be verification_failed or requires_review';
  end if;

  update public.assessment_sessions
  set verification_status = p_status,
      verification_message = p_message
  where assessment_sessions.session_id = p_session_id;

  if not found then
    raise exception 'VALIDATION_ERROR: no assessment_sessions row for session %', p_session_id;
  end if;
end;
$$;

revoke all on function public.mark_verification_failed(text, text, text) from public, anon, authenticated;
grant execute on function public.mark_verification_failed(text, text, text) to service_role;

commit;
