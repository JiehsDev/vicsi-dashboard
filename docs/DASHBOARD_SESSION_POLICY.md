# Dashboard session expiry

Browser sign-ins now expire after 30 minutes without activity. An eight-hour
maximum requires a fresh login even during continuous use. The server enforces
both deadlines using an HttpOnly signed session cookie; reading a page, polling
session status, prefetching, or refreshing a Supabase token does not renew it.

The dashboard reports actual pointer, keyboard, touch and scrolling activity at
most once per minute. Hidden tabs cannot renew a login. An idle tab checks the
shared server cookie before redirecting, so another active tab can keep the same
login alive. Expired or legacy logins require credentials again and show a clear
message on the login page.

Supabase auth cookies and the dashboard cookie have no persistent Max-Age or
Expires attribute. Browsers normally remove these when their session ends.
Some browsers restore session cookies with restored tabs; the server's
30-minute idle deadline still applies. Closing one tab does not sign out other
tabs. A guaranteed logout at the instant a browser process closes is not
reliably observable by a website.

Signing uses the server-only DASHBOARD_SESSION_SECRET when configured, or a
domain-separated HMAC with the existing SUPABASE_SERVICE_ROLE_KEY. No secret is
sent to the browser. Rotating the signing key requires fresh dashboard logins.
Browser-authenticated API reads use the same timeout. Headset pairing and bearer
upload APIs retain their own authentication and lifetimes.

Relevant source: `src/lib/dashboardSession.ts`, `src/lib/supabaseServer.ts`,
`src/proxy.ts`, `src/app/login/actions.ts`, `src/app/api/auth/session/route.ts`,
and `src/components/DashboardSessionGuard.tsx`.

Validation: `npm run test:dashboard` includes expiry boundaries, maximum
lifetime, tampered cookies, removal of stale cookie chunks, public login,
cross-origin activity rejection, token-refresh redirect cookie propagation,
and headset API isolation. Tests use isolated local fixtures, not live accounts.

Validation results: production Next.js build and scoped ESLint pass; the 10
new auth checks and 78 existing dashboard checks pass (six existing Unity
integration checks remain skipped). Seven HTTP checks against the production
build confirm login availability, stale-login redirects and chunk deletion,
unauthenticated session status, foreign/malformed origin refusal, and accepted
local/forwarded-host activity requests reaching authentication. No live account
was signed in, seeded, reset, or modified. Actual browser close/restore and a
30-minute real-time interaction test have not been performed.

Supabase documents the distinction between token/session lifetimes and cookie
storage in its [session guide](https://supabase.com/docs/guides/auth/sessions)
and [SSR guide](https://supabase.com/docs/guides/auth/server-side/advanced-guide).
No deployment or production account change is part of this local fix.
