-- 019_vr_session_upload_tokens.sql
--
-- Bridges VR access-code identification (018) to the EXISTING session upload
-- (POST /api/v1/assessment-sessions -> submit_assessment_session, 011).
--
-- The VR access code identifies a student; it is never an upload credential. To
-- upload a session, the headset (authenticated by VR_DEVICE_SYNC_KEY) asks for a
-- SHORT-LIVED upload token for the session's original, stable owner. That token is
-- an ordinary assessment_tokens row - same table, same sha256-hashed storage, same
-- submit_assessment_session path the pairing exchange already feeds - so the upload
-- endpoint, idempotency (session_id + payload_hash) and scoring are untouched. It
-- differs from a pairing token only in being:
--   - purpose = 'vr_session_upload'  (pairing tokens: purpose = 'pairing', the default)
--   - bound to ONE session_id        (enforced by the upload route before submit)
--   - minutes-long, not hours
--
-- Additive only: three nullable/defaulted columns on assessment_tokens, one on
-- assessment_sessions, one new service_role-only function. submit_assessment_session
-- and every existing token/session row are unchanged (existing tokens become
-- purpose = 'pairing', unbound - exactly how they already behave).
--
-- Run in the Supabase SQL editor AFTER 018. Safe to re-run. NOT APPLIED YET.
-- Manual rollback guidance at the bottom.

begin;

-- ============================================================================
-- Columns
-- ============================================================================

alter table public.assessment_tokens
  add column if not exists purpose text not null default 'pairing',
  add column if not exists bound_session_id text,
  add column if not exists is_test_session boolean not null default false;

alter table public.assessment_tokens
  drop constraint if exists assessment_tokens_purpose_check;
alter table public.assessment_tokens
  add constraint assessment_tokens_purpose_check
  check (purpose in ('pairing', 'vr_session_upload'));

alter table public.assessment_tokens
  drop constraint if exists assessment_tokens_vr_upload_is_bound;
alter table public.assessment_tokens
  add constraint assessment_tokens_vr_upload_is_bound
  check (purpose <> 'vr_session_upload' or bound_session_id is not null);

