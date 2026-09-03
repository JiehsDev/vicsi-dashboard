// supabase/seed/seed-accounts.mjs
//
// Creates one instructor and one student account for local development.
//
//   node --env-file=.env.local supabase/seed/seed-accounts.mjs
//   (or: npm run seed:accounts)
//
// PREREQUISITES
//   1. Run supabase/migrations/001_profiles.sql in the Supabase SQL editor.
//   2. Add SUPABASE_SERVICE_ROLE_KEY to .env.local (Supabase dashboard →
//      Project Settings → API → service_role). .env* is gitignored.
//
// The service role key bypasses RLS and can mint users. Keep it server-side
// only — never import it into app code, never prefix it with NEXT_PUBLIC_.
//
// This script is idempotent: re-running updates the existing accounts
// instead of failing or creating duplicates.

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    [
      "",
      "  Missing credentials.",
      "",
      `    NEXT_PUBLIC_SUPABASE_URL     ${url ? "found" : "MISSING"}`,
      `    SUPABASE_SERVICE_ROLE_KEY    ${serviceKey ? "found" : "MISSING"}`,
      "",
      "  Add the service_role key to .env.local:",
      "    Supabase dashboard → Project Settings → API → service_role",
      "",
      "  The anon key cannot create users — this needs the service role.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Overridable so you don't have to edit this file to seed a different set.
const ACCOUNTS = [
  {
    kind: "instructor",
    email: process.env.SEED_INSTRUCTOR_EMAIL ?? "instructor@psu.edu.ph",
    password: process.env.SEED_INSTRUCTOR_PASSWORD ?? "traceboard-dev-1",
    profile: {
      role: "instructor",
      full_name: process.env.SEED_INSTRUCTOR_NAME ?? "J. Alvarez",
      student_id: null,
      section: null,
      pin: null,
    },
  },
  {
    kind: "student",
    email: process.env.SEED_STUDENT_EMAIL ?? "student@psu.edu.ph",
    password: process.env.SEED_STUDENT_PASSWORD ?? "traceboard-dev-1",
    profile: {
      role: "student",
      full_name: process.env.SEED_STUDENT_NAME ?? "Priya Nakamura",
      student_id: process.env.SEED_STUDENT_ID ?? "2021-04521",
      section: process.env.SEED_STUDENT_SECTION ?? "A",
      // Hashed server-side by upsert_profile(); never stored in plaintext.
      pin: process.env.SEED_STUDENT_PIN ?? "4821",
    },
  },
];

/** Find an existing auth user by email, paging through the admin list. */
async function findUserByEmail(email) {
  const target = email.toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < 200) return null; // last page
  }
  return null;
}

async function seedAccount({ kind, email, password, profile }) {
  const existing = await findUserByEmail(email);
  let userId;

  if (existing) {
    userId = existing.id;
    // Reset the password so a re-run always leaves known-good credentials.
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    });
    if (error) throw error;
    console.log(`  ~ ${kind.padEnd(10)} updated   ${email}`);
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      // Dev seed: skip the confirmation email so the account is usable now.
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user.id;
    console.log(`  + ${kind.padEnd(10)} created   ${email}`);
  }

  const { error: rpcError } = await supabase.rpc("upsert_profile", {
    p_id: userId,
    p_role: profile.role,
    p_full_name: profile.full_name,
    p_student_id: profile.student_id,
    p_section: profile.section,
    p_pin: profile.pin,
  });

  if (rpcError) {
    if (/could not find the function|does not exist/i.test(rpcError.message)) {
      throw new Error(
        "upsert_profile() not found — run supabase/migrations/001_profiles.sql first.",
      );
    }
    throw rpcError;
  }

  return { kind, email, password, profile };
}

const results = [];
try {
  console.log("\nSeeding TRACEBOARD accounts\n");
  for (const account of ACCOUNTS) {
    results.push(await seedAccount(account));
  }
} catch (err) {
  console.error(`\n  Failed: ${err.message}\n`);
  process.exit(1);
}

console.log("\n  Sign in at /login with:\n");
for (const r of results) {
  console.log(`    ${r.kind}`);
  console.log(`      email     ${r.email}`);
  console.log(`      password  ${r.password}`);
  if (r.profile.student_id) {
    console.log(`      studentId ${r.profile.student_id}`);
    console.log(`      game PIN  ${r.profile.pin}`);
  }
  console.log("");
}
console.log(
  "  These are development credentials — change them before any real use.\n",
);
