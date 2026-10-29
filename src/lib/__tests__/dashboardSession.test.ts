import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy } from "../../proxy";
import { DASHBOARD_IDLE_MS, DASHBOARD_MAX_MS, DASHBOARD_SESSION_COOKIE,
  dashboardCookieOptions, dashboardSessionExpiresAt, encodeDashboardSession,
  isSupabaseAuthCookie, readDashboardSession } from "../dashboardSession";

process.env.DASHBOARD_SESSION_SECRET = "isolated-dashboard-session-test-key";
process.env.SUPABASE_URL = "https://dashboard-session-test.supabase.co";
process.env.SUPABASE_ANON_KEY = "isolated-test-anon-key";
const start = 1_800_000_000_000;
const lease = { userId: "test-user", startedAt: start, activeAt: start };

test("signed dashboard lease expires at exactly 30 minutes, without a sliding read", () => {
  const encoded = encodeDashboardSession(lease);
  assert.deepEqual(readDashboardSession(encoded, start), lease);
  assert.deepEqual(readDashboardSession(encoded, start + DASHBOARD_IDLE_MS - 1), lease);
  assert.equal(readDashboardSession(encoded, start + DASHBOARD_IDLE_MS), null);
  assert.equal(readDashboardSession(encoded, start + DASHBOARD_IDLE_MS + 1), null);
});

test("activity extends idle deadline but cannot extend the eight-hour login maximum", () => {
  const active = { ...lease, activeAt: start + DASHBOARD_MAX_MS - 1 };
  assert.equal(dashboardSessionExpiresAt(active), start + DASHBOARD_MAX_MS);
  assert.deepEqual(readDashboardSession(encodeDashboardSession(active), active.activeAt), active);
  assert.equal(readDashboardSession(encodeDashboardSession(active), start + DASHBOARD_MAX_MS), null);
});

test("missing, changed, malformed and future-dated leases cannot restore login", () => {
  const encoded = encodeDashboardSession(lease);
  for (const value of [undefined, "", "not-a-cookie", `${encoded}.extra`, `${encoded.slice(0, -1)}!`,
    encodeDashboardSession({ ...lease, activeAt: start + 1 }),
    encodeDashboardSession({ ...lease, startedAt: start + 1 }),
    encodeDashboardSession({ ...lease, activeAt: NaN }),
    encodeDashboardSession({ ...lease, userId: "" })]) {
    assert.equal(readDashboardSession(value, start), null);
  }
  const [payload, signature] = encoded.split(".");
  const changed = JSON.parse(Buffer.from(payload, "base64url").toString());
  changed.activeAt += DASHBOARD_IDLE_MS;
  assert.equal(readDashboardSession(`${Buffer.from(JSON.stringify(changed)).toString("base64url")}.${signature}`, start), null);
});

test("cookies become HttpOnly browser-session cookies; logout still deletes chunks", () => {
  const options = dashboardCookieOptions({ maxAge: 400 * 24 * 3600, expires: new Date(start), path: "/" });
  assert.equal(options.maxAge, undefined);
  assert.equal(options.expires, undefined);
  assert.equal(options.httpOnly, true);
  assert.equal(options.sameSite, "lax");
  assert.equal(dashboardCookieOptions({ maxAge: 0 }).maxAge, 0);
  assert.equal(isSupabaseAuthCookie("sb-project-auth-token"), true);
  assert.equal(isSupabaseAuthCookie("sb-project-auth-token.12"), true);
  assert.equal(isSupabaseAuthCookie("sb-project-auth-token-code-verifier"), false);
  assert.equal(isSupabaseAuthCookie("theme"), false);
});

function request(path: string, cookie = "") {
  return new NextRequest(`https://dashboard.example${path}`, { headers: { cookie } });
}

test("stale persistent login is rejected before Supabase refresh, removing all auth chunks", async () => {
  const response = await proxy(request("/results?student=private", "sb-project-auth-token.0=stale; sb-project-auth-token.1=stale; theme=dark"));
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "https://dashboard.example/login?expired=1");
  assert.equal(response.cookies.get("sb-project-auth-token.0")?.maxAge, 0);
  assert.equal(response.cookies.get("sb-project-auth-token.1")?.maxAge, 0);
  assert.equal(response.cookies.has("theme"), false);
  assert.match(response.headers.get("Cache-Control")!, /no-store/);
});

