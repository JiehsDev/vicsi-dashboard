-- 009_assessment_sessions.sql
--
-- The main ingest tables: one assessment_sessions row per Unity SessionLogger
-- session (keyed on Unity's own session_id GUID string - the idempotency key the
-- whole submission endpoint is built around), plus one child table per
-- AssessmentSessionUploadDto array section (Assets/_Project/Scripts/Assessment/
-- AssessmentSessionUploadDto.cs). Column names below are deliberately snake_case
-- mirrors of that DTO's own field names, so the mapping in
-- src/lib/assessmentSubmission.ts has no hidden renames to track.
--
-- Run in the Supabase SQL editor AFTER 008. Safe to re-run. Purely additive.

begin;

create table if not exists public.assessment_sessions (
  session_id                text primary key,
  receipt_id                uuid not null default gen_random_uuid(),

  student_id                uuid not null references public.profiles (id) on delete restrict,
  class_id                  uuid not null references public.classes (id) on delete restrict,
  assignment_id             uuid not null references public.assessment_assignments (id) on delete restrict,
  scenario_id               text not null references public.scenarios (scenario_id) on delete restrict,
  scenario_version          text not null,
  scoring_rules_version     text not null,
  ground_truth_version      text,

  payload_version           integer not null,
  payload_hash              text not null,
  client_version             text,

  started_at_utc            timestamptz,
  completed_at_utc          timestamptz,
  duration_seconds          double precision,

  selected_conclusion_id    text,
  resolved_ending_id        text,

  has_client_reported_scores          boolean not null default false,
  client_relationships_correct        integer,
  client_relationships_incorrect      integer,
  client_objectives_completed         integer,
  client_objectives_failed            integer,
  client_procedural_violation_count   integer,

  verified_score             numeric,
  -- Mirrors AssessmentUploadService/AssessmentUploadStatus's own state-name
  -- discipline: explicit, small, checked set - never a free-text status column.
  verification_status        text not null default 'pending_verification'
    check (verification_status in ('pending_verification', 'verified', 'verification_failed', 'requires_review')),
  verification_message       text,
  verified_at_utc             timestamptz,

  server_received_at_utc     timestamptz not null default now(),
  finalized_at_utc            timestamptz,

  unique (receipt_id)
);

comment on table public.assessment_sessions is
  'One row per Unity session upload. session_id is Unity''s own SessionLogger GUID and the idempotency key for POST /api/v1/assessment-sessions.';
comment on column public.assessment_sessions.payload_hash is
  'sha256 hex of the canonical (stable-key-order) JSON payload - the conflicting-duplicate check compares this, never a field-by-field diff.';

create index if not exists assessment_sessions_student_id_idx on public.assessment_sessions (student_id);
create index if not exists assessment_sessions_class_id_idx on public.assessment_sessions (class_id);
create index if not exists assessment_sessions_assignment_id_idx on public.assessment_sessions (assignment_id);
create index if not exists assessment_sessions_verification_status_idx on public.assessment_sessions (verification_status);

-- --------------------------------------------------------------------------------
-- Child tables - one row per array entry in AssessmentSessionUploadDto. Every FK
-- targets assessment_sessions(session_id) on delete cascade: a child row is
-- meaningless without its parent, same "CASCADE, not preserved as an orphan" choice
-- 004 already made for evidence_events -> student_session_summary.
-- --------------------------------------------------------------------------------

-- Normalized, extensible score-category rows - separate from the dedicated
-- client_* columns on assessment_sessions above (those five are the fixed shape
-- Unity always sends today; this table is for named metrics that can grow without
-- a schema change, e.g. the future server-side EvidenceScorer categories:
-- criticalRecall, relevantRecall, precision, distractorFallRate, reasoningAccuracy,
-- documentationAccuracy - see Tools/EvidenceScorer/Program.cs in the Unity repo).
create table if not exists public.session_score_categories (
  id            bigint generated always as identity primary key,
  session_id    text not null references public.assessment_sessions (session_id) on delete cascade,
  category_key  text not null,
  category_value double precision, -- nullable: an undefined ratio (e.g. no distractor items) is NaN in the .NET scorer, never a fabricated 0 - see Program.cs's own Ratio() comment
  source        text not null check (source in ('client', 'server')),
  created_at    timestamptz not null default now(),
  unique (session_id, category_key, source)
);

