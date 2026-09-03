# TRACEBOARD — Business Rules

Reference for the VR-CSI Instructor Forensic Analytics Dashboard.
Partido State University — Lagonoy Campus, Criminology Department.

**Status legend used throughout:**

| Mark | Meaning |
|---|---|
| ✅ | Implemented in this repo and verified working |
| 🟡 | Decided in discussion, **not built yet** |
| ❓ | Open question — needs a decision before building |

> The dashboard (this repo) and the VR game (separate Unity/Unreal project)
> are two codebases sharing one Supabase backend. Rules below marked
> "VR-side" are contracts the game must honour; they are not enforced by
> code in this repo.

---

## 1. Actors

| Actor | Access | Status |
|---|---|---|
| **Instructor** | Sees all students, all scenarios, class-wide aggregates | ✅ |
| **Student** | Sees only their own results, across every role they played | 🟡 |
| **VR game client** | Writes session results for one authenticated student | 🟡 |

❓ Who creates instructor accounts? Currently they must be created by hand in
the Supabase dashboard — there is no instructor signup flow, deliberately.

---

## 2. Identity & authentication

### 2.1 Web (dashboard)

- **RULE:** One shared sign-in page at `/login` for both instructors and
  students. Accepts **email or Student ID** in a single field. ✅ real —
  Student ID is translated to its internal identity email (below) and
  actually authenticates; verified end-to-end against the live database.
- **RULE:** `/signup` creates **student accounts only**. Instructor accounts
  are provisioned separately (via `npm run seed:accounts`). ✅ real —
  creates a Supabase auth user + `profiles` row via `upsert_profile()`,
  server-validated, duplicate Student IDs rejected, verified end-to-end.
- **RULE:** Every route except `/login` and `/signup` requires an
  authenticated session; unauthenticated visitors are redirected to
  `/login`. ✅
- **RULE:** An already-signed-in user visiting `/login` or `/signup` is
  redirected to the dashboard. ✅
- **RULE:** If the Supabase auth endpoint is unreachable, the app **fails
  closed** — treats the visitor as signed out and shows the login page,
  rather than crashing every route. ✅

> Supabase Auth requires an email or phone identity — there's no native
> username/password account type, and the signup form deliberately never
> asks for an email. **Resolved** via `src/lib/studentAuth.ts`:
> `studentIdToEmail()` derives an internal-only address
> (`{studentId}@students.traceboard.internal`) purely as an identity key —
> never sent, never shown to the user. `signIn()` translates a typed
> Student ID through the same function before calling Supabase, so the
> "Email or Student ID" field now genuinely supports both. Verified by
> signing in with a translated Student ID and receiving a real session.

### 2.2 Student signup fields

| Field | Rule | Status |
|---|---|---|
| Full name | Required | ✅ real |
| Student ID | Required, unique (duplicate → rejected with a clear message) | ✅ real |
| Section | **Required** — a single letter, chosen from a fixed dropdown (`A`–`F`, see `SECTIONS` in `src/lib/constants.ts`) | ✅ real |
| Password | Required, ≥ 8 chars, must match confirmation | ✅ real |
| 4-digit PIN | Required, exactly 4 digits, bcrypt-hashed server-side | ✅ real |

- **RULE:** Every student belongs to exactly one section — there is no
  "no section" state for a student. Enforced at three layers: the signup
  form only offers a dropdown (no free text), `signUp()` rejects a missing
  or malformed section server-side, and the DB itself rejects it via the
  `student_requires_section` / `section_is_single_uppercase_letter`
  constraints and validation inside `upsert_profile()` — so no insert path,
  including direct RPC calls, can create a sectionless student. Instructors
  are the opposite: `section` stays `null` for them, unchanged. ✅ See
  `supabase/migrations/003_require_student_section.sql`.
- **RULE:** Validation happens **both** client-side (instant feedback) and
  server-side inside `signUp()` (`src/app/signup/actions.ts`) — the client
  check is UX only and is never trusted on its own. ✅
- **RULE:** If profile creation fails after the auth user was already
  created, the auth user is **deleted** rather than left orphaned — a retry
  would otherwise hit "already registered" for an account that never
  actually worked. ✅

- **RULE:** The **PIN is not the password.** They are separate credentials
  with separate purposes: the password is for the web portal, the PIN is
  typed on a shared VR headset and is therefore more exposed
  (shoulder-surfing, cached on device). 🟡 *(enforced only by copy today)*

❓ Should the PIN be validated against weak values (`0000`, `1234`, birth
year)? Not currently checked.

