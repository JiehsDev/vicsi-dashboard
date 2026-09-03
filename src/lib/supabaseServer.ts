// src/lib/supabaseServer.ts
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { timeoutFetch } from "./timeoutFetch";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

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
    global: { fetch: timeoutFetch },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options as CookieOptions);
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
