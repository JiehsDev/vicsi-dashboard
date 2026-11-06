// src/lib/supabaseServer.ts
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { timeoutFetch } from "./timeoutFetch";
import { DASHBOARD_SESSION_COOKIE, dashboardCookieOptions, isSupabaseAuthCookie, readDashboardSession } from "./dashboardSession";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

/**
 * Creates a Supabase client for use inside Server Components and Route
 * Handlers. Reads the signed-in user's session from cookies, so queries
 * made with this client are treated as `authenticated` by RLS policies.
 *
 * Call this fresh in each Server Component / Route Handler — don't cache
 * or reuse a single instance across requests.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    global: { fetch: (input,init)=>timeoutFetch(input,{...init,cache:'no-store'}) },
    cookies: {
      getAll() {
        const all = cookieStore.getAll();
        // Enforce expiry in data access too, including browser-authenticated
        // API routes. Bearer-token headset APIs use their separate clients.
        return readDashboardSession(cookieStore.get(DASHBOARD_SESSION_COOKIE)?.value)
          ? all : all.filter(({ name }) => !isSupabaseAuthCookie(name));
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, dashboardCookieOptions(options as CookieOptions));
          });
        } catch {
          // Called from a Server Component that can't set cookies directly —
          // safe to ignore here, since proxy.ts (next file) refreshes
          // the session cookie on every request anyway.
        }
      },
    },
  });
}
