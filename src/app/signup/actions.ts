// src/app/signup/actions.ts
"use server";

import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { studentIdToEmail } from "@/lib/studentAuth";

function fail(message: string): never {
  redirect(`/signup?error=${encodeURIComponent(message)}`);
}

export async function signUp(formData: FormData) {
  const fullName = (formData.get("name") as string | null)?.trim() ?? "";
  const studentId = (formData.get("studentId") as string | null)?.trim() ?? "";
  const section = (formData.get("section") as string | null)?.trim().toUpperCase() ?? "";
  const password = (formData.get("password") as string | null) ?? "";
  const confirmPassword =
    (formData.get("confirmPassword") as string | null) ?? "";
  const pin = (formData.get("pin") as string | null) ?? "";

  // Server-side validation — the form does the same checks client-side for
  // instant feedback, but that's UX only. A request can always skip the
  // browser entirely, so nothing here can be trusted from the client.
  if (!fullName || !studentId || !section || !password || !pin) {
    fail("Please fill in all required fields.");
  }
  if (!/^[A-Z]$/.test(section)) {
    fail("Section must be a single letter, e.g. A.");
  }
  if (password !== confirmPassword) {
    fail("Passwords don't match.");
  }
  if (password.length < 8) {
    fail("Password must be at least 8 characters.");
  }
  if (!/^\d{4}$/.test(pin)) {
    fail("PIN must be exactly 4 digits.");
  }

  const supabase = createSupabaseAdminClient();
  const email = studentIdToEmail(studentId);

  const { data: userData, error: createError } =
    await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // internal-only address; nobody can click a link
    });

  if (createError) {
    if (/already.*registered|already.*exists/i.test(createError.message)) {
      fail("This Student ID is already registered.");
    }
    console.error("[signup] createUser failed:", createError.message);
    fail("Something went wrong creating your account. Please try again.");
  }

  const userId = userData.user.id;

  const { error: profileError } = await supabase.rpc("upsert_profile", {
    p_id: userId,
    p_role: "student",
    p_full_name: fullName,
    p_student_id: studentId,
    p_section: section,
    p_pin: pin,
  });

  if (profileError) {
    // Don't leave an orphaned auth user with no profile behind — a retry
    // would otherwise fail at the createUser step with a confusing
    // "already registered" for an account that never actually worked.
    await supabase.auth.admin.deleteUser(userId);

    if (/duplicate key|already exists|unique constraint/i.test(profileError.message)) {
      fail("This Student ID is already registered.");
    }
    console.error("[signup] upsert_profile failed:", profileError.message);
    fail("Something went wrong creating your account. Please try again.");
  }

  redirect("/login?created=1");
}
