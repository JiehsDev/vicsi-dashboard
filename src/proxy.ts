// src/proxy.ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { timeoutFetch } from "@/lib/timeoutFetch";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: timeoutFetch },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (error) {
    // Supabase auth endpoint unreachable (DNS/network failure, project
    // paused, etc). Fail closed — treat as signed out rather than
    // crashing every route with an unhandled 500.
    console.error("[proxy] Supabase auth check failed:", error);
  }

  const isLoginPage = request.nextUrl.pathname.startsWith("/login");
  const isSignupPage = request.nextUrl.pathname === "/signup";
  // /api/v1/** routes are NEVER gated here - Unity's device-pairings/exchange
  // and assessment-sessions endpoints authenticate via a pairing code or a
  // bearer assessment token (never a Supabase session cookie, since Unity
  // has no browser/cookie jar), and /api/v1/health is intentionally
  // unauthenticated. Each Route Handler enforces its own auth internally
  // (see e.g. pairing-codes/route.ts's own supabase.auth.getUser() call for
  // the one endpoint that DOES need a signed-in dashboard user) - redirecting
  // any of these to /login here would break every non-browser caller.
  const isApiRoute = request.nextUrl.pathname.startsWith("/api/");

  if (!user && !isLoginPage && !isSignupPage && !isApiRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Already logged in and trying to view login/signup → send to overview
  if (user && (isLoginPage || isSignupPage)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
