-- 004_evidence_events_correctness_and_missing_ddl.sql
--
-- Two things happen here, deliberately in one file since both were
-- discovered together and both concern the same two tables:
--
-- 1. student_session_summary, scenario_aggregate, and evidence_events
--    have existed only as hand-created objects in the live database,
--    with no migration in this repo. This captures their current live
--    shape in version control for the first time (CREATE TABLE IF NOT
--    EXISTS — safe no-op against the live DB, real DDL for any future
--    fresh environment).
--
-- 2. evidence_events.correct is currently one NOT NULL boolean doing
--    three incompatible jobs (procedural validity, inference
--    correctness, and a vacuous "true" for actions with no correctness
--    dimension at all — e.g. "Photographed"). Fixed by making the
--    distinction explicit (event_kind) instead of inferred from
--    parsing the action column, and by making correct nullable so
--    "not applicable" is representable instead of fabricated.
--
-- Run in the Supabase SQL editor AFTER 003. Safe to re-run.
--
-- ---------------------------------------------------------------------------
-- REVIEW NOTES — three corrections made to the drafted version, each
-- verified against the live database rather than reasoned about:
--
--   (a) The foreign key targeted the wrong column and WOULD HAVE ABORTED
--       THIS MIGRATION. evidence_events.session_id holds 'SES-232';
--       student_session_summary.id holds 'STU-0231'..'STU-0235'. The
--       matching column is student_session_summary.session_id ('SES-231'
--       ..'SES-235'). Verified: referencing (id) violates on 1 of 1
--       distinct value; referencing (session_id) violates on none.
--       An FK also requires a UNIQUE target, which session_id did not
--       have — added below (values are distinct, 5 of 5, so it applies
--       cleanly).
--
--   (b) ADD CONSTRAINT is not idempotent — Postgres has no
--       ADD CONSTRAINT IF NOT EXISTS — so the file was re-runnable in
--       name only and would fail on a second run. Every constraint is
--       now DROP IF EXISTS then ADD, matching the idiom 003 already
--       uses.
--
--   (c) Wrapped in a transaction. The SET NOT NULL on event_kind is
--       meant to fail loudly if any row is unclassified; without a
--       transaction that failure would leave the schema half-migrated.
--
-- Still not independently verified: CHECK/DEFAULT/UNIQUE constraints
-- that may exist on the live tables beyond what the PostgREST spec
-- exposes (it reports column names, types and nullability only). The
-- CREATE TABLE bodies below are therefore a faithful record of columns,
-- not a guarantee of every live constraint.
-- ---------------------------------------------------------------------------

begin;

-- ============================================================
-- 1. Capture existing live tables in version control (no-op if present)
-- ============================================================

create table if not exists public.student_session_summary (
    id                  text        not null primary key,
    name                text        not null,
    role                text        not null,
    scenario_id         text        not null,
    scenario_name       text        not null,
    accuracy            integer,        -- was NOT NULL; see §3 below
    compliance          integer,        -- was NOT NULL; see §3 below
    time_on_task_min    integer     not null,
    error_count         integer     not null,
    session_id          text        not null
);

create table if not exists public.scenario_aggregate (
    scenario_id         text        not null primary key,
    scenario_name       text        not null,
    completion_rate     integer     not null,
    avg_time_min        integer     not null,
    common_error        text,
    error_frequency     integer     not null
);

create table if not exists public.evidence_events (
    id                  bigint      generated always as identity primary key,
    session_id          text        not null,
    sequence            integer     not null,
    event_timestamp     text        not null,
    action              text        not null,
    item                text        not null,
    correct             boolean,        -- was NOT NULL; see §2 below
    note                text
);

-- Row Level Security is NOT configured here on purpose, but a fresh
-- environment MUST have it before these tables hold real student work.
-- Postgres leaves RLS off on a new table, and PostgREST exposes an
-- RLS-off table to the anon key — so a fresh environment created from
-- this file alone is world-readable, while the live database is not
-- (verified: anon reads return zero rows from all five tables, so RLS
-- is on and filtering there).
--
-- The live policy bodies cannot be read through the REST surface, so
-- reproducing them here would be a guess, and a wrong guess would
-- either widen access on live or break reads. Left to a follow-up that
-- can inspect them directly. Related known gap, already noted in
-- src/lib/supabaseClient.ts: student_session_summary has no per-row
-- restriction, so any authenticated caller can read every student's
-- rows. That is carried forward, not endorsed.

