# Dashboard demonstration data

This seed adds synthetic examples without changing real account passwords,
roles, session scores, enrollments or scenario registrations.

## Dataset

- A professor-owned **ViCSI Demonstration — Evidence & Deduction** class, section
  D, academic year 2026–2027, first semester. The instructor is resolved from
  John Doe's existing **ViCSI Dev Test Class**, rather than hardcoded by email.
- Six clearly labeled demo students: Ana Reyes, Miguel Santos, Sofia Cruz,
  Carlo Mendoza, Bea Villanueva and Diego Ramos. Each name ends in `(Demo)`.
- Three attempts per demo student, plus four new examples for the existing
  John Doe demo identity `2099-00099`: 22 sessions altogether.
- Five perfect attempts, plus distinct 15%, 57.08% and 86.67% examples and
  improvement histories. Scores are derived from current rules 1.7.0 and
  ground truth 1.2.0, then recomputed by the real server verifier.
- Thirteen saved questions per session: six reasoning checkpoints, six evidence
  relationship interpretations and a conclusion. Original option text, selected
  answers, weights and timestamps are frozen in the snapshot.
- Recorder documentation ranges from 8/24 to 24/24, separately from deduction.
- Evidence records and a chronological timeline cover scene turnover, IOC/SOCO,
  markers, scaled photography, measurement, recording, drying/packaging samples,
  fingerprint identification, custody and closeout.
- Simulated play dates are fixed from 28 October to 6 November 2026 so reruns
  have stable IDs and payloads. They are examples, not actual headset activity.

## Where to view

All seeded attempts use `is_test_session=true` and `client_version` equal to
`vicsi-dashboard-demo-v1`. They do not contribute to normal student progress or
instructor class-performance averages. Existing test-session filters are retained.

- Instructor: `/class-results?includeTests=true`.
- Student, including John Doe: `/results?includeTests=true`.
- Instructor class roster: open the new demonstration class in the sidebar;
  select a student and enable **Include test sessions** to view their history.
- Open an individual session to see its score, questions/answers, documentation
  and timeline. The existing pagination can be exercised with the seeded history.

## Run and repeat

```
npm run seed:demo
npm run seed:demo -- --apply
```

The first command previews the dataset without touching the database. The second
uses the server-only credentials in `.env.local` and the HTTPS database API.
It does not require a working PostgreSQL pooler or a new migration.

The live schema still requires `assessment_sessions.assignment_id`. When this
constraint is present, the seed creates an inactive **Demo data compatibility
record** per affected class. It does not reactivate or edit existing assignments,
and does not reintroduce assignments into the UI. Newer nullable schemas skip
these compatibility records.

Existing demo users must carry this seed's protected `app_metadata` marker.
Conflicting users, classes or sessions cause the run to stop; unrelated records
are never overwritten. Existing demo passwords are preserved on rerun. Session
IDs and payload hashes are deterministic; previously saved event/evidence rows
can be repaired after a partial failure without duplicating the session.

Random initial passwords for the six new accounts are saved only in the ignored
local `test-output/dashboard-demo-credentials.json`. John Doe's and the professor's
credentials are unchanged. Do not commit or share that credentials file.
The non-secret local result manifest is `test-output/dashboard-demo-report.json`.

Verification covers all three score components, question snapshot validation,
documentation totals, chronology, deterministic hashes and synthetic labeling.
After applying, the script signs in as one new demo student and checks that only
that student's three sessions are visible, including a perfect attempt, then
signs out the temporary session. No real student is impersonated.