comment on column public.assessment_tokens.purpose is
  '''pairing'' = minted by device-pairings/exchange (or the John Doe seed). ''vr_session_upload'' = minted by /api/v1/vr/session-upload-token for exactly one session (bound_session_id).';
comment on column public.assessment_tokens.bound_session_id is
  'For purpose = vr_session_upload: the only payload.sessionId this token may submit. Checked by the upload route before submit_assessment_session.';

alter table public.assessment_sessions
  add column if not exists is_test_session boolean not null default false;

comment on column public.assessment_sessions.is_test_session is
  'True for a VR "Continue Without Code" session (owned by the existing test student). Set from the upload token, never from the payload.';

-- ============================================================================
-- issue_vr_upload_token
-- ============================================================================
--
-- Called only by the /api/v1/vr/session-upload-token route (service_role), after it
-- has authenticated the device. The route generates the random token and passes
-- only its sha256 hash, same discipline as device-pairings/exchange.
--
-- Checks, in order (each raises 'CODE: detail', parsed by parseRpcError):
--   VALIDATION_ERROR        malformed ids / hash / ttl, or unknown scenario
--   STUDENT_NOT_FOUND       no student profile with that id
--   STUDENT_NOT_PERMITTED   the student has no VR access code (not set up for VR)
--   STUDENT_DISABLED        the code is disabled AND the session did not start
--                           before it was disabled (see policy below)
--   SESSION_OWNER_MISMATCH  that session_id is already stored under another student
--   NO_ASSIGNMENT           the student has no assignment for this scenario in any
--                           class they're enrolled in
--
-- DISABLED-CODE POLICY: disabling a code stops new VR logins (validate_vr_access_code,
-- 018); it does NOT void work already done. A session that started before the code
-- was disabled can still get an upload token. A session with no start time, or one
-- that started at/after the disable time, is refused.
--
-- CLASS/ASSIGNMENT: identity comes from p_student_id; class and assignment are
-- resolved here. Preference: the class hint the headset recorded at login, then an
-- active assignment whose window contained the session start, then any active one,
-- then the most recent - so a session completed offline still uploads after its
-- assignment closes, instead of being lost.
create or replace function public.issue_vr_upload_token(
  p_student_id            uuid,
  p_session_id            text,
  p_scenario_id           text,
  p_class_id_hint         uuid,
  p_is_test_session       boolean,
  p_session_started_at    timestamptz,
  p_token_hash            text,
  p_ttl_seconds           integer
)
returns table (
  expires_at     timestamptz,
  class_id       uuid,
  assignment_id  uuid,
  scenario_id    text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code public.student_vr_access_codes%rowtype;
  v_existing_owner uuid;
  v_class uuid;
  v_assignment uuid;
  v_expires timestamptz;
begin
  if p_student_id is null then
    raise exception 'VALIDATION_ERROR: studentId is required';
  end if;
  if p_session_id is null or p_session_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'VALIDATION_ERROR: sessionId must be a UUID';
  end if;
  if p_token_hash is null or length(p_token_hash) <> 64 then
    raise exception 'VALIDATION_ERROR: malformed token hash';
  end if;
  if p_ttl_seconds is null or p_ttl_seconds < 60 or p_ttl_seconds > 3600 then
    raise exception 'VALIDATION_ERROR: ttl must be between 60 and 3600 seconds';
  end if;
  if not exists (select 1 from public.scenarios s where s.scenario_id = p_scenario_id) then
    raise exception 'VALIDATION_ERROR: unknown scenario';
  end if;

  if not exists (select 1 from public.profiles p where p.id = p_student_id and p.role = 'student') then
    raise exception 'STUDENT_NOT_FOUND: no student with that id';
  end if;

  select * into v_code from public.student_vr_access_codes c where c.student_id = p_student_id;
  if not found then
    raise exception 'STUDENT_NOT_PERMITTED: student has no VR access code';
  end if;
  if v_code.disabled_at is not null
     and (p_session_started_at is null or p_session_started_at >= v_code.disabled_at) then
    raise exception 'STUDENT_DISABLED: VR access is disabled for this student';
  end if;

  select s.student_id into v_existing_owner
  from public.assessment_sessions s
  where s.session_id = p_session_id;
  if found and v_existing_owner <> p_student_id then
    raise exception 'SESSION_OWNER_MISMATCH: session already belongs to another student';
  end if;

  select a.class_id, a.id into v_class, v_assignment
  from public.assessment_assignments a
  join public.class_enrollments ce on ce.class_id = a.class_id and ce.student_id = p_student_id
  join public.classes c on c.id = a.class_id
  where a.scenario_id = p_scenario_id
  order by
    (a.class_id = p_class_id_hint) desc nulls last,
    (a.is_active
      and (a.opens_at is null or a.opens_at <= coalesce(p_session_started_at, now()))
      and (a.closes_at is null or a.closes_at >= coalesce(p_session_started_at, now()))) desc,
    a.is_active desc,
    (c.archived_at is null) desc,
    a.created_at desc,
    a.id
  limit 1;
  if v_assignment is null then
    raise exception 'NO_ASSIGNMENT: no assignment for this scenario in any of the student''s classes';
  end if;

  v_expires := now() + make_interval(secs => p_ttl_seconds);

  insert into public.assessment_tokens (
    token_hash, student_id, class_id, assignment_id, scenario_id, expires_at,
    purpose, bound_session_id, is_test_session
  ) values (
    p_token_hash, p_student_id, v_class, v_assignment, p_scenario_id, v_expires,
    'vr_session_upload', p_session_id, coalesce(p_is_test_session, false)
  );

  return query select v_expires, v_class, v_assignment, p_scenario_id;
end;
$$;

revoke all on function public.issue_vr_upload_token(uuid, text, text, uuid, boolean, timestamptz, text, integer)
  from public, anon, authenticated;
grant execute on function public.issue_vr_upload_token(uuid, text, text, uuid, boolean, timestamptz, text, integer)
  to service_role;

commit;

-- ============================================================================
-- ROLLBACK GUIDANCE (manual only). Drop the function first; the columns are safe
-- to keep (defaults make them inert). If dropping them, revoke/expire any
-- vr_session_upload tokens first so none is left unbound:
--
--   begin;
--   drop function if exists public.issue_vr_upload_token(uuid, text, text, uuid, boolean, timestamptz, text, integer);
--   update public.assessment_tokens set revoked_at = now() where purpose = 'vr_session_upload' and revoked_at is null;
--   -- Only after confirming nothing reads them:
--   -- alter table public.assessment_sessions drop column if exists is_test_session;
--   -- alter table public.assessment_tokens drop constraint if exists assessment_tokens_vr_upload_is_bound;
--   -- alter table public.assessment_tokens drop constraint if exists assessment_tokens_purpose_check;
--   -- alter table public.assessment_tokens drop column if exists is_test_session, drop column if exists bound_session_id, drop column if exists purpose;
--   commit;
-- ============================================================================
