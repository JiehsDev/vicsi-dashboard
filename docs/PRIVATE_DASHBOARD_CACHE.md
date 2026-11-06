# Private page caching with automatic updates

## Behavior

Recently visited page payloads stay in Next's browser-memory Router Cache for
120 seconds. Returning to a recent view can reuse its content immediately.
Server/database reads and HTTP responses remain `private, no-store`; there is
no shared server response cache, service worker, IndexedDB or localStorage copy
of student/session records.

`DashboardLiveUpdates` checks `/api/dashboard/revision` every five seconds while
the browser tab is visible, and immediately on focus, tab return, pageshow or
reconnection. This is change polling, not a WebSocket subscription. Database
and rendering latency are additional to that interval; hidden or overlapping
checks are skipped. Polling does not renew the 30-minute inactivity lease.

Unchanged fingerprints do not refresh the page. A changed fingerprint causes a
React transition and `router.refresh()`: current content stays visible, with a
small **Updating records…** notice. Filters and normal scroll state are retained.
Each recently visited URL tracks the version it last displayed, so a cached page
also revalidates when revisited after another view has received an update.

Automatic refresh waits while an input/select/editor has focus, a dialog is open,
or a form is busy. Its version stays dirty until the refresh actually settles.
Permission/session invalidation overrides this deferral. Failed update checks
keep the loaded view visible and explicitly say fresh data could not be checked;
Retry and reconnect check again. This does not make new pages available offline.

## Scope and security

The revision endpoint verifies the signed dashboard lease, authenticated user,
and current database profile on every request. Academic requests use the user's
RLS-scoped client. A service client is constructed only after the database has
confirmed current administrator membership; it selects explicit, non-secret
metadata columns. Responses contain only two HMAC digests, never rows, answer
keys, credentials, PIN hashes, invitation secrets or access tokens.

The authorization scope includes the signed-in identity, session start, role and
academic class permissions. A changed scope causes full document navigation to
drop the previous Router Cache. Suspension, expired sign-in and lost read
permissions clear access instead of serving additional cached data. Server
actions retain their existing cookie and path invalidation behavior. Signout is
also broadcast to other tabs with the same observed session scope. Expired
sessions remain subject to the existing eight-hour maximum and idle deadline.

The session guard starts with the signed lease's server-confirmed deadline, so
cached data still has a deadline even if its first browser check is offline.
Transient backend outages return 503 instead of falsely reporting a completed
signout. The session guard still enforces its last confirmed expiry deadline;
polling and background refresh do not extend it. Public account-setup links are
excluded from both background session checks and data polling.

Watched metadata includes authorized session score/status/verification changes,
class details/invites, enrollment and profile changes. The normal upload/scoring pipeline
updates session parents after writing child records. Administrator watches also
cover users, administrator access, setup-link state, email delivery and audit
changes. Metadata reads paginate in stable primary-key order; records themselves
continue to load through existing data functions and authorization checks.

## Maintenance and checks

Next 16.2.12 exposes page stale times through the experimental `staleTimes`
configuration. Its installed documentation was checked before implementation.
Keep the production navigation integration test when upgrading Next, because
client-cache behavior is version-sensitive.

- `dashboardRefresh.test.ts`: revision stability, URL-specific revalidation,
  scope changes, credentials/metadata boundaries and administrator guards.
- `npm run test:cache`: browser tests for unchanged/changed revisions, retained
  content during refresh, editing deferral, failed checks/Retry and hidden tabs.
- Explicit read-only live integration (uses an existing demo student's local
  credentials file, never resets account details):

  ```
  VICSI_LIVE_CACHE_TESTS=1 node --import ./Tools/testing/register-tsx.mjs --test Tools/testing/cache-next-navigation.test.mjs
  ```

  Run after a production build. On PowerShell set the environment variable with
  `$env:VICSI_LIVE_CACHE_TESTS='1'` before running the Node command.

The live check starts its own temporary production server and browser, verifies
that returning to a recent page makes no new navigation RSC request, and checks
that signout prevents access to the cached workspace. Auth cookies and temporary
browser files remain local; the test does not modify grades or enrollments.

Validation on 2026-11-06 passed: production build, TypeScript, scoped lint,
dashboard regressions, seven cache/security unit checks, four browser behavior
checks and the opt-in production navigation/signout integration. In the real
production browser, returning from My Classes to My Sessions issued zero new
navigation RSC requests. After signout, the revision endpoint returned 401 and
browser Back did not restore the authenticated workspace. A separate live demo
student read confirmed stable unchanged fingerprints without service-role reads.
