# ViCSI current-system audit — 2026-10-17

Completed before UI implementation. Sources are implemented Unity code in C:/Users/Roduf Eleu/My project (1), implemented dashboard/API code, versioned scoring JSON, migration SQL, and read-only GET/SELECT inspection of the configured Supabase environment. No production writes or RPC mutations were performed. Existing uncommitted work is retained.

## 1. Final deduction scoring

Active Unity Scenario_CSI_Environment.asset: CSI-ENVIRONMENT-001, The Last Drink, scenario1.1.0, ground truth1.2.0, scoring1.7.0. Resources/DeductionScoring_1_7_0.json matches dashboard src/lib/scoring/data/csiEnvironment.v1_7.json. FinalDeductionAssessment.cs and deductionAssessmentScorer.ts implement 60/25/15, not the old evidence/procedure composite:

- Reasoning: 60 × sum of six response weights /24. Each checkpoint has authored weights1–4. Missing eligible/undiscovered answers retain the fixed denominator; technically missing/inconsistent records require review.
- Relationships: 25 × max(0, supported weight − unsupported count ×1)/6. Six existing authored relationships each weight1. Eligibility is based on frozen evidence/findings/statements; no renormalization for missing relationships.
- Conclusion: 15 × authored conclusion credit. Components sum to0–100. No procedural deduction penalties.

Final status is complete, incomplete, or requires_review. A final grade requires conclusion-time snapshot, consistent locked responses, SessionEnded, and InvestigationCompleted after the snapshot for role-gated sessions. Backend verification statuses are verified, pending_verification, requires_review, verification_failed. These are different concepts and must not be conflated with scene completion or suspect outcome. Answer-key configuration is labelled RESEARCH_CONFIGURATION_REQUIRES_EXPERT_VALIDATION in current game data; the UI must not invent an expert benchmark.

## 2. Reasoning checkpoints

ReasoningCheckpointManager.cs plus ReasoningCheckpoints_LastDrink contains six contextual, immutable selections: RC-01-PETER (Form1/evidence caution), RC-02-SCENE (initial observations), RC-03-FINGERPRINT (contact limitation), RC-04-KNIFE-WOUND (consistency), RC-05-TIMELINE (vendor follow-up), RC-06-BLOODSTAIN (integration). Eligibility/submission events carry checkpoint/response IDs, response order, eligible/answered times, content version and reasoning category. Qualitative post-session strength is 1 unsupported,2 assumption-heavy,3 reasonable,4 strong. The old hypothesis answers are separate historical/context records. RC-03's confirmation is the vendor follow-up dependency; RC-05 requires statement_vendor_paul_3am. No complete per-checkpoint fact snapshot is logged. The dashboard can describe the authored eligibility trigger and recorded eligibility/answer times, but must not manufacture a time-specific observation history from the final conclusion snapshot.

## 3. Evidence Relationships

EvidenceBoardController.Awake disables the physical board. Dragging/link creation are not current student requirements. EvidenceRelationshipsReview.cs presents eligible authored questions, selectable interpretations, explicit confirmation and immutable responses with no immediate correctness reveal. relationshipReviewVersion1 responses are in the frozen snapshot and RelationshipInterpretationSubmitted events. Existing IDs/data and historical board version0 scoring remain.

Six authored IDs: REL-bottle-supports-brother, REL-knife-consistent-wound, REL-paul-print-handled-knife, REL-paul-timeline-contradiction, REL-peter-departure-supported, REL-spatter-consistent-reconstruction. Current scorer judges supported/unsupported; no partial-credit relationship state is implemented. Timeline uses statement_vendor_paul_3am. Important selected-interpretation data must be read from session_events, because live session_relationships has no interpretation columns.

## 4. Conclusions/outcomes

Paul: conclusion-brother + ending-brother-accused, fully developed authored support chain,15points. Premature Paul: same conclusion + ending-premature-submission,3.75points. Peter: conclusion-peter + ending-peter-unsupported,0points. Inconclusive: CONCLUSION-INCONCLUSIVE + ending-inconclusive,15points if support insufficient,3.75 if the full support chain was available. Unknown/inconsistent pairs require review. Historical wife/other scenario outcomes must retain version-specific resolution, never be relabelled Paul automatically.