test("expired lease cannot be refreshed by visiting a protected page", async () => {
  const now = Date.now();
  const expired = encodeDashboardSession({ ...lease, startedAt: now - DASHBOARD_IDLE_MS, activeAt: now - DASHBOARD_IDLE_MS });
  const response = await proxy(request("/class-results", `${DASHBOARD_SESSION_COOKIE}=${expired}; sb-project-auth-token=stale`));
  assert.equal(response.status, 307);
  assert.equal(response.cookies.get(DASHBOARD_SESSION_COOKIE)?.maxAge, 0);
});

test("login and signup remain accessible after old persistent cookies are removed", async () => {
  for (const path of ["/login", "/signup"]) {
    const response = await proxy(request(path, "sb-project-auth-token=stale"));
    assert.equal(response.status, 200);
    assert.equal(response.headers.has("location"), false);
    assert.equal(response.cookies.get("sb-project-auth-token")?.maxAge, 0);
    assert.doesNotMatch(response.headers.get("x-middleware-request-cookie") ?? "", /stale/);
  }
});

test("headset API routes bypass browser redirects and browser-session expiry", async () => {
  for (const path of ["/api/v1/health", "/api/v1/device-pairings/exchange", "/api/v1/assessment-sessions", "/api/v1/vr/session-upload-token"]) {
    const response = await proxy(request(path, "sb-project-auth-token=stale"));
    assert.equal(response.status, 200);
    assert.equal(response.headers.has("location"), false);
    assert.equal(response.cookies.getAll().length, 0);
  }
});

test("cross-origin activity requests cannot renew a dashboard login", async () => {
  const { POST } = await import("../../app/api/auth/session/route");
  for (const origin of [null, "https://another.example"]) {
    const response = await POST(new Request("https://dashboard.example/api/auth/session", {
      method: "POST", headers: origin ? { origin } : {},
    }));
    assert.equal(response.status, 403);
    assert.equal(response.cookies.getAll().length, 0);
  }
});

test("valid auth and token refresh retain browser-session cookies on login redirects", async () => {
  const originalFetch = globalThis.fetch;
  const now = Date.now();
  const encoded = encodeDashboardSession({ ...lease, startedAt: now, activeAt: now });
  const user = { id: lease.userId, aud: "authenticated", role: "authenticated", email: "demo@example.invalid",
    created_at: new Date(now).toISOString(), app_metadata: {}, user_metadata: {} };
  const token = (expiry: number) => `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: user.id, exp: expiry })).toString("base64url")}.test-signature`;
  let refreshes = 0;
  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/token?grant_type=refresh_token")) {
      refreshes++;
      return Response.json({ access_token: token(Math.floor(now / 1000) + 3600), refresh_token: "refreshed-test-token",
        token_type: "bearer", expires_in: 3600, user });
    }
    assert.match(url, /\/auth\/v1\/user$/);
    return Response.json(user);
  };
  try {
    for (const expired of [false, true]) {
      const session = { access_token: token(Math.floor(now / 1000) + (expired ? -100 : 3600)),
        refresh_token: "isolated-test-token", expires_at: Math.floor(now / 1000) + (expired ? -100 : 3600), user };
      const auth = `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
      const response = await proxy(request("/login", `${DASHBOARD_SESSION_COOKIE}=${encoded}; sb-dashboard-session-test-auth-token=${auth}`));
      assert.equal(response.headers.get("location"), "https://dashboard.example/");
      const cookies = response.cookies.getAll().filter(cookie => isSupabaseAuthCookie(cookie.name));
      assert.ok(cookies.length > 0);
      for (const cookie of cookies.filter(cookie => cookie.value)) {
        assert.equal(cookie.maxAge, undefined);
        assert.equal(cookie.expires, undefined);
        assert.equal(cookie.httpOnly, true);
      }
      // Navigation and token refresh do not count as user activity.
      assert.equal(response.cookies.has(DASHBOARD_SESSION_COOKIE), false);
    }
    assert.equal(refreshes, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
