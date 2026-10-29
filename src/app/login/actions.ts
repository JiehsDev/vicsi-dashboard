// src/app/login/actions.ts
"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { looksLikeEmail, studentIdToEmail } from "@/lib/studentAuth";
import { cookies } from "next/headers";
import { DASHBOARD_SESSION_COOKIE, dashboardCookieOptions, encodeDashboardSession, isSupabaseAuthCookie } from "@/lib/dashboardSession";

export async function signIn(formData: FormData) {
  // Accepts either an email (instructors) or a Student ID (students) in
  // the same field. A Student ID has no '@', so it's translated to the
  // same internal-only email studentIdToEmail() produced at signup —
  // see src/lib/studentAuth.ts for why that's necessary.
  const identifier = formData.get("identifier") as string;
  const password = formData.get("password") as string;
  const email = looksLikeEmail(identifier)
    ? identifier
    : studentIdToEmail(identifier);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    redirect(`/login?error=${encodeURIComponent("Incorrect credentials.")}`);
  }

  const now = Date.now();
  const cookieStore = await cookies();
  cookieStore.set(DASHBOARD_SESSION_COOKIE, encodeDashboardSession({
    userId: data.user.id, startedAt: now, activeAt: now,
  }), dashboardCookieOptions());
  redirect("/");
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: "local" });
  const cookieStore = await cookies();
  for (const { name } of cookieStore.getAll()) {
    if (name === DASHBOARD_SESSION_COOKIE || isSupabaseAuthCookie(name)) {
      cookieStore.set(name, "", { path: "/", maxAge: 0 });
    }
  }
  redirect("/login");
}