-- ============================================================
-- 2. evidence_events: explicit event_kind, correct becomes nullable
-- ============================================================

-- If the table already existed live (it does), these ALTERs apply the
-- real fix. If CREATE TABLE just ran fresh above, these are harmless
-- no-ops / already-correct.

alter table public.evidence_events
    add column if not exists event_kind text;

alter table public.evidence_events
    drop constraint if exists evidence_events_event_kind_check;
alter table public.evidence_events
    add constraint evidence_events_event_kind_check
    check (event_kind in ('procedural', 'inferential', 'informational'));

alter table public.evidence_events
    alter column correct drop not null;

-- Backfill the five known live seed rows into their real category.
-- "Photographed" is the vacuous-true case this migration exists to
-- stop fabricating — corrected to NULL, not left as true.

update public.evidence_events
set event_kind = 'informational', correct = null
where action = 'Photographed' and item = 'Kitchen knife';

update public.evidence_events
set event_kind = 'inferential'
where action = 'Connected evidence';

update public.evidence_events
set event_kind = 'procedural'
where action = 'Skipped step';

update public.evidence_events
set event_kind = 'inferential'
where action = 'Submitted theory';

-- Going forward, every new row must declare its kind.
--
-- This is deliberately allowed to fail: if a row exists that none of the
-- backfills above matched, that row's kind is genuinely unknown, and
-- inventing one would be the same fabrication as the vacuous `true`.
-- A failure here means "classify that row, then re-run", and the
-- surrounding transaction guarantees nothing is left half-applied.
alter table public.evidence_events
    alter column event_kind set not null;

-- Missing FK — nothing currently stops an orphan evidence_events row.
--
-- References student_session_summary(session_id), NOT (id): session_id is
-- the join key the application actually uses (getEvidenceTimeline filters
-- evidence_events.session_id by a value taken from
-- student_session_summary.session_id), and 'SES-*' values do not exist in
-- the id column at all. An FK needs a unique target, so that comes first.
--
-- CASCADE chosen because evidence_events rows are meaningless without
-- their parent session summary; reconsider if there's a reason to
-- preserve orphaned events as an audit trail instead.

alter table public.student_session_summary
    drop constraint if exists student_session_summary_session_id_key;
alter table public.student_session_summary
    add constraint student_session_summary_session_id_key
    unique (session_id);

alter table public.evidence_events
    drop constraint if exists evidence_events_session_id_fkey;
alter table public.evidence_events
    add constraint evidence_events_session_id_fkey
    foreign key (session_id) references public.student_session_summary (session_id)
    on delete cascade;

-- ============================================================
-- 3. student_session_summary: NaN-representable columns become nullable
-- ============================================================

-- The offline scorer already refuses to report 0.0 for an undefined
-- denominator (empty-critical-evidence scenarios return NaN, by
-- design). Forcing that into a NOT NULL integer at ingest would
-- silently turn "cannot be computed" into a fabricated 0 — the same
-- honesty regression event_kind above exists to prevent, at a
-- different boundary. No existing row is expected to need backfilling;
-- this only affects future inserts where the source value is NaN.

alter table public.student_session_summary
    alter column accuracy drop not null;

alter table public.student_session_summary
    alter column compliance drop not null;

-- mapStudentRow already tolerates both: it reads row.accuracy and
-- row.compliance straight through, and StudentSessionSummary types them
-- as `number`. A null arriving from the DB will surface in the UI as a
-- missing value rather than a zero — which is the intent — but the TS
-- type does not yet admit null. Widen it to `number | null` when the
-- ingest endpoint can actually produce one.

-- ============================================================
-- Explicitly NOT done in this migration
-- ============================================================
--
-- section, completion_pct, trend_pts are NOT added to
-- student_session_summary here, even though mapStudentRow already
-- reads them via `?? undefined`. completion_pct's definition is not
-- yet settled (flagged previously as unowned) — adding the column
-- before its meaning is decided would recreate the exact problem this
-- migration exists to fix on evidence_events.correct: a column that
-- exists because the schema demanded a value, not because anyone
-- decided what it means. Add these in a later migration once each
-- column's definition is actually settled.

commit;