❓ **Student ID format** is unspecified. The UI uses `2021-04521` as a
placeholder only. A real format/checksum enables typo detection — see 2.4.

### 2.3 VR game login

- **RULE:** Students log into the game with **Student ID + 4-digit PIN**.
  No email, no full password — laser-pointer text entry in a headset is
  hostile. 🟡
- **RULE:** ID + PIN are exchanged **server-side** for a short-lived session
  token. The token — never the PIN — accompanies score writes. 🟡
- **RULE:** The identity is cached after onboarding so students don't
  re-enter it every session. 🟡
- **RULE (security, non-negotiable):** The PIN endpoint **must** be
  server-side rate limited (e.g. lock after 5 failed attempts). 10,000
  combinations is trivially brute-forceable otherwise. 🟡
- **RULE:** A student may only write scores against their own identity.
  Enforced by database policy (RLS), **not** by trusting the game client. 🟡

### 2.4 Shared-headset handling

Headsets are shared across students in a lab, so a cached identity is a
correctness risk, not just a convenience feature.

- **RULE:** Show a **confirm-back step** after ID entry — display the matched
  name and section from a cached roster ("Priya Nakamura, Section A — that
  you?"). A raw ID is not self-checking; a typo otherwise silently
  attributes a session to the wrong student. 🟡
- **RULE:** Provide an explicit "Not you? Switch student" action on the
  onboarding screen. 🟡
- **RULE:** Auto-expire the cached identity after idle time or at a fixed
  daily reset, so the common case stays frictionless without relying on
  students remembering to switch. 🟡

### 2.5 Security posture — stated limits

- **Student ID alone is identification, not authentication.** The ID+PIN
  pair is what authenticates. 🟡
- ❓ **Unresolved:** Is any of this used as a **grade of record**? A 4-digit
  PIN on a shared device is appropriate for a training exercise but is *not*
  strong enough to defend a contested grade. This needs an explicit decision.

---

## 3. Metrics & definitions

| Metric | Definition | Unit |
|---|---|---|
| Evidence ID accuracy | Correct evidence identifications / total | 0–100 % |
| Procedural compliance | Required procedural steps followed correctly | 0–100 % |
| Scenario completion | Required scenario steps completed | 0–100 % |
| Avg response time | Time on task for a session | minutes |
| Error count | Procedural errors in one session | count |

- **RULE:** Roles are **Photographer** or **IOC** (Investigator-on-Case). A
  student may play multiple roles; results are tracked per session. ✅
- **RULE:** Class averages are the **unweighted mean** across all student
  sessions currently loaded. ✅

---

## 4. Student status classification

Single source of truth: `statusOf()` in `src/lib/types.ts`. ✅

```
flagged   if accuracy < 65  OR  compliance < 70
strong    if accuracy >= 90 AND compliance >= 90
onTrack   otherwise
```

- **RULE:** Thresholds are deliberately kept in one function so they are a
  one-line change once real pilot data says what "flagged" should mean. ✅
- **RULE:** Status is **derived at read time**, never stored. There is no
  `status` column; changing a threshold reclassifies all history
  consistently. ✅

❓ These thresholds are placeholders pending pilot data. Who owns the
decision to change them — instructor, department, or research protocol?

---

## 5. Expert benchmark

`EXPERT_BENCHMARK` in `src/lib/constants.ts`. ✅

| Measure | Value |
|---|---|
| Evidence ID accuracy | 96 % |
| Procedural compliance | 98 % |
| Scenario completion | 100 % |
| Time on task | 11 min |

- **RULE:** The benchmark represents a *proficient examiner*, is constant
  across scenarios, and is displayed as a target marker — never as a pass/
  fail line. ✅

❓ Should the benchmark vary per scenario? A bloodstain-pattern case and a
device-seizure case plausibly have different expert completion times. Today
one benchmark is applied to all.

---

## 6. Trends

- **RULE:** Trend = change in points **versus the previous grading period**,
  shown on KPI tiles (class-wide) and roster rows (per student). ✅ *(display)*
- **RULE:** Negative trends are visually emphasised (coral); zero and
  positive are neutral. Improvement is the expectation, decline is the
  exception worth surfacing. ✅

> ⚠️ **Known gap:** There is no period-over-period SQL view. Class trends in
> `CLASS_TREND` are **hardcoded illustrative values**, and per-student
> `trendPts` is optional (`trendPts?`) so real rows simply omit it until
> that view exists. Both are marked as such in code. **Do not present these
> numbers as real.**

---

## 7. Error logging

Two distinct concepts — do not conflate them:

| Concept | Scope | Source |
|---|---|---|
| `ScenarioAggregate.commonError` | The single most frequent error **for one scenario** | ✅ |
| `ErrorLogEntry` | A named failure mode aggregated **across the whole class** | ✅ |

- **RULE:** The class-wide error log is ordered by frequency, descending. ✅
- **RULE:** Per-student error counts feed the roster; named failure modes
  feed the class-wide log. ✅

---

## 8. Data & sync

### 8.1 Offline-first requirement

Headsets may be offline during a session; results must survive and upload
later.

- **RULE:** A **session UUID is generated client-side the moment a scenario
  starts.** 🟡
- **RULE:** Each completed run is stored as **its own local record**, never
  an overwritten slot — otherwise only the last offline session survives. 🟡
- **RULE:** Uploads are **idempotent** — keyed on the session UUID, so a
  retried sync cannot create a duplicate. 🟡
- **RULE:** Record **two timestamps**: device clock (for offline ordering)
  and server receipt (for audit trail and trend calculations). Headset
  clocks drift and reset. 🟡
- **RULE:** Surface a **pending-upload indicator** in both the headset and
  the dashboard, so an instructor can distinguish "not synced yet" from
  "didn't play." 🟡

### 8.2 Dashboard read model

Supabase views/tables consumed by this repo:

| Source | Purpose | Exists in DB? |
|---|---|---|
| `student_session_summary` | Per-student session results | ✅ **5 real rows** |
| `scenario_aggregate` | Per-scenario completion + common error | ✅ has data |
| `evidence_events` | Per-session action timeline | ✅ |
| `class_error_log` | Class-wide named failure modes | ❌ **missing** |
| `profiles` | Role, Student ID, section, PIN hash | ✅ `001_profiles.sql` applied, live |

> ⚠️ **`003_require_student_section.sql` not yet applied.** Written and
> reviewed but, like `001`/`002` before it, needs to be run by hand in the
> Supabase SQL editor — this repo has no DB connection string or CLI link,
> only the service-role REST/RPC surface, which can't execute DDL. Until
> it's run, the required-section rule is enforced only by the signup form
> and `signUp()` (§2.2) — not yet backstopped by the DB constraint or by
> `upsert_profile()` itself. Apply it before relying on the DB layer.

> ⚠️ `class_error_log` **does not exist** (verified: REST returns 404), so
> `getClassErrorLog()` always errors into the mock fallback and the
> class-wide error panel can never show real data.
> Fix: `supabase/migrations/002_class_error_log.sql`.

> ⚠️ **`student_session_summary` is not empty.** An earlier probe using the
> anon key returned `[]` and was read as "empty table" — actually RLS
> filtering anon out. Querying with an authenticated session (verified by
> actually signing in as both seeded accounts) surfaces **5 real pre-existing
> rows** ("Marasigan, J.", "Belarmino, R.", etc.) that predate this repo's
> mock data and were never seen in any prior screenshot, because every
> earlier verification pass used a forced-mock bypass that never exercised
> the real authenticated query path.
>
> Those real rows have **only the original columns**: `id, name, role,
> scenario_id, scenario_name, accuracy, compliance, time_on_task_min,
> error_count, session_id`. **`completion_pct`, `section`, and `trend_pts`
> do not exist in the real table** — they were added to the TypeScript
> model during the Traceboard redesign but the database was never migrated
> to match. This produced a live bug (`"undefined%"` / `NaN%` rendered on
> both the instructor overview and the student dashboard) that went
> undetected until a real authenticated session hit real data for the first
> time. **Fixed**: `completionPct` is now optional in the type, every
> render site guards it and shows `—`, and class-wide averages filter out
> undefined before dividing. `section` and `trendPts` were already optional
> and degraded safely.
>
> ❓ Still open: is a real migration needed to add `completion_pct` /
> `trend_pts` to the actual view, or is per-student completion tracking
> being dropped from scope? Whoever owns the SQL view needs to decide —
> this repo can't safely guess at a view definition it doesn't control.
>
> **Consequence for the Class List page** (`/class`, added after this
> investigation): it groups by `section`, which — per the above — the real
> `student_session_summary` rows don't have. Left alone it would show all
> 5 real rows under a single "Unassigned" bucket rather than guessing; this
> was never a bug in the grouping logic (verified directly against the DB:
> the same logic correctly sorted the seeded `profiles` row with
> `section: "A"` into "Section A"). It resolves itself once `section`
> exists on the real view — same open question as `completion_pct` above,
> same owner.
>
> **Dev-only workaround, added on request:** `FORCE_MOCK_DATA=1` in
> `.env.local` makes `getStudentSessionSummaries()` (`src/lib/
> supabaseClient.ts`) skip the live query entirely and always return the
> 14-student `MOCK_STUDENTS` roster (sections A–D), so the Class List page
> has something to demo before the real view is wired up. **This is
> currently ON** — every page reading the student roster (`/` and `/class`)
> is showing mock data, not the 5 real rows, until that flag is removed.
> Verified end-to-end over a real authenticated session (logged in as the
> seeded instructor, fetched `/class`, confirmed sections A/B/C/D render
> with 6/4/2/2 students and none of the old real-row names appear).

- **RULE:** All reads use the **session-aware server client**, so RLS sees
  requests as `authenticated`. ✅
- **RULE:** Every query **falls back to mock data on error** rather than
  crashing the page, and logs a warning naming the failed query. This keeps
  the dashboard demonstrable when the backend is unreachable. ✅
- **RULE:** All Supabase requests are capped by a **5-second timeout**.
  Without it, an unresolvable host stalls each call for ~25–30 s (OS-level
  DNS retry) and compounds across queries. ✅

> ⚠️ Mock fallback is a **development and demo affordance**. Before pilot
> use, decide whether silently showing mock data is acceptable or whether
> the UI must visibly say "backend unavailable." ❓

> ⚠️ **No row-level restriction on `student_session_summary`.** Now that
> students authenticate with real accounts (§2.1), any signed-in student
> can read every other student's rows through this function — the app UI
> only shows a student their own data, but the underlying query has no RLS
> stopping a direct API call from pulling the whole roster. `profiles` has
> proper RLS (§2.1); this table does not yet. ❓

---

## 9. Privacy & retention

❓ **Entirely undecided.** Needs answers before real student data is
collected:

- How long are session recordings and evidence timelines retained?
- Can a student see another student's name in any view? *(Today the
  instructor roster shows all names — correct for instructors; the student
  portal must scope to `auth.uid() = self` via RLS.)*
