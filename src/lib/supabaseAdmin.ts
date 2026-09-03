// src/lib/supabaseAdmin.ts
import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Service-role Supabase client. Bypasses RLS entirely and can create/
 *  delete auth users — NEVER import this outside "use server" code, and
 *  never pass its result (or the key) to a Client Component. The
 *  `server-only` import makes accidentally bundling this into client code
 *  a build error rather than a leaked secret. */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — " +
        "add the service_role key to .env.local (see supabase/seed/seed-accounts.mjs).",
    );
  }

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
