# ViCSI admin foundation — stage 1

This stage adds `/admin`, `/admin/access`, and `/admin/activity`. User editing,
instructor invitations, Resend integration, authentication-event reporting and
headset telemetry remain later stages. Navigation contains only functioning pages.

## Access model

Administrator membership is stored in `system_administrators`, independently of the
existing student/instructor profile. Academic roles and their class/session policies
are unchanged. An administrator account may exist without an academic profile.

- The same sign-in page and signed dashboard session are used.
- The server layout, individual data loaders and mutation action verify current
  administrator membership. The database independently enforces membership through
  RLS and the access mutation RPC. No browser role selector grants privileges.
- Missing or inactive membership grants no administrator access. The next request
  after suspension is checked against the database, independently of token refresh.
- Bootstrap uses the service credential only in an operator-run CLI. Ordinary users
  cannot insert/update memberships or write audit entries directly.
- The last active administrator is protected in the database on updates and deletes.
  Membership changes use a shared transaction lock. The UI has no self-suspension
  control. Existing staff access can be suspended/restored with a recorded reason.

## Audit records

`system_audit_events` records successful changes to administrator access, class
details/archive status, class enrollment, and class invitations. The class invitation
trigger is attached when migration 021's table exists; apply 021 before 022, or rerun
022 after installing 021. Existing class/invite functions keep their own permissions.

Audit inserts happen in the same transaction as the change. A rolled-back mutation
does not leave a success event. The log contains actor and target names, date,
action, optional reason, and allowlisted before/after values. Invitation tokens,
class codes, passwords, PIN hashes, auth tokens, API keys and whole database rows are
never copied into audit records. Application roles cannot insert or rewrite history.

Activity filters use Philippine day boundaries, matching the displayed timezone.
The log shows 20 records per page, with expandable change details. Empty results,
invalid date ranges, and unavailable data have distinct messages.

## Provision the first administrator

1. Apply `supabase/migrations/022_admin_foundation.sql` in Supabase SQL Editor.
   It grants access to nobody automatically. Migration 021 is still the preceding
   class-invitation setup step; this migration can install the admin foundation
   independently when that table is absent.
2. With the existing server environment configured locally, verify the selected
   account using the CLI below. It never logs passwords or service credentials.
3. To create the specifically requested account, use:

   ```powershell
   node --env-file=.env.local Tools/provision-system-admin.mjs --email vicsi.admin@parsu.edu.ph --name "ViCSI Administrator" --create-account --apply
   ```

   The CLI checks that the admin schema is available before creating an auth account,
   and requests the password privately from an interactive terminal. It does not
   send email or overwrite an existing account's password. If a newly created auth
   account cannot be granted access, it attempts rollback and reports the result.

   For an existing, verified sign-in account, omit `--create-account`. Without
   `--apply`, the command only checks setup prerequisites and the selected account.
4. Sign in normally; the academic workspace entry routes administrators to `/admin`.

Migration 022 was applied by the operator and verified on 2026-11-06. The requested
`vicsi.admin@parsu.edu.ph` account was created and granted administrator membership
through the protected CLI. Its password is not saved in this document or source.
Stage 2 requires the separate additive migration 023; see `ADMIN_USER_MANAGEMENT.md`.

## Design research and decisions

Sources reviewed on 2026-11-06:

- [NN/g: Ten usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/)
  — consistency, visibility of system status, error prevention, recognition and
  focused information hierarchy.
- [W3C: WCAG 2.2 additions](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/)
  — visible keyboard focus, focus remaining visible, and usable interaction targets.
- [HTTP Archive Web Almanac: Generative AI](https://almanac.httparchive.org/en/2025/generative-ai)
  — recurring visual defaults discussed in AI-generated sites.
- [Signs of AI design](https://github.com/febbhav/signs-of-ai-design)
  — a creator-maintained field guide to repeated visual patterns; treated as design
  observations rather than a scientific authorship detector.

ViCSI keeps its existing blue palette, logo, typography, header, dark mode and sidebar
behavior. The primary surface is an activity table. A smaller contextual column links
to access management and the activity log. Counts use one flat strip. There are no
decorative charts, gradients, glass effects, invented operational metrics, animated
backgrounds, or equal-weight card grids. Whitespace separates tasks and reading groups.

Desktop uses the available workspace width. Tablet stacks the overview columns.
Mobile renders records with visible field labels, paired date filters, readable
wrapping names, and 44px controls. Access changes use the existing custom dialog,
with a required reason, a clear consequence, Cancel/Escape, focus restoration, and
pending submission feedback. The log reports actual saved activity; failures and
unavailable data do not become fake zero counts or success messages.

## Validation

- `Tools/testing/admin-foundation-db.test.mjs`: isolated PostgreSQL/PGlite executes
  the real migration. Covers default-deny access, no self-promotion, last-admin
  protection, suspension/restoration, restricted academic access, atomic audit
  records, and absence of invitation secrets in audit output.
- `adminAccess.test.ts`: server guards, identity mismatch, revocation, RPC scoping,
  validation and safe errors.
- `adminPresentation.test.ts`: filters, date boundaries and readable action labels.
- Browser fixtures use synthetic records, with no production reads or writes.
  Desktop, tablet, mobile, both themes, empty/error states, long names, native
  keyboard dialogs and pending/cancel behavior are exercised. Screenshots remain
  in the local Temp directory.
- Multi-client concurrency and a live signed-in admin account require database
  activation; the isolated database test does not claim those end-to-end checks.

Final local validation on 2026-11-06: production webpack build, TypeScript, scoped
ESLint, dashboard regression checks, seven isolated PostgreSQL checks and all 236
responsive browser checks passed. Admin tests include text contrast of at least
4.5:1 for the checked body/table/status text in both themes, visible keyboard focus,
record details opened by keyboard, and modal validation/cancel/pending submission.