## 5. Guided Training Analytics / recent changes

SessionEventType and actual emitting scripts support scene photography, evidence status/Recorder selections, marking/reclaim/blocking, sampling, fingerprint identification, measurement/pair distances, sketch placements/hints, procedure-order warnings, blocked attempts, IOC observations/Form1/Form2, role handoffs, witness follow-up, body documentation/preparation/removal, custody pass, final inventory, final survey, IOC report and scene release.

Current evidence roster: BODY-A (John), EVD-014 kitchen knife, EVD-015 blood spatter, EVD-018 empty liquor bottle. BODY-A is documented/removed rather than ending Processed. Bottle prints include John, Peter and Paul, not one attacker inference. Successful markers are retrievable after their own evidence is Logged; unused markers can be reclaimed immediately. Inventory entries are sealed bags and independent derived blood/fingerprint samples. Bulk custody emits one EvidenceDeposited per real entry plus CustodyPassCompleted; body/tools are separate. Restart/test presets are isolated development state and are not ordinary scored student attempts.

Current workflow: IOC turnover → IOC assessment → assistance decision/request → SOCO turnover → investigation → conclusion feedback → SOCO closeout → inventory-review phase containing mandatory custody pass → final survey → IOC completion report → scene release → InvestigationComplete. Enum InvestigationComplete remains6 for serialized compatibility despite being final chronologically. Never infer workflow order by enum numeric value.

General teaching prompt receipts are not logged by ProceduralTrainingGuidance; SketchPlacementHintShown is a real guidance event. No invented total prompts/help rate. Raw logs can be disabled/capped, so absent events mean not recorded, not necessarily failed/not done. Core essential events preserve deduction, body/fingerprint/custody milestones; not every closeout intermediate or training action survives a limited raw log.

## 6. Session payload and API

AssessmentSessionUploadDto payloadVersion1 (additive fields): identifiers/versions/timestamps/duration, submitted conclusion/ending, informational client counts, evidenceResults, reportLineResults, proceduralViolations, relationshipResults (including locked interpretation fields), hypothesisResults, confirmedFindingIds, unlockedInsightIds, scenePhotography/measurement sections, optional orderedEvents, deductionAssessmentEvents and client deductionAssessment. Evidence results include fingerprintMatchIdentities. The existing DB table does not store that additive identity list directly; FingerprintIdentified events preserve it.

POST /api/v1/assessment-sessions authenticates server-issued upload tokens, rate-limits, merges/deduplicates essential events, hashes/idempotently submits through submit_assessment_session, and independently verifies through the registered scorer. Identity and is_test_session come from token/server, not trusted client fields. Dashboard reads remain cookie-authenticated/RLS scoped; service role is only used in this audit for explicit read-only metadata/count inspection and existing ingest/verification paths. No score recalculation or ingestion was invoked on production.

## 7. Supabase audit

Configured environment read-only inspection:107 assessment_sessions,1321 score categories,4099 events,671 relationships,397 evidence results,201 hypotheses,646 report selections,124 procedure notes,4 classes,29 enrollment rows,4 assignments,1scenario. All107 sessions are scenario1.0.0 with scoring1.0–1.5, plus unsupported9.9.9 test cases; none1.6/1.7. This is actual deployment drift, not an empty current-game dataset to backfill silently.

Live scenarios registry: CSI-ENVIRONMENT-001 / CSI Environment / scenario1.0.0 / groundtruth1.0.0 / scoring1.0.0. Live GETs for session_findings and session_insights return404/PGRST205; migration017 exists locally but is absent from exposed live schema. Proposal ONLY: review/apply existing additive017 with its RLS, and explicitly coordinate scenario-registry/client/server-version rollout. No migration or registry update is applied in this work. No new schema is necessary for relationship-review/custody display because existing session_events JSON payloads already carry their details. Missing optional tables should fall back to frozen snapshot finding IDs if available and display unavailable otherwise.

