// Browser session enforcement; headset APIs authenticate in their own handlers.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { timeoutFetch } from "@/lib/timeoutFetch";
import { DASHBOARD_SESSION_COOKIE, dashboardCookieOptions, isSupabaseAuthCookie, readDashboardSession } from "@/lib/dashboardSession";
import {classJoinReturnPath} from "@/lib/classInvites";

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  // Login and signup must be able to load the same public branding as the dashboard.
  if (pathname.startsWith("/brand/")) return NextResponse.next();
  if (pathname === "/account/setup") {
    const response=NextResponse.next();
    response.headers.set('Cache-Control','no-store');
    response.headers.set('Referrer-Policy','no-referrer');
    return response;
  }
  // Never redirect or impose dashboard timeouts on device/bearer APIs.
  // Browser API handlers still enforce the lease in supabaseServer.ts.
  if (pathname.startsWith("/api/")) return NextResponse.next();

  const authCookies = request.cookies.getAll().filter(({ name }) => isSupabaseAuthCookie(name));
  const lease = readDashboardSession(request.cookies.get(DASHBOARD_SESSION_COOKIE)?.value);
  const isLoginPage = pathname === "/login";
  const isSignupPage = pathname === "/signup";
  let response = NextResponse.next({ request: { headers: request.headers } });
  let user = null;
  if (lease) {
    const supabase = createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
      global: { fetch: timeoutFetch },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          const previous = response.cookies.getAll();
          response = NextResponse.next({ request: { headers: request.headers } });
          previous.forEach(cookie => response.cookies.set(cookie));
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, dashboardCookieOptions(options)));
        },
      },
    });
    try {
      const { data } = await supabase.auth.getUser();
      if (data.user?.id === lease.userId) {
        const suspended=await supabase.rpc('is_account_suspended');
        // Older deployments without migration 023 keep their existing access;
        // other backend failures must not silently grant access.
        if(suspended.data===false || suspended.error?.code==='PGRST202')user=data.user;
      }
    } catch (error) {
      console.error("[proxy] Supabase auth check failed:", error);
    }
  }

  if (!user) {
    // Remove stale auth from the forwarded request as well as the browser.
    // Do this before constructing NextResponse so Server Actions see logout.
    for (const { name } of request.cookies.getAll()) {
      if (name === DASHBOARD_SESSION_COOKIE || isSupabaseAuthCookie(name)) request.cookies.delete(name);
    }
    if (!isLoginPage && !isSignupPage) {
      const url = new URL("/login", request.url);
      const next=classJoinReturnPath(pathname+request.nextUrl.search);
      if(next)url.searchParams.set("next",next);
      if (authCookies.length || lease) url.searchParams.set("expired", "1");
      response = NextResponse.redirect(url);
    } else {
      response = NextResponse.next({ request: { headers: request.headers } });
    }
    for (const { name } of [...authCookies, { name: DASHBOARD_SESSION_COOKIE }]) {
      response.cookies.set(name, "", { path: "/", maxAge: 0 });
    }
  } else {
    // Upgrade any older persistent cookies to browser-session cookies now,
    // even if Supabase did not need to refresh its token on this request.
    for (const cookie of authCookies) {
      if (!response.cookies.has(cookie.name)) response.cookies.set(cookie.name, cookie.value, dashboardCookieOptions());
    }
    if (isLoginPage || isSignupPage) {
      const redirect = NextResponse.redirect(new URL(classJoinReturnPath(request.nextUrl.searchParams.get("next"))??"/", request.url));
      response.cookies.getAll().forEach(cookie => redirect.cookies.set(cookie));
      response = redirect;
    }
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/).*)"],
};
