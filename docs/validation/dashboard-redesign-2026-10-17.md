# ViCSI dashboard redesign — 2026-10-17

## Scope and source of truth

Implemented in the existing local vicsi-dashboard repository. Audited the current Unity workspace, session DTO/builder, event logging, role/closeout controllers, scoring JSON and server verifier before changing the interface. Inspected the configured Supabase environment with GET/SELECT only. Full audit: ../audits/2026-10-17-current-system.md. No commits, pushes, deployment, production records, migrations or scenario-registry changes.

## Current game and data audit

- Active scenario: CSI-ENVIRONMENT-001, The Last Drink, scenario1.1.0 / groundtruth1.2.0 / scoring1.7.0. Four source evidence records: BODY-A John, EVD-014 knife, EVD-015 blood spatter, EVD-018 bottle. Bottle fingerprint identities include John, Peter and Paul when actually recorded.
- Deduction: Reasoning Checkpoints60% + Evidence Relationships25% + Final Conclusion15%. Checkpoints use60 × earned response weights /24. Relationships use25 × max(0, supported weights − unsupported count)/6, each authored relationship weight1. Conclusion credit is15,3.75 or0 depending on selected conclusion and the frozen support chain. No score values or scoring rules changed in this task.
- Six contextual reasoning checkpoints remain independent of historical hypothesis answers. RC-03 confirmation gates vendor follow-up; RC-05 uses statement_vendor_paul_3am. Logged IDs, categories, response order and timing resolve to authored interpretation text. Context is explicitly an authored checkpoint trigger, not an invented per-moment fact snapshot.
- The physical board is disabled by EvidenceBoardController.Awake. EvidenceRelationshipsReview stores confirmed, locked interpretation responses in RelationshipInterpretationSubmitted events and the final snapshot. Six existing relationship IDs retained, including REL-paul-timeline-contradiction. Support categories are Supported / Unsupported / unavailable; partial relationship credit is not implemented.
- Conclusion paths: supported Paul15; premature Paul3.75; unsupported Peter0; inconclusive15 with insufficient support or3.75 with developed support. Complete/incomplete/requires_review assessment states remain separate from verified/pending_verification/requires_review/verification_failed upload verification statuses.
- Guided Training Analytics includes recorded procedure progress, photography, measurement, sketch hints, blocked premature actions, fingerprint processing, body documentation/transport, per-marker retrieval, IOC/SOCO turnover, CSI forms, witness follow-up, inventory custody, final review/survey, IOC completion report and scene release. General spoken guidance receipts are not logged. Missing events never establish a skipped procedure.
- BODY-A ends Logged, followed by separate BodyRemoved. Current custody transfers inventory bags and samples to the evidence box; six transfers are expected in the fully populated test. CustodyPassCompleted precedes authorized closeout transitions. SceneReleaseConfirmed means IOC report accepted/release authorized; InvestigationCompleted means scene release completed. Event sequence is used, not enum ordinal order.
- Session upload remains payloadVersion1 with additive evidence, report, relationship, hypothesis, finding/insight, documentation, measurement, procedural and assessment fields. Essential event envelope carries reasoning, review, body, fingerprint and custody records even with raw logging disabled. Server verification remains authoritative; client counts/weights do not become dashboard grades.
- Dashboards use cookie-authenticated RLS reads from assessment_sessions, session_score_categories, session_events, session_evidence_results, session_relationships, session_procedure_violations, optional session_findings/session_insights, profiles, classes, enrollments, assignments and scenarios. No reporting RPC/view is introduced. Existing ingest/verification/token/class RPCs remain unchanged.
- Production audit found107 sessions, all historical scenario1.0.0/scoring1.0–1.5 or unsupported test versions; no1.6/1.7 sessions. Live scenario registry is still old. Optional findings/insights tables return404 despite local migration017. Relationship interpretation and fingerprint identity columns are absent in child tables, so event payloads supply those details. No current production data was fabricated or backfilled.

## Information architecture

Student query views on the existing /results route: Overview, Attempts / Sessions, Reasoning, Evidence Relationships, Training Analytics. A selected real attempt scopes the detail views; /results/[sessionId] opens its complete record.

Instructor query views on existing /class-results: Class Overview, Students, Sessions, Reasoning Analysis, Evidence Relationships, Training Analytics. Student and session drilldowns retain their existing routes. Classes and Assignments remain available under the shared shell. No dead sidebar routes were added.

Scored assessment and guided training have separate sections and visual hierarchy. Historical categories retain their original scoring model and version labels. Mixed-version class averages/distributions are suppressed. Test attempts are excluded by default and can be included explicitly in filters. Student overview and detail cannot turn missing logs into deduction penalties.

## Visual and interaction changes

Shared collapsible left sidebar, compact header, ViCSI identity, neutral off-white surfaces, charcoal text, one restrained teal accent, subtle separators and medium radii. Removed giant card groups and dark assessment islands. Compact score summary replaces four large KPI cards. Labelled horizontal bars answer specific class questions; no pie charts or decorative trends.

Global filters use native disclosures, collapsed initially and open with active filters. Search, class, scenario, scoring version, verification, completed date range (UTC), sorting and test inclusion apply consistently. Tables scroll within their own boundaries, align numeric columns, use sticky headers, and provide row-wide native links while keeping specific student/session links accessible. Loading, empty, unavailable historical content and retry states are explicit. Long interpretations wrap vertically without clamping.

## Student changes