Dashboards currently read assessment_sessions, session_score_categories(source=server), session_events, session_evidence_results, session_procedure_violations, session_relationships, session_hypotheses, session_findings/session_insights, profiles, classes, class_enrollments, assessment_assignments, scenarios. No reporting views/RPCs are used for current results; aggregates are application-side. Old student_session_summary/scenario_aggregate/evidence_events types/components represent legacy pages. Live OpenAPI confirms submit_assessment_session, save_verified_score, mark_verification_failed, token/access-code RPCs and class/assignment RPCs. They are not called for audit. Live session_relationships lacks interpretation columns; live evidence results lacks fingerprint identities. Session event payloads supply both.

## 8. Student dashboard today

/results lists one rounded card per session, no shared application navigation/filtering. Current details use a dark slate panel cluster inside otherwise light pages; legacy details use category grids and historical evidence assumptions. Reasoning selections and relationship interpretations are partly supported already. No compact learning overview, unified attempt table, deterministic improvement summary, or explicit latest-attempt context. Authentication/RLS are implemented and must remain.

## 9. Instructor dashboard today

/class-results combines all-class KPI cards, old analytics cards and expandable student card groups. The global overview does not obey the page's filters. It relies on state Completed/processed counts rather than confirmed relationship quality and mishandles body completion. Per-student/per-session drilldowns/export routes exist. Classes, enrollment, assignment management and VR access-code routes exist and should remain functional. There are no separate existing reasoning/training routes; supported query views/anchors can provide these without dead navigation.

## 10. Stale assumptions to remove

TRACEBOARD branding; wide top-nav only; student standalone shell; dark assessment panels; unfiltered/mixed-version averages; test attempts silently mixed with assessed cohorts; physical-board/manual-link terminology for version1 reviews; relationship progress treated as correctness; BODY-A counted incomplete because not Processed; custody treated only as optional held-item deposit; generic all-evidence precision/penalty language as current deduction; inference that a completed upload proves closeout; zero-count implications when raw data is absent; decorative cards/charts and navigation to unimplemented routes. Legacy interpretations remain explicitly historical.

## Phase2 content model / implementation decision

Use a shared ViCSI shell, compact header/sidebar, neutral forensic/academic tokens and one teal accent. Student supported query views on /results: overview, attempts, reasoning, relationships, training; latest selected real attempt links to existing detail. Instructor /class-results views: overview, students, sessions, reasoning/relationships analysis, training. Preserve /classes,/assignments and existing detail/export routes. Keep class/scenario/version/date/search/verification filtering scoped to every aggregation. Separate assessed score/components from non-scored workflow/guidance. Use compact tables and labelled horizontal bars with denominators. No current/historical score pooling. Derive improvement copy from verified strengths/support and recorded training notes only. Show unavailable data honestly. Current1.7 rendering will be validated with captured Unity payloads locally; the live environment only supports historical real-data validation until current sessions are uploaded after a separately authorized rollout.

## Audit addendum from implementation validation

SceneTurnover.TryAdvance logs SceneReleaseConfirmed on entry to SceneRelease, after the IOC completion report. It authorizes release; InvestigationCompleted records actual completed scene release. Dashboard workflow rows use those meanings rather than treating the first event as completed closeout. Body Logged is documentation, while BodyRemoved is transport. Current fingerprint match identities are JSON in FingerprintIdentified.matches.identities, and custody events retain sample/source/box IDs.

The implemented current scenario title is The Last Drink for CSI-ENVIRONMENT-001 / scenario1.1.0 / groundtruth1.2.0. The read adapter resolves this exact version tuple from audited public metadata while retaining database titles for historical/unknown tuples. It does not update the stale production scenario registry.

Extended optional cross-repository validation discovered two stale historical assertions: lastDrink.test.ts compares its older five-relationship ground-truth object with today's six-relationship Unity export (also a changed generatedAt), and trainingSeparation.test.ts asserts old phase1 byte hashes for game files that later authorized body, marker, recorder and custody work changed. No historical score definitions or goldens were overwritten to conceal this drift. Current scoring1.7 JSON parity, relationship-review upload parity and custody event transport checks pass. These optional historical checks need separately versioned reference fixtures rather than comparing mutable current game files to an earlier snapshot.
