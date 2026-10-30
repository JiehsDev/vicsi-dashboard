# Student Home and orientation — 29 October 2026

Implemented on `feature/student-dashboard-home`, based on the existing dashboard checkout. No deployment, database migration, grading change, seed execution or Unity build was performed.

## Student experience

- `/results/home` is the default destination for a student entering through `/` after login. The Home brand link returns there.
- Navigation: Home, My Sessions and How to Play; labels remain visible on small screens.
- Home shows a state-aware next action, latest non-test attempt, stored score components, up to two recorded-answer review links, recent attempts and last server receipt information.
- No attempts, excluded test records, historical scoring and unavailable/instructor-review results have explicit guidance. A missing score does not become a zero. Home does not claim an offline headset is uploading.
- `/results/guide` explains current student-code identification, identity confirmation, completing closeout, tool/menu navigation, score weights and missing-session troubleshooting. It contains no case-specific answer key.
- `/results` retains its session history and filters. Empty histories, filtered-empty results and test-only records have different messages and actions.
- Session details retain their recorded content and score calculation, with section navigation and simple numbered question anchors for exact-answer review links.
- Personal progress charts, instructor commenting and new research questionnaires remain outside this initial release.

## Data handling

Reads use the existing authenticated profile and cookie/RLS-scoped results functions. Both new routes independently check the student role in addition to the existing `/results` layout. Home does not fetch another student's sessions or expose headset credentials.

Assessment attempts sort by play/start time with completion/receipt fallback. A delayed retry receipt does not replace a newer played attempt. Test sessions remain separate from Home's learning summary; the existing explicit test-history route remains available.

Review suggestions are limited to verified current results with recorded selected answers and verified question snapshots. They use saved answer weights and link to the corresponding session question; they do not assign new grades or infer mastery. Historical or unavailable data gets review guidance without invented question detail.

## Validation

- `npm run build`: passed; both new routes compiled as dynamic protected routes.
- TypeScript validation: passed.
- ESLint for changed application and testing files: passed.
- `npm run test:dashboard`: 97 tests passed, six optional Unity-file-dependent checks skipped. Includes student-home logic, session expiry, upload handling, authorization, records and legacy scoring/presentation compatibility.
- New responsive browser suite: 37 passed across 375, 768 and 1366 px. Includes first use, completed, review-needed, test-only, historical, long text, guide, empty/filter/error states and exact-answer navigation.
- Existing student/instructor session browser suite: 21 passed.
- Four additional fixture-renderer assertions verify login and instructor-role redirects on the two new student pages.
- Rendered desktop and mobile screenshots inspected for layout and readability. Previews use synthetic local records; no production account or database was used.

The existing session preview generator was also corrected: its complete recorder fixture replaces, rather than duplicates, the base capture's recorder submissions. This fixes invalid composite preview data without modifying production records or scoring.

## Reproduction

```powershell
npm.cmd run test:dashboard
npm.cmd run test:student-home -- --browser
npm.cmd run build
```

The new browser command writes previews to a temporary directory by default. Set `VICSI_STUDENT_PREVIEW_DIR` to choose a local output folder. The existing session browser suite additionally requires `VICSI_UNITY_PROJECT` to locate its saved Unity captures.

Review artifacts for this run are kept outside Git at `C:/Users/Roduf Eleu/ViCSI Checkpoints/2026-10-29/student-dashboard-home`, including desktop/mobile screenshots, synthetic HTML, build output and test reports. Pre-existing seed edits and other untracked local documentation were preserved.
