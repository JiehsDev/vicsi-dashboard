# Dashboard recheck — 2026-10-20

Read-only application review against the latest Unity blood-swab, camera, logging-table and fixed tent-numbering decisions. Only these review artifacts were written; application code, database and deployment were not changed. Existing worktree changes were preserved. Production/live Supabase state and browser layout were not audited.

## Confirmed outstanding work, in priority order

1. TypeScript validation fails in src/lib/__tests__/sessionUploadApi.test.tsx:100 and :101 (TS7022 for article and options). Reproduced with npx.cmd tsc --noEmit --incremental false, exit 1. These test files are included by tsconfig.json. The current runtime test loader uses transpileModule, so green runtime tests do not catch these compiler errors. Fix the type errors before claiming the repository passes type validation. A production build was not executed.
2. Procedure recording is behind current Unity. SceneLogSigned, FreshGlovesEquipped, FreshSwabLoaded, PhotographicScaleCaptured, SampleDryingCompleted and SamplePackaged are absent from both mirrored timeline definitions. The current Unity 1.7.0 minimal-upload filter excludes them, and the dashboard procedureTimeline also drops them even if supplied. This hides completed sign-in, resupply, scaled capture, drying and paper packaging. FingerprintPracticeCompleted is also absent; include only if optional unscored practice should appear. Add factual completion mappings in both repositories without changing deduction grading. Old omitted events cannot be reconstructed from their absence.
3. SceneReleaseConfirmed still renders as “Released crime scene”. Unity emits it when entering the release phase; InvestigationCompleted is emitted after release completes. The existing older trainingAnalytics adapter has the correct distinction, but the active SessionRecord uses the stale shared definition. Correct the mirrored labels and test a record with authorization but no completed release.
4. npm run test:dashboard still focuses on earlier DeductionResultPanels/analytics UI. Active student/instructor details use SessionRecord, covered by test:sessions. Include the current suite in the default dashboard checks and keep legacy coverage clearly identified. Add fixtures for the omitted procedures; existing green tests are not evidence those procedures appear.
5. Minor presentation ambiguity remains: an unavailable question shows “Not available during this investigation” followed by “Received: 0 / maximum”. Consider a neutral unavailable/no-answer label without altering authoritative scores.

## Confirmed aligned

- Current evidence labels resolve to Evidence 1 – Kitchen Knife, Evidence 2 – Blood Spatter and Evidence 3 – Empty Liquor Bottle. A derived knife blood sample also receives a readable label.
- Actual procedureTimeline probe renders trace marker 4 on Evidence 1 correctly. The user's accepted fixed numbering requires no dashboard numbering change.
- Explicit storage and final custody events already have timeline mappings.
- Unity and dashboard timeline JSON definitions match exactly; the problem is shared missing coverage, not divergent copies.
- Camera-frame artwork restoration, the physical logging table, and paper-sleeve label fixes are Unity visual changes. They do not require matching dashboard artwork or a website redesign.
- Local camera album photos are not included in the current upload. A web photo gallery would be a separate feature.

## Checks executed now

VICSI_UNITY_PROJECT pointed to the current Unity workspace:

- npm.cmd run test:sessions: 19 passed, 0 failed, 0 skipped.
- npm.cmd run test:dashboard: 52 passed, 0 failed, 0 skipped.
- npx.cmd tsc --noEmit --incremental false: FAILED, two TS7022 diagnostics above.
- Executed the real procedureTimeline/evidenceLabel adapters against synthetic current workflow events. Both new event omissions and premature scene-release wording reproduced. Probe output: dashboard-recheck-2026-10-20.json.

71 runtime tests passed; the repository is not fully green because type validation fails. No deploy, build, database write, or production upload was performed.

## Resolution
The findings above were addressed locally in docs/reviews/dashboard-workflow-fixes-2026-10-20.md. Final result: 110 checks passed plus TypeScript validation. Production deployment was not changed.
