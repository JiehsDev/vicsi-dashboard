# Dashboard workflow fixes — 2026-10-20

Completed sequentially from the dashboard recheck. Changes are local; no database migration, live upload, production build or deployment was performed.

1. Fixed TS7022 in sessionUploadApi.test.tsx by explicitly typing the parsed article string and option array. The normal TypeScript project check passes; no strictness settings or included files were removed.
2. Added completed check-in, initial PPE, used-glove disposal, fresh gloves, fresh-swab loading, scaled evidence photography, simulated sample drying, paper packaging and optional unscored fingerprint practice to the identical Unity/dashboard procedure definitions. Unity's existing minimal-upload filter now retains these events without uploading raw logs. Started/blocked/tool-open events remain excluded. A Unity filter fixture verifies original timestamps, sequence numbers and separate sources survive serialization. Dashboard API tests combine that fixture with the case capture, render both actual detail routes and confirm every stored deduction category remains unchanged.
3. SceneReleaseConfirmed now says “IOC report accepted; scene release authorized”. InvestigationCompleted says “Completed investigation and released crime scene”. A focused test checks authorization without completion cannot claim the scene was released.
4. test:dashboard now runs TypeScript validation, the current SessionRecord/API/route suite, then clearly labeled legacy compatibility checks, stopping on any failure. typecheck, test:sessions and test:dashboard:legacy remain separately runnable. README documents local Unity integration and browser commands.
5. Unavailable/unanswered questions keep their neutral status message and omit the Received row. Answered questions still show their actual received weight, including negative/zero values. Both roles are checked using snapshots whose availability agrees with authored triggers; score totals remain authoritative.

## Final validation

- npm.cmd run test:dashboard with VICSI_UNITY_PROJECT: TypeScript passed, 23 current session tests passed, 52 compatibility tests passed. Zero failures/skips.
- npm.cmd run test:dashboard:browser: 21 checks passed at 375, 768 and 1366 px. Local fixture pages only; no production reads/writes. The rendered preview combines the case capture with the explicitly isolated Unity filter fixture.
- Unity ProcedureTimelineUploadTest: 14 checks passed, zero failures. No physical headset required. The fixture verifies the upload boundary; existing separate tool tests verify the actions that emit these events.
- Total: 110 checks passed, zero failed, plus successful TypeScript validation. git diff --check passed for touched code/data.
- Unity editor returned to edit mode, not compiling, scene clean. CSI_Environment scene SHA-256 unchanged: E441EE08004B03BAF5BE2CE53598E8542C4318BBB45FF690CD29429D78CADD3D.

Evidence: docs/evidence/dashboard-workflow-refresh-2026-10-20 in each repository. Existing omitted events are not invented or backfilled into historical sessions. The fixed tent numbering accepted by the user and the readable evidence-name mapping are unchanged. Deduction grading and identity/authorization rules are unchanged.