- Is data used for research? If so, consent and ethics approval apply.
- Who can export or delete a student's records?

---

## 10. Build order (agreed)

1. ✅ Instructor dashboard — overview, class list (by section), student profile
2. ✅ Unified login + student signup — **real**, not just UI: self-service
   student signup creates a real account (`upsert_profile` RPC, bcrypt PIN
   hash, duplicate-ID rejection), and login accepts a real Student ID via
   `studentIdToEmail()`. Verified end-to-end against the live database
   (create → read back → sign in → duplicate rejected → cleanup), not just
   type-checked. The VR game's PIN-based login (§2.3) is separate and still
   not built — rate limiting there is still the blocker, unchanged.
3. 🟡 RLS policies — `profiles` done (students read only themselves);
   `student_session_summary` still has **no row-level restriction** (see
   §8.2) — any authenticated student can currently read the whole roster
   via a direct API call, even though the UI only shows their own row
4. ✅ Student grades view — `/student`, reuses the instructor's
   student-profile layout exactly (same Card/CompareBar/StatusPill/
   timeline components), self-scoped by `profiles.student_id`, role-gated
   both directions (`(dashboard)` redirects students away, `/student`
   redirects non-students away)
5. 🟡 Session inbox — idempotent upsert target for VR sync
6. 🟡 VR-side onboarding — ID + PIN, confirm-back, offline queue

---

## Open questions summary

Consolidated from above — each blocks or shapes work downstream:

1. Is any of this a **grade of record**? (Sets the required auth strength.)
2. What is the real **Student ID format**?
3. Should the **expert benchmark vary per scenario**?
4. Who owns changes to the **flagged/strong thresholds**?
5. **Retention and privacy** policy for student session data.
6. Who provisions **instructor accounts**?
7. Should **mock-data fallback be visible** to users in production?
8. Should **weak PINs** be rejected at signup?
9. Who owns `student_session_summary`'s real schema, and can it be
   migrated to add `completion_pct` / `trend_pts`? (§8.2 — confirmed via
   direct query, not assumed.)
10. `student_session_summary` has **no RLS** — any authenticated student can
    read the full roster via a direct API call today. Needs a policy
    scoped through `profiles.student_id`, mirroring how `profiles` itself
    is already locked down. (§8.2)
