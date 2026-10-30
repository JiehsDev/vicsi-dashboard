# ViCSI dashboard compatibility review — 2026-10-20

Scope: local dashboard source against the current Unity workspace. Review only; application code, databases, scoring rules and deployments were not changed. Existing uncommitted changes were preserved. Live production configuration and browser appearance were not checked.

## Findings

### 1. Current procedure timeline omits newer completed training steps (priority: high)

Unity logs PhotographicScaleCaptured, SampleDryingCompleted and SamplePackaged, but neither Assets/Resources/ProcedureTimeline_1.json nor dashboard src/lib/scoring/data/procedureTimeline.v1.json includes these events. EducationalSessionRecord.BuildMinimalUpload filters current 1.7.0 uploads using the Unity definition; dashboard procedureTimeline independently filters using its matching definition. Consequently these completions disappear before the dashboard can show them. PhotographedFinal only says “with marker”, which does not confirm a ruler was used.

Recommended update: add factual completion entries for a scaled final photo, a dried sample and paper packaging to both definitions, with readable source-evidence labels. Keep preparation/handling separate from deduction points. Display historical missing events as unrecorded rather than inferring that the student skipped or completed them. Keep attempted/blocked actions out of this intentionally completion-only record. Fingerprint practice is also currently local; if included, label it explicitly as optional practice without points.

This requires coordinated Unity upload-filter and dashboard presentation changes. A dashboard-only label change cannot recover records excluded from old uploads.

### 2. Timeline claims scene release before release is complete (priority: medium)

The shared definition maps SceneReleaseConfirmed to “Released crime scene”. SceneTurnover emits that event on entering the SceneRelease phase, after the IOC completion report. SOCOCloseout subsequently performs the actual release and advances to InvestigationComplete, which emits InvestigationCompleted. The existing trainingAnalytics adapter already distinguishes authorization from completed release; the active SessionRecord timeline does not.

Recommended update: use “IOC report accepted; scene release authorized” for SceneReleaseConfirmed and indicate completed release on InvestigationCompleted. Update both mirrored definitions. Add a case containing authorization but no InvestigationCompleted, and require that it never says the scene was released.

### 3. Main dashboard test command still emphasizes superseded UI (priority: medium)

Both current detail routes render SessionRecord. npm run test:dashboard still tests DeductionResultPanels and older analytics views, including assertions that student output hides numerical weights. SessionRecord deliberately shows the captured option weights; test:sessions covers that current behavior and its actual routes. Passing the older command alone therefore does not validate the current product.

Recommended update: make a clearly named default current-dashboard command include the existing session-record and upload-route tests. Keep legacy component/scoring coverage in a separate compatibility suite. Add cases for scaled captures, independently prepared samples, historical absence, authorization versus completed release, and optional practice staying unscored. Use a fresh Unity upload made after those workflow changes as the integration fixture; the existing parity fixture remains useful but predates those additions.

### 4. Unavailable questions display an earned zero (priority: low, presentation)

SessionRecord shows “Not available during this investigation” and then “Received: 0 / maximum” when no answer was selected. This preserves existing math but can read as a failed answer to an unavailable question.

Recommended update: show “No answer recorded” or “Not available” in that row while keeping the existing authoritative deduction calculation and component totals. Distinguish unavailable from available-but-unanswered. This is a clarity improvement, not a scoring change.

## Already aligned / limits

- The shared timeline definitions currently match exactly. Evidence labels and current question mappings pass parity checks.
- Current scoring remains server verified with 60/25/15 deduction components. Custody and practice must remain separate from grading.
- Explicit inventory-storage and final custody-transfer events already have timeline entries; six-item custody coverage passes.
- The new Unity album stores Texture2D images and capture metadata locally. Current minimal uploads do not include those images or album records. A dashboard photo viewer would require a separate upload/storage feature; it is not a small UI compatibility fix.
- Unity Scene Test Start is an editor menu; its updated presets do not require matching dashboard menu entries.

## Validation executed

With VICSI_UNITY_PROJECT pointing at the current Unity workspace:

- npm.cmd run test:sessions: 19 passed, 0 failed, 0 skipped. Includes current upload/API/detail-route fixtures and 576 scoring parity cases within one test.
- npm.cmd run test:dashboard: 52 passed, 0 failed, 0 skipped.

Total: 71 tests passed. These passing tests do not cover the missing workflow entries above. No build, browser test, live upload, migration or deployment was performed for this read-only review.
