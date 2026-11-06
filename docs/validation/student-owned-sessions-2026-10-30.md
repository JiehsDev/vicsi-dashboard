# Student-owned sessions instead of assignments

## Behavior

- Instructor landing page is **Recent Sessions**, listing every matching received attempt, newest uploads first. Repeated attempts from the same student are retained. Five rows per page, Previous/Next links, class/name/date filters and the test-session filter are preserved.
- Student names open their history; session links open the existing answer/procedure/score record.
- Assignment navigation, class assignment counts and assignment creation/detail screens are removed. Old assignment URLs redirect to Recent Sessions. The retired pairing page redirects to student Home.
- Class enrollment remains the boundary for instructor access. Identifying a student does not authorize every professor to read their records.
- New VR upload tokens resolve a class directly from enrollment, preferring an enrolled class hint and then active/recent enrollment. Assignment IDs are null for new tokens/sessions. Existing historical assignment records and legacy token fields are retained for compatibility.
- Retries of a received session retain its original class even after unenrollment. An unrecognized class hint cannot override enrollment. A new attempt with no enrollment receives `NO_CLASS_ENROLLMENT`; enrolling the student allows a later retry.

## Database rollout

Apply `supabase/migrations/020_student_owned_sessions.sql` **after 019**, before or alongside deploying the dashboard. It relaxes only the assignment-ID NOT NULL constraints and replaces the service-only upload-token function. No student/session/assignment rows are deleted; scoring, payload binding and session RLS are unchanged. This migration has not been applied to production during this task.

Do not restore NOT NULL constraints as a rollback while assignment-free rows exist. Existing student-owned sessions must be preserved.

## Validation

- Dashboard unit/integration checks, TypeScript and production build pass.
- 125 browser checks cover student screens plus instructor pagination at mobile, tablet and desktop widths.
- PostgreSQL integration via an isolated PGlite database passes seven scenarios (eight TAP checks including the parent). It applies the real 008, 009, 010, 017, 019 and 020 migrations against synthetic identity/class tables, then exercises assignment-free token issuance, actual session ingest and duplicate retry, RLS for student/owning/other professor, service-only execution, unenrollment retry, missing enrollment and ownership/disabled-code checks.
- PGlite is installed outside this repository, not added as an application dependency. To rerun: set `PGLITE_MODULE_PATH` to its module URL and run `node --test Tools/testing/student-owned-sessions-db.test.mjs`.

Changes are local on `feature/student-dashboard-home`; production migration/deployment and a physical headset upload are not claimed.
