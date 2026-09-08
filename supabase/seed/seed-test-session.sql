-- seed-test-session.sql
--
-- TEST DATA — not a real student. This is one real Unity session capture
-- (session_2b5f5209-e069-4ce9-9e71-91d45d652455_20260905-034827.jsonl, a
-- CSI_Environment GreyboxFlowTest.RunFullFlow() run against the live
-- EvidenceStateManager/SessionLogger pipeline — real events, not hand-typed)
-- translated into the student_session_summary / evidence_events shape, so
-- the dashboard's read side can finally be checked against real
-- Unity-shaped output instead of only the hardcoded mock data.
--
-- accuracy and compliance are intentionally NULL: no agreed formula yet
-- exists for collapsing the offline scorer's separate metrics
-- (criticalRecall, relevantRecall, precision, distractorFallRate) into
-- these two columns. Do not backfill a number here until that formula is
-- decided — see 004_evidence_events_correctness_and_missing_ddl.sql §3.
--
-- id/name are deliberately unmistakable placeholders: Unity currently
-- captures no real student identity at all, and 'TEST-STUDENT-001' sits
-- outside the real STU-XXXX numbering so it can never collide with or be
-- mistaken for a real roster entry.
--
-- error_count = count of EvidenceTransitionBlocked + NonEvidenceMarked +
-- MarkerReclaimBlocked events in the source session (4, all
-- EvidenceTransitionBlocked here — this session has no NonEvidenceMarked or
-- MarkerReclaimBlocked events). This is the decided definition for this
-- seed, not a placeholder pending something better.
--
-- time_on_task_min = round((SessionEnded.timestampMs - SessionStarted.timestampMs) / 60000).
-- Source session: 25492ms = ~0.42 min, which rounds to 0. This is an honest
-- reading of a real capture, not a bug: RunFullFlow() drives the state
-- machine programmatically in well under a second of scenario time, so
-- every session captured from it so far is this fast. No real
-- human-paced Unity session exists yet to seed instead.
--
-- scenario_name: no human-readable display name for this scenario exists
-- anywhere in the Unity project or this dashboard's code/docs today (only
-- the internal id "CSI_Environment") — used as-is rather than inventing a
-- title. (The MOCK_SCENARIOS case titles in src/lib/supabaseClient.ts are
-- mock data, not a real name for this scenario.)
--
-- event_timestamp is elapsed time (HH:MM:SS from timestampMs), not wall
-- clock, matching the live rows' format. Every row below happens to land
-- in the same rounded second (00:00:14) because the entire captured
-- session spans 14298ms-14393ms — under 100ms of scenario time across all
-- 49 mapped events, again a real property of a scripted run, not an
-- error in this file.
--
-- Session-level bookkeeping (SessionStarted, SessionEnded, SceneEntered)
-- and hypothesis-checkpoint events are skipped per spec; this source
-- session has none of the latter anyway. EvidenceStatusChanged->Found and
-- ->ReadyForCollection are included under the "informational, correct
-- NULL" catch-all alongside Photographed/Sketched/Logged/Collected/
-- Sealed/Processed — the mapping spec's examples didn't name these two,
-- but they're EvidenceStatusChanged events with no correctness dimension
-- like every other status in that bucket, so the same rule applies.
-- Flagging this reading explicitly rather than silently assuming it.
--
-- No EvidenceRelevance.Neutral item exists in this scenario's ground
-- truth (GroundTruth_CSI_Environment.json — all five items are Critical,
-- Relevant, or Distractor), so the undecided "Marked" correct-value case
-- for Neutral items does not arise here.
--
-- DELETE this row (and its evidence_events rows, which cascade via the
-- session_id foreign key) before any real student data exists in this
-- table.

begin;

insert into public.student_session_summary
    (id, name, role, scenario_id, scenario_name, accuracy, compliance, time_on_task_min, error_count, session_id)
values
    ('TEST-STUDENT-001', 'TEST SEED — Unity capture, not a real student', 'student', 'CSI_Environment', 'CSI_Environment', null, null, 0, 4, '2b5f5209-e069-4ce9-9e71-91d45d652455');

