# Stage 2: users and instructor invitations

Administrator account provisioning and migration 022 are complete. Stage 2 adds
Users and Instructor invitations to the existing administrator sidebar. It keeps
ViCSI's blue palette, logo, typography, theme toggle and custom modal conventions.
Desktop uses full-width tables; narrower screens reflow records with field labels.

## Activation

Apply `supabase/migrations/023_admin_users_and_setup_links.sql` in Supabase SQL Editor,
after 018, 021 and 022. Migration 023 was applied by the operator and verified through
the HTTPS database API before Stage 3 began. No destructive reset or general schema
push was attempted.
The current implementation permits older deployments that return PGRST202 for the
new suspension RPC; other access-check errors deny access. After 023, suspension is
enforced by database policies as well as web checks.

If a normal PostgreSQL connection is available, the scoped alternative is:

```powershell
node Tools/testing/class-invites-migration.mjs --admin-users --apply
```

The script uses the existing server environment and `pg` installation; it never
prints connection credentials. Do not rerun the admin provisioner to activate 023.

## Tasks

- Users: literal name/email/Student ID search, role/access filters, 20 per page,
  account details and existing class membership. Student internal Auth emails are
  not disclosed in the directory.
- Edit display name and student section with a recorded reason. UUID, sign-in
  identifiers, role, enrollments, scores and session ownership remain unchanged.
- Suspend/restore academic accounts with a reason. Existing browser sessions lose
  access on the next request, including RLS reads and instructor management RPCs.
  Headsets learn disabled access at their next directory sync; disconnected devices
  cannot be remotely revoked immediately. Previously recorded uploads are preserved.
  Restore preserves a VR code's pre-existing disabled state.
- All administrator memberships, including inactive ones, are protected from
  ordinary user edits/suspension/recovery. Use Administrator access for privileges.
- Create a password recovery link after verifying the student's/instructor's
  identity. Password change does not restore a suspended account.
- Invite a new instructor by name and email. The recipient sets their own password;
  an existing email is rejected and never promoted or overwritten.

## Setup links

Instructor links expire in 48 hours; recovery links expire in one hour. Admins can
copy any active link repeatedly, replace an unfinished link, or revoke it. Both
lists are paginated. A recipient opening a link does not consume it. Successful
password submission consumes the link and asks the recipient to sign in normally.
No browser session is silently replaced by invitation acceptance.

Tokens contain 256 random bits. Only SHA-256 hashes and AES-256-GCM ciphertext are
stored; the encryption key is derived with purpose separation from the existing
server session secret (falling back to the service-role key). Keep that secret
stable; changing it requires replacing old links. Ciphertext and service credentials
are server-only, read only after a fresh administrator guard. Link fragments keep
tokens out of request URLs; setup responses disable caching and referrers. Share
copied links privately, using the deployed dashboard's origin.

Public setup requests enforce origin checks, bounded JSON bodies and persistent,
fail-closed rate limiting. A five-minute database claim serializes redemption;
replace/revoke refuse while a claim is live. Auth account creation is followed by
atomic profile activation and audit insertion. If activation fails, only the
newly created Auth account may be rolled back; ambiguous commits are reconciled
before deletion. Recovery never creates/deletes an account or changes its role.

Successful admin changes and link completions enter the append-only audit log.
Passwords, link tokens, ciphertext, PIN hashes and service keys are excluded.

## Email delivery

Stage 2 originally supplied copyable links. Stage 3 adds Resend delivery and provider
statuses using the same setup URL, retaining Copy link independently of delivery
success/failure. See `RESEND_INTEGRATION.md` for activation and configuration.

## Verification

`admin-users-db.test.mjs` executes real 022/023 SQL in isolated PostgreSQL/PGlite.
`accountSetup.test.ts` covers token encryption, expiry/busy denial, invitation vs
recovery identity handling, claim release, rollback and ambiguous commit safety.
Browser fixtures exercise actual page and control components with synthetic data
at 375, 768, 1440 and 1920px in both themes, including text contrast and modal
submission/cancellation. They perform no production writes. Screenshots stay in
Temp. Live invitation acceptance remains to be tested after migration activation.

Local validation on 2026-11-06: all 250 responsive/interaction browser checks passed,
including the public setup form and password confirmation at phone/tablet/desktop
sizes. Seven isolated database checks, seven setup/crypto/request checks, scoped
ESLint, TypeScript and dashboard regression checks passed. Four pre-existing optional
external session fixtures were skipped by the regression runner.
