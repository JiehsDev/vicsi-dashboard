# Dashboard evidence display follow-up — 2026-10-18

Reused `src/lib/data/evidenceDisplay.v1.json` and `src/lib/evidenceDisplay.ts`. The dashboard now resolves BODY-A in prose to the full `Body A – John` label, alongside Evidence 1 – Kitchen Knife, Evidence 2 – Blood Spatter and Evidence 3 – Empty Liquor Bottle. Unity's mapping data remains identical; this follow-up does not alter Unity procedures or physical markers.

The main shared SessionRecord already formats procedure descriptions, frozen deduction question/answer text and historical recorded answers for student and instructor detail routes. The follow-up adds formatting to legacy EvidenceTimeline actions/items/notes, detailed reasoning prompts/context/responses/feedback, Evidence Relationships review headings/interpretations/explanations, training measures and review guidance, and finding/insight cards. The server presentation adapter also resolves generated checkpoint and relationship prose, using copies rather than modifying source records. Session lists contain no evidence fields and require no evidence formatting. Existing CSV exports retain technical IDs alongside their readable label columns.

Internal IDs, React record keys, relationship identities, joins, authoritative scoring inputs, immutable uploaded snapshots, upload validation, Supabase records and API schemas remain unchanged. Historical records resolve during rendering and require no migration. Technical export columns and payloads intentionally retain IDs; visible evidence prose uses the shared formatter.

Validation completed locally:

- Dashboard suite: 48 passed, 0 failures/skips, including Unity capture parity and six evidence display regression tests. Evidence regressions now run through `npm run test:dashboard`; Unity parity is optional when VICSI_UNITY_PROJECT is absent.
- Display/session/upload suite: 23 passed, including actual upload handler tests with local mocked persistence, authorization, retries, historical uploads and unchanged authoritative grades.
- Browser fixtures: 21 passed across student/instructor lists and details, historical, empty and loading states at 375/768/1366px. DOM checks reject raw active evidence IDs and detect layout overflow.
- TypeScript, scoped ESLint and Next production build passed.
- Regression tests cover the exact requested fingerprint/collection descriptions, derived sample labels, all four labels in both roles, old raw-ID-only event records, source immutability, stored grades and historical marker numbers. An initial test used the non-completion status Observed, which is intentionally absent from the completed-procedure timeline; it was corrected to Processed and passed.

Browser artifacts are refreshed local fixtures under `docs/evidence/session-simplification/browser`. No live Supabase session or production website was modified or tested. No commits, pushes, deployments, seeds or database writes were performed.
