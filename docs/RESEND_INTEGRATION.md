# Stage 3: instructor invitation email

Instructor invitations support automatic email on creation/replacement (a checked,
optional control), manual Send email/Send again, uncertain-request retries, and
Refresh status. Copy link remains available for every active invitation regardless
of email outcome. Password recovery remains manually shared; students' internal
Auth addresses are not routed into email delivery.

## Activate

1. Apply `supabase/migrations/024_invitation_email_delivery.sql` in Supabase SQL
   Editor after 023. The operator applied 024 and its installation was verified
   through the HTTPS database API on 2026-11-06. The direct PostgreSQL connection
   still times out, so activation used the SQL Editor.
   The scoped CLI alternative is
   `node Tools/testing/class-invites-migration.mjs --invitation-email --apply`.
2. Configure server environment variables, locally in `.env.local` and separately
   in the deployment settings. Do not put keys in source control, browser code or chat:

   ```dotenv
   RESEND_API_KEY=your-provider-key
   RESEND_FROM_EMAIL=onboarding@resend.dev
   DASHBOARD_APP_URL=https://your-dashboard.vercel.app
   RESEND_WEBHOOK_SECRET=your-webhook-signing-secret
   ```

   `RESEND_FROM_EMAIL` is optional and defaults to the address shown. It accepts a
   plain sender email; the application supplies the ViCSI display name. The app URL
   must be a public HTTPS origin without credentials, path, query or fragment.
   It is used for email links and copied links, so an admin working on localhost
   can still share the deployed dashboard URL. Restart/redeploy after configuration.
3. In Resend, register a webhook for `https://YOUR-DASHBOARD/api/webhooks/resend`
   and configure its signing secret. Subscribe to `email.sent`, `email.delivered`,
   `email.delivery_delayed`, `email.failed`, `email.bounced`, `email.complained` and
   `email.suppressed`. Open/click tracking is not required or stored by this app.
4. Use the invitation dialog for a recipient allowed by the current Resend account.
   Check Sent, then refresh after the provider callback. A genuine mailbox check
   is still required before claiming end-to-end delivery verification.

Read-only activation and anonymous permission checks:

```powershell
node --env-file=.env.local --import ./Tools/testing/register-tsx.mjs Tools/testing/verify-email-activation.ts
```

The checker prints configuration presence only, never secret values, and sends no
emails or creates application records. Local Resend configuration is now present.
The production build accepts its signing secret (valid signature: HTTP 204;
invalid signature: HTTP 400). Deployment configuration has not been verified.

The public origin `https://vicsi-dashboard.vercel.app` currently returns HTTP 404
for `/api/webhooks/resend`, so it still needs the dashboard code containing the new
route deployed. Ensure the same server environment settings are present in Vercel
before deploying. The current Resend key is sending-only; provider webhook metadata
inspection is unavailable with that key, which does not require broadening its scope.

Use `node Tools/testing/check-resend-connection.mjs` to repeat the public checks.
With a local production server running on port 3100, add `--local` to check the
local handler. The signed probe uses an unsupported event type that this handler
ignores before database access; it sends no email and persists no event. The public
probe first checks that the configured origin serves a ViCSI login page.

Without keys or a public URL, creating a link still succeeds and the interface
explains that email sending needs configuration. It never reports Sent for an
unattempted request. Configured means variables are present, not that Resend has
verified a sender or the webhook endpoint is registered.

## Sender and status semantics

Resend's default `onboarding@resend.dev` sender is restricted to the Resend account
owner's address. Sending arbitrary instructor invitations requires a verified
domain and a sender address on that domain. Once verified, change the sender
configuration; the invitation workflow and Copy link do not change. See the
[official sender restriction](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).
The UI does not label real emails as testing, and never redirects a recipient's
invitation to a different mailbox.

- Not sent: no email job exists for this version of the setup link.
- Sending: a persisted request is in progress.
- Sent: Resend accepted the request; delivery has not been confirmed.
- Delivered: a signed callback confirms recipient mail-server acceptance, not
  that a person read the message.
- Failed, Bounced, Delayed, Suppressed and Marked as spam reflect distinct provider
  outcomes. Provider error bodies are replaced by safe, actionable explanations.
- Status unconfirmed: a timeout, ambiguous provider result, or unsaved result.
  A safe retry keeps the same request key. No false success is shown.

These meanings follow [Resend's event definitions](https://resend.com/docs/webhooks/event-types).
Link Active/Completed/Expired/Revoked remains separate from transport status. Replacing
the link starts fresh email status; an email for the old link is never attributed
to its replacement.

## Reliability and access

Every send rechecks current administrator access, active invitation state, token
revision, expiry, and server configuration. Persistent database jobs snapshot the
recipient, sender, public origin and encrypted setup token. Only the service role
can read those snapshots. Administrator status RPCs return only presentation fields.
No email payload, plaintext token, provider credential or raw callback is stored in
the audit log or printed to application logs.

Concurrent clicks are serialized under the invitation lock with a one-minute
cooldown. New requests use the shared per-admin rate limiter (10 per 10 minutes).
Uncertain retries reuse the job UUID and immutable v1 payload. Resend retains
[idempotency keys for 24 hours](https://resend.com/docs/dashboard/emails/idempotency-keys);
the application refuses ambiguous retries after 23 hours and asks the admin to
replace the link. It does not blindly resend after the provider's deduplication
window. Sending is performed by the server action, with a 12-second provider timeout;
this is not a background email queue. An interrupted request can be retried by an
administrator from the existing job.

Callbacks use the official Resend SDK to verify the original raw body and Svix
signature/timestamp headers. Bodies are bounded to 64 KiB. Unverified, modified and
old signatures cannot write status. Event IDs deduplicate replayed callbacks; status
precedence prevents late Sent/Delayed events from erasing Delivered or terminal
failure states. The precedence is Sent < Delayed < Delivered < Failed <
Bounced/Suppressed < Complained. Delivery callbacks racing ahead of the send result
are retained by provider ID and reconciled when that result is saved. A database
failure returns 503 so Resend can retry. Only allowlisted IDs/state/time are stored.
See [official verification guidance](https://resend.com/docs/webhooks/verify-webhooks-requests).

Successful requests, API outcomes and later delivery changes enter the existing
append-only activity log. Setup-link creation and email delivery are separate
transactions, so a provider outage cannot roll back a usable invitation.

## Validation

Local tests use synthetic recipients and stub provider responses; no real email has
been sent during implementation. `invitationEmail.test.ts` covers configuration,
payload consistency, true acceptance, 403/429/409/5xx, network failures, stale links
and unavailable persistence. `invitationEmailWebhook.test.ts` exercises real SDK
signature verification, tampering, stale signatures and retry responses.
`admin-users-db.test.mjs` executes migrations 022–024 in isolated PostgreSQL,
including protected access, job reuse, callback-before-response reconciliation,
duplicate/out-of-order events and replacement revision handling. Browser fixtures
exercise sent/failed/unknown modal outcomes and retained Copy link at phone and
desktop widths, alongside the full dashboard's existing responsive checks.

Local validation completed on 2026-11-06: production webpack build, TypeScript,
scoped ESLint and dashboard regression checks passed. All 256 browser checks
passed. The combined SQL suite passed eight checks, and the provider transport/
signature suites passed seven checks. Four existing optional external session
fixtures were skipped by the dashboard regression runner.
