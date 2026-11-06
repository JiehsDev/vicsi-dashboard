import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { DASHBOARD_SESSION_COOKIE, dashboardCookieOptions, dashboardSessionExpiresAt,
  encodeDashboardSession, isSupabaseAuthCookie, readDashboardSession } from "@/lib/dashboardSession";

async function sessionStatus(renew: boolean) {
  const store = await cookies();
  const lease = readDashboardSession(store.get(DASHBOARD_SESSION_COOKIE)?.value);
  const client = await createSupabaseServerClient();
  const user = lease ? (await client.auth.getUser()).data.user : null;
  const account=user?await client.rpc('is_account_suspended'):null;
  if (!lease || user?.id !== lease.userId || account?.data===true || (account?.error&&account.error.code!=='PGRST202') || Date.now() >= dashboardSessionExpiresAt(lease)) {
    const response = NextResponse.json({ authenticated: false }, { status: 401 });
    for (const { name } of store.getAll()) {
      if (name === DASHBOARD_SESSION_COOKIE || isSupabaseAuthCookie(name)) {
        response.cookies.set(name, "", { path: "/", maxAge: 0 });
      }
    }
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  const session = renew ? { ...lease, activeAt: Date.now() } : lease;
  const response = NextResponse.json({ authenticated: true, expiresAt: dashboardSessionExpiresAt(session) });
  if (renew) response.cookies.set(DASHBOARD_SESSION_COOKIE, encodeDashboardSession(session), dashboardCookieOptions());
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function GET() {
  return sessionStatus(false);
}

export async function POST(request: Request) {
  // Only the dashboard itself may report user activity.
  // Next's internal request URL can use a different hostname behind a proxy.
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
  let sameOrigin = false;
  try {
    const parsed = new URL(origin ?? "");
    sameOrigin = ["http:", "https:"].includes(parsed.protocol) && parsed.host === host;
  } catch { /* Missing or malformed origins cannot renew a login. */ }
  if (!sameOrigin) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }
  return sessionStatus(true);
}