insert into public.evidence_events
    (session_id, sequence, event_timestamp, action, item, event_kind, correct)
values
    ('2b5f5209-e069-4ce9-9e71-91d45d652455', 3,  '00:00:14', 'Found',              'Kitchen knife',              'informational', null),
    ('2b5f5209-e069-4ce9-9e71-91d45d652455', 4,  '00:00:14', 'Marked evidence',    'Kitchen knife',              'inferential',   true),
    ('2b5f5209-e069-4ce9-9e71-91d45d652455', 5,  '00:00:14', 'Photographed',       'Kitchen knife',              'informational', null),
    ('2b5f5209-e069-4ce9-9e71-91d45d652455', 6,  '00:00:14', 'Sketched',           'Kitchen knife',              'informational', null),
    ('2b5f5209-e069-4ce9-9e71-91d45d652455', 7,  '00:00:14', 'Logged',             'Kitchen knife',              'informational', null),
    ('2b5f5209-e069-4ce9-9e71-91d45d652455', 8,  '00:00:14', 'ReadyForCollection', 'Kitchen knife',              'informational', null),
    ('2b5f5209-e069-4ce9-9e71-91d45d652455', 9,  '00:00:14', 'Collected',          'Kitchen knife',              'informational', null),
    ('2b5f5209-e069-4ce9-9e71-91d45d652455', 10, '00:00:14', 'Skipped step',       'Kitchen knife',              'procedural',    false),
    ('2b5f5209-e069-4ce9-9e71-91d45d652455', 11, '00:00:14', 'Sealed',             'Kitchen knife',              'informational', null),
    ('2b5f5209-e069-4ce9-9e71-91d45d652455', 12, '00:00:14', 'Processed',          'Kitchen knife',              'informational', null),

    ('2b5f5209-e069-4ce9-9e71-91d45d652455', 13, '00:00:14', 'Found',              'Blood spatter pattern',      'informational', null),
    ('2b5f5209-e069-4ce9-9e71-91d45d652455', 14, '00:00:14', 'Marked evidence',    'Blood spatter pattern',      'inferential',   true),
    ('2b5f5209-e069-4ce9-9e71-91d45d652455', 15, '00:00:14', 'Photographed',       'Blood spatter pattern',      'informational', null),
    ('2b5f5209-e069-4ce9-9e71-91d45d652455', 16, '00:00:14', 'Sketched',           'Blood spatter pattern',      'informational', null),
    ('2b5f5209-e069-4ce9-9e71-91d45d652455', 17, '00:00:14', 'Logged',             'Blood spatter pattern',      'informational', null),
    ('2b5f5209-e069-4ce9-9e71-91d45d652455', 18, '00:00:14', 'ReadyForCollection', 'Blood spatter pattern',      'informational', null),
    ('2b5f5209-e069-4ce9-9e71-91d45d652455', 19, '00:00:14', 'Collected',          'Blood spatter pattern',      'informational', null),
    ('2b5f5209-e069-4ce9-9e71-91d45d652455', 20, '00:00:14', 'Sealed',             'Blood spatter pattern',      'informational', null),
    ('2b5f5209-e069-4ce9-9e71-91d45d652455', 21, '00:00:14', 'Processed',          'Blood spatter pattern',      'informational', null),

    ('2b5f5209-e069-4ce9-9e71-91d45d652455', 22, '00:00:14', 'Found',              'Broken handrail fragment',   'informational', null),
    ('2b5f5209-e069-4ce9-9e71-91d45d652455', 23, '00:00:14', 'Marked evidence',    'Broken handrail fragment',   'inferential',   true),
    ('2b5f5209-e069-4ce9-9e71-91d45d652455', 24, '00:00:14', 'Photographed',       'Broken handrail fragment',   'informational', null),
    ('2b5f5209-e069-4ce9-9e71-91d45d652455', 25, '00:00:14', 'Sketched',           'Broken handrail fragment',   'informational', null),
    ('2b5f5209-e069-4ce9-9e71-91d45d652455', 26, '00:00:14', 'Logged',             'Broken handrail fragment',   'informational', null),
    ('2b5f5209-e069-4ce9-9e71-91d45d652455', 27, '00:00:14', 'ReadyForCollection', 'Broken handrail fragment',   'informational', null),
    ('2b5f5209-e069-4ce9-9e71-91d45d652455', 28, '00:00:14', 'Collected',          'Broken handrail fragment',   'informational', null),
    ('2b5f5209-e069-4ce9-9e71-91d45d652455', 29, '00:00:14', 'Skipped step',       'Broken handrail fragment',   'procedural',    false),
    ('2b5f5209-e069-4ce9-9e71-91d45d652455', 30, '00:00:14', 'Sealed',             'Broken handrail fragment',   'informational', null),
    ('2b5f5209-e069-4ce9-9e71-91d45d652455', 31, '00:00:14', 'Processed',          'Broken handrail fragment',   'informational', null),

    ('2b5f5209-e069-4ce9-9e71-91d45d652455', 32, '00:00:14', 'Found',              'Victim''s mobile phone',     'informational', null),
    ('2b5f5209-e069-4ce9-9e71-91d45d652455', 33, '00:00:14', 'Marked evidence',    'Victim''s mobile phone',     'inferential',   true),
    ('2b5f5209-e069-4ce9-9e71-91d45d652455', 34, '00:00:14', 'Photographed',       'Victim''s mobile phone',     'informational', null),
    ('2b5f5209-e069-4ce9-9e71-91d45d652455', 35, '00:00:14', 'Sketched',           'Victim''s mobile phone',     'informational', null),
    ('2b5f5209-e069-4ce9-9e71-91d45d652455', 36, '00:00:14', 'Logged',             'Victim''s mobile phone',     'informational', null),
    ('2b5f5209-e069-4ce9-9e71-91d45d652455', 37, '00:00:14', 'ReadyForCollection', 'Victim''s mobile phone',     'informational', null),
    ('2b5f5209-e069-4ce9-9e71-91d45d652455', 38, '00:00:14', 'Collected',          'Victim''s mobile phone',     'informational', null),
    ('2b5f5209-e069-4ce9-9e71-91d45d652455', 39, '00:00:14', 'Skipped step',       'Victim''s mobile phone',     'procedural',    false),
    ('2b5f5209-e069-4ce9-9e71-91d45d652455', 40, '00:00:14', 'Sealed',             'Victim''s mobile phone',     'informational', null),
    ('2b5f5209-e069-4ce9-9e71-91d45d652455', 41, '00:00:14', 'Processed',          'Victim''s mobile phone',     'informational', null),

    ('2b5f5209-e069-4ce9-9e71-91d45d652455', 42, '00:00:14', 'Found',              'Empty liquor bottle',        'informational', null),
    ('2b5f5209-e069-4ce9-9e71-91d45d652455', 43, '00:00:14', 'Marked evidence',    'Empty liquor bottle',        'inferential',   false),
    ('2b5f5209-e069-4ce9-9e71-91d45d652455', 44, '00:00:14', 'Photographed',       'Empty liquor bottle',        'informational', null),
    ('2b5f5209-e069-4ce9-9e71-91d45d652455', 45, '00:00:14', 'Sketched',           'Empty liquor bottle',        'informational', null),
    ('2b5f5209-e069-4ce9-9e71-91d45d652455', 46, '00:00:14', 'Logged',             'Empty liquor bottle',        'informational', null),
    ('2b5f5209-e069-4ce9-9e71-91d45d652455', 47, '00:00:14', 'ReadyForCollection', 'Empty liquor bottle',        'informational', null),
    ('2b5f5209-e069-4ce9-9e71-91d45d652455', 48, '00:00:14', 'Collected',          'Empty liquor bottle',        'informational', null),
    ('2b5f5209-e069-4ce9-9e71-91d45d652455', 49, '00:00:14', 'Skipped step',       'Empty liquor bottle',        'procedural',    false),
    ('2b5f5209-e069-4ce9-9e71-91d45d652455', 50, '00:00:14', 'Sealed',             'Empty liquor bottle',        'informational', null),
    ('2b5f5209-e069-4ce9-9e71-91d45d652455', 51, '00:00:14', 'Processed',          'Empty liquor bottle',        'informational', null);

commit;