- Name/section, selected scenario and latest attempt date; attempt picker and compact history table.
- One Deduction Performance summary with60/25/15 components and checkpoint-response coverage. Fixed denominators are explained.
- Chronological reasoning timeline: checkpoint trigger/context limits, selected interpretation, qualitative verified strength, timing and instructor-only identifiers.
- Evidence Relationships: recorded interpretation/order, support result and evidentiary limitation. Historical board state is explicitly not correctness. Pending sessions do not reveal correct/incorrect assessment feedback.
- Actual submitted conclusion and version-aware result category, including both inconclusive support states.
- Deterministic improvement notes derived from assessed strengths, unsupported relationships and recorded blocked-action prerequisites. No generated advice service or invented learning metric.
- Separate Training Analytics with recorded procedure states, body transport, evidence workflow, guidance, blocks, custody and role/closeout timeline. No training score or penalty.

## Instructor changes

- Filter-scoped students-with-attempts, attempt count, comparable average and completed-upload count. Roster size and upload completion are not presented as scene release.
- Student table is central: latest matching attempt, class, attempt count, total and three component scores, training closeout; student drilldown retains full available history.
- Sessions view provides verification and component columns with date/score sorting and CSV export parity.
- Score distribution requires one scoring version. Conclusion distribution labels ground-truth versions so historical wife outcomes are not relabelled as current Paul outcomes.
- Checkpoint analysis ranks reasonable/strong interpretations among assessed responses, exposing common weak choices and preserving denominators. Relationship analysis counts supported interpretations, not Completed board state, and exposes common unsupported choices.
- Separate training analysis: recorded guidance, blocked event types and workflow milestone coverage. Missing completions are labelled unrecorded rather than proven failures. Each analysis links to its underlying sessions.
- Student detail reuses the same complete assessment and training renderer as session drilldown. Historical/mixed-version results remain readable.

## Reused/refactored components and reads

AppShell, AnalyticsUI, ResultFilters, SessionTable and SessionRecord provide shared layout, tables, filters, states and drilldown. Refactored DeductionResultPanels and ResultScoreSummary use the new visual system. ResultCategoryGrid and scenarioContent retain version-specific historical presentation. Existing Card and management routes inherit restrained shell tokens. Existing authentication, RLS, class/enrollment/assignment actions, pairing and export authorization remain.

Read adapters now paginate sessions and event histories, bulk-load class analytics in bounded batches, use deterministic ordering, exclude explicit test sessions by default, and distinguish load failures from empty datasets. Optional finding rows can fall back to frozen confirmedFindingIds. BODY-A documentation is not falsely listed as missed merely because it never reaches Processed. Training derives from actual events/states, including saved procedure notes when raw logs are absent, with event/note deduplication.

## API and schema impact

No upload contract, verifier, deduction formula, schema, RPC or production data changes. The read-only class CSV endpoint adds scoringVersion/includeTests filters to match the UI and uses the same shared date/search/class/scenario/status logic. Existing session export remains available.

Proposal only: review existing additive migration017 and coordinate the current scenario-registry/backend/game rollout before expecting current1.7 production sessions. Event JSON already supports review interpretations and custody; no new dashboard schema is necessary. Production read-only audit credentials are used only by local validation tools, never application data reads or client bundles.

## Validation

Evidence directory: ../evidence/dashboard-redesign/.

- Production Next16/Turbopack build and TypeScript check: pass.
- Full ESLint: pass with seven existing unused-variable warnings outside new dashboard code; no errors.
- Dashboard presentation/data tests:42 pass, no failures or skips when the current Unity workspace is supplied. Covers current/historical/pending/malformed/empty/loading/long text, component separation, all conclusion paths, vendor/review IDs, filters, test exclusion, mixed versions, body/closeout semantics, note deduplication and actual current review/custody upload captures.
- Browser tests:52 pass. Actual student/instructor page components rendered at375/768/1366px; bounded horizontal table scrolling and long reasoning text, plus row-wide native drilldown links, native filters and interactive real AppShell collapse/expand, active navigation and local sign-out callback. Framework router adapters isolate the shell test; sign-out does not contact Supabase.
- Authentication/token/crypto regression tests:36 pass, no failures or skips.
- Standard scoring suite:212 pass,0 fail,7 environment-dependent skips (219 total). Existing score definitions preserved.
- Extended Unity-linked scoring run:216 pass,2 fail,1 skip. The two failures are stale cross-repository historical comparisons: old ground-truth object vs current six-relationship export, and old phase1 byte hashes vs subsequently changed game files. No goldens or historical score definitions were overwritten. Current1.7 review parity and custody envelope tests pass, including two additional dashboard tests against those actual wire captures.
- Real-data render:20 anonymized non-test historical sessions read from Supabase with GET only, plus the actual current Unity completed-review capture. Current capture independently scores29.1667/100:10/60 reasoning,4.1667/25 relationships,15/15 conclusion; one locked review response. UI component points match. See data-validation.json and screenshots. These are local read-only render fixtures, not production inserts.

## Remaining limits

Production has no current1.7 sessions, so a live signed-in current-game dashboard upload round trip cannot be demonstrated there. Authenticated student/instructor end-to-end navigation against the deployed service was not exercised; authentication/RLS are preserved, and actual page components were exercised locally with anonymized real reads/current captured input. A normal authorized current-game upload after a separately managed rollout should verify that final integration.

Optional migration017 and scenario registry drift remain unchanged. The two extended historical-reference tests require versioned immutable fixtures rather than assumptions about mutable current game files. Seven pre-existing lint warnings remain. No manual Unity Editor wiring is required for this web-only redesign.