create table if not exists public.session_evidence_results (
  id                     bigint generated always as identity primary key,
  session_id             text not null references public.assessment_sessions (session_id) on delete cascade,
  evidence_id            text not null,
  final_status           text not null,
  swabbing_done          boolean not null default false,
  fingerprinting_done    boolean not null default false,
  is_flipped             boolean not null default false,
  fingerprint_lab_status text,
  tent_number            integer,
  tent_letter            text,
  -- One result row per piece of evidence per session - guards against
  -- submit_assessment_session (or any future caller) accidentally inserting
  -- the same evidence item twice for one session.
  unique (session_id, evidence_id)
);
create index if not exists session_evidence_results_session_id_idx on public.session_evidence_results (session_id);

create table if not exists public.session_report_lines (
  id           bigint generated always as identity primary key,
  session_id   text not null references public.assessment_sessions (session_id) on delete cascade,
  evidence_id  text not null,
  line_id      text not null,
  unique (session_id, evidence_id, line_id)
);
create index if not exists session_report_lines_session_id_idx on public.session_report_lines (session_id);

create table if not exists public.session_procedure_violations (
  id            bigint generated always as identity primary key,
  session_id    text not null references public.assessment_sessions (session_id) on delete cascade,
  event_type    text not null,
  target_id     text,
  timestamp_ms  bigint,
  detail        text,
  -- Same (type, target, timestamp) appearing twice for one session is
  -- always a duplicate submission of the same violation, never two
  -- genuinely distinct events (Unity's own event log dedupes by
  -- sequence_number already; this is a second, independent guard specific
  -- to this derived table).
  unique (session_id, event_type, target_id, timestamp_ms)
);
create index if not exists session_procedure_violations_session_id_idx on public.session_procedure_violations (session_id);

create table if not exists public.session_relationships (
  id                  bigint generated always as identity primary key,
  session_id          text not null references public.assessment_sessions (session_id) on delete cascade,
  relationship_id     text not null,
  source_id           text,
  target_id           text,
  relationship_type   text,
  state               text not null,
  was_ever_selected   boolean not null default false,
  unique (session_id, relationship_id)
);
create index if not exists session_relationships_session_id_idx on public.session_relationships (session_id);

create table if not exists public.session_hypotheses (
  id                    bigint generated always as identity primary key,
  session_id            text not null references public.assessment_sessions (session_id) on delete cascade,
  checkpoint_id         text not null,
  selected_option_id    text,
  reasoning_option_id   text,
  unique (session_id, checkpoint_id)
);
create index if not exists session_hypotheses_session_id_idx on public.session_hypotheses (session_id);

create table if not exists public.session_events (
  id               bigint generated always as identity primary key,
  session_id       text not null references public.assessment_sessions (session_id) on delete cascade,
  sequence_number  integer not null,
  timestamp_ms     bigint not null,
  event_type       text not null,
  target_id        text,
  -- Stored exactly as Unity's own PayloadEntry list shape ([{key,value}, ...]),
  -- not flattened into a jsonb object - preserves duplicate keys and original
  -- order if either were ever meaningful, and needs no lossy transform at ingest.
  payload          jsonb not null default '[]'::jsonb,
  unique (session_id, sequence_number)
);
create index if not exists session_events_session_id_idx on public.session_events (session_id);

alter table public.assessment_sessions enable row level security;
alter table public.session_score_categories enable row level security;
alter table public.session_evidence_results enable row level security;
alter table public.session_report_lines enable row level security;
alter table public.session_procedure_violations enable row level security;
alter table public.session_relationships enable row level security;
alter table public.session_hypotheses enable row level security;
alter table public.session_events enable row level security;
-- No policies here - see 010_assessment_sessions_rls.sql, the single file all read/write
-- access rules for these eight tables live in.

commit;
