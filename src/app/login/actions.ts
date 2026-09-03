// src/app/login/actions.ts
"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { looksLikeEmail, studentIdToEmail } from "@/lib/studentAuth";

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
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent("Incorrect credentials.")}`);
  }

  redirect("/");
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
