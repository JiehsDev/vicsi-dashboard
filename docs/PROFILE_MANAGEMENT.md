# Profile management

`/profile` is shared by students, instructors and administrators. The sidebar's
My Profile entry and the header account name open it. Profile and Security are
separate sections, with the existing blue palette and light/dark tokens.

## Activation

Apply `supabase/migrations/025_self_service_profiles.sql` in the Supabase SQL
editor after migrations 012, 022 and 023. It is transactional and repeatable.
It adds functions only; it does not alter account identities, credentials,
enrollments, scores, historical sessions or VR access codes when applied.

The configured PostgreSQL pooler timed out during the initial implementation,
including transaction-pooler and direct-TLS attempts. The HTTPS database API could
not execute the migration. At the subsequent production release check on
2026-11-06, migration 025 was confirmed present: a signed-in demo student could
read its own profile, and both protected PIN/audit operations rejected browser
access with permission-denied responses. No account credential was changed by
these activation checks. New installations still need to apply the migration.

On an operator machine with working PostgreSQL access:

```
node Tools/testing/class-invites-migration.mjs --profiles --apply
```

This uses the existing database connection and the external `pg` tooling module
(or `PG_MODULE_PATH`). No database driver is added to application dependencies.

## Supported flows

- Name: edit and save in place. The database derives the target from `auth.uid()`.
  No operation accepts a target account, role, Student ID, section or enrollment
  from a form. Name changes and their audit entries share one transaction.
- Password: verify the current web password, validate a matching new passphrase
  of 12–128 characters, change through Supabase Auth, revoke global refresh
  sessions, clear browser cookies and offer sign-in again. Partial revocation or
  audit failures explicitly say that the password changed; they never invite a
  misleading retry. Provider password restrictions still apply.
- Legacy PIN: students only, current web password required. The server-only RPC
  writes bcrypt (cost 10) and an audit entry atomically. It rejects malformed,
  repeated and simple-sequence PINs. The current game uses the separate eight
  character VR access code. Neither that code nor queued assessment uploads are
  changed by this operation. No old PIN or hash is returned to the browser.
- Other sessions: current password required; use Supabase's `others` signout
  scope. This browser stays signed in. Other existing access tokens may remain
  usable until expiry. This is not an immediate access-token revocation system.
- Recovery: explain the existing private administrator-issued one-use recovery
  link. Student identity addresses are not mailboxes; no reset email is sent to
  them. Administrator recovery remains an operator-controlled process.

## Security boundaries and deployment checks

- Every server action validates the authenticated user and signed dashboard lease,
  checks current account status, and consumes a shared persistent five-attempts
  per ten-minute budget. Security operations fail closed if that check fails.
- Password verification uses a separate non-persistent Auth client; it never
  swaps the browser's cookies. Its temporary session is signed out. Existing
  enrolled MFA requires an `aal2` session; these actions do not bypass it.
- Browser roles cannot call the PIN or audit RPCs. Name edits have a second rate
  limit inside the database, so directly calling that RPC does not bypass it.
- Next Server Actions retain their same-origin protections; all untrusted form
  data is validated server-side. Raw provider/SQL errors, credentials and recovery
  links are not logged or shown.
- In hosted Supabase, verify **Require current password when updating** is
  enabled under the email provider's security settings, so a direct Auth API call
  cannot bypass this application's current-password check. This is separate from
  **Secure password change**, which can require an email nonce for older sessions.
  The latter must be considered alongside students' internal, non-deliverable
  addresses. Hosted provider settings were not changed or verified here.
- Keep Auth rate limits enabled. Do not claim immediate JWT revocation; access
  tokens expire according to the Auth project's configured lifetime.

Email-change workflows, MFA enrollment, detailed device listings and a personal
security-activity view remain the next stage. The current stage records successful
name/PIN/password/signout operations in the existing administrator activity log.

## Verification

- `src/lib/__tests__/profileManagement.test.ts`: authentication, target-account
  injection, role boundaries, fail-closed limits, credential validation, verified
  PIN updates, signout scopes and partial password-success handling.
- `Tools/testing/profile-db.test.mjs`: isolated PostgreSQL/PGlite with real
  pgcrypto, executes migrations 012/022/023/025. Checks database privileges,
  anonymous denial, own-account updates, direct-call rate limits, bcrypt hashing,
  suspension, credential-free audit records and preservation of session scores
  and VR access codes. No production accounts are changed by these tests.
- `Tools/testing/profile-responsive.test.mjs`: real Edge browser, synthetic data,
  all three account roles, 375/768/1440 pixel viewports, both themes, text contrast,
  overflow, password visibility, modal focus/cancellation, pending state and save
  feedback. Screenshots stay in the local Temp directory.

References:

- https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
- https://supabase.com/docs/reference/javascript/auth-updateuser
- https://supabase.com/docs/reference/javascript/auth-signout

Local validation on 2026-11-06: production webpack build, TypeScript, scoped
ESLint, 11 profile-operation checks, 8 database subchecks and 20 responsive browser
checks passed. The dashboard regression suite also passed (its existing optional
live checks remain skipped). Browser checks use synthetic actions; a real account
password, PIN or session was not changed to validate this implementation. Live
activation was subsequently confirmed at release time as described above. Hosted
Auth current-password enforcement remains an operator configuration check.
