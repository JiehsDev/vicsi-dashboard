// src/app/(dashboard)/classes/actions.ts
"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { friendlyClassRpcError } from "@/lib/classes";

/** Every action below calls its RPC through the SESSION-cookie-scoped
 *  client (never the admin client) - the RPC itself derives the caller's
 *  identity from auth.uid() and checks is_instructor()/is_instructor_of_class()
 *  (see 015_instructor_class_management.sql's own security-model comment).
 *  No identity value here is ever read from formData and trusted - only the
 *  class/student ids a form field names, which the RPC re-validates
 *  ownership of independently regardless of what's submitted. */

async function requireSignedIn() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return supabase;
}

/** Calls create_instructor_class_with_period (016), not the plain
 *  create_instructor_class (015) - see 016's own header for why these are
 *  separate, non-overloaded functions. academic_year/semester are required
 *  by that RPC for every new class (requirement 7); the form itself also
 *  marks them required so a missing value never reaches the network round
 *  trip in the first place, but the RPC's own validate_academic_period call
 *  is what actually enforces it regardless of what the browser sent. */
export async function createClassAction(formData: FormData) {
  const supabase = await requireSignedIn();
  const name = String(formData.get("name") ?? "").trim();
  const section = String(formData.get("section") ?? "").trim();
  const academicYear = String(formData.get("academicYear") ?? "").trim();
  const semester = String(formData.get("semester") ?? "").trim();

  const { data, error } = await supabase.rpc("create_instructor_class_with_period", {
    p_name: name,
    p_academic_year: academicYear,
    p_semester: semester,
    p_section: section || null,
  });

  if (error) {
    redirect(
      `/classes/new?error=${encodeURIComponent(friendlyClassRpcError(error.message))}` +
        `&name=${encodeURIComponent(name)}&section=${encodeURIComponent(section)}` +
        `&academicYear=${encodeURIComponent(academicYear)}&semester=${encodeURIComponent(semester)}`,
    );
  }

  const row = Array.isArray(data) ? data[0] : data;
  redirect(`/classes/${encodeURIComponent(row.id)}?created=1`);
}

/** Calls update_instructor_class_with_period (016) - see createClassAction's
 *  own comment above; same required-fields posture, which is also how a
 *  legacy NULL-period class gets its period filled in (submit this form
 *  once with real values - requirement 8). */
export async function updateClassAction(formData: FormData) {
  const supabase = await requireSignedIn();
  const classId = String(formData.get("classId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const section = String(formData.get("section") ?? "").trim();
  const academicYear = String(formData.get("academicYear") ?? "").trim();
  const semester = String(formData.get("semester") ?? "").trim();

  if (!classId) redirect("/classes");

  const { error } = await supabase.rpc("update_instructor_class_with_period", {
    p_class_id: classId,
    p_name: name,
    p_academic_year: academicYear,
    p_semester: semester,
    p_section: section || null,
  });

  if (error) {
    redirect(`/classes/${encodeURIComponent(classId)}/edit?error=${encodeURIComponent(friendlyClassRpcError(error.message))}`);
  }

  redirect(`/classes/${encodeURIComponent(classId)}?updated=1`);
}

export async function archiveClassAction(formData: FormData) {
  const supabase = await requireSignedIn();
  const classId = String(formData.get("classId") ?? "");
  const archive = String(formData.get("archive") ?? "true") === "true";

  if (!classId) redirect("/classes");

  const { error } = await supabase.rpc("archive_instructor_class", {
    p_class_id: classId,
    p_archive: archive,
  });

  if (error) {
    redirect(`/classes/${encodeURIComponent(classId)}?error=${encodeURIComponent(friendlyClassRpcError(error.message))}`);
  }

  redirect(`/classes/${encodeURIComponent(classId)}?${archive ? "archived" : "restored"}=1`);
}

export async function enrollStudentAction(formData: FormData) {
  const supabase = await requireSignedIn();
  const classId = String(formData.get("classId") ?? "");
  const studentNumber = String(formData.get("studentNumber") ?? "").trim();

  if (!classId) redirect("/classes");

  const { error } = await supabase.rpc("enroll_student_in_class", {
    p_class_id: classId,
    p_student_number: studentNumber,
  });

  if (error) {
    redirect(`/classes/${encodeURIComponent(classId)}?error=${encodeURIComponent(friendlyClassRpcError(error.message))}`);
  }

  redirect(`/classes/${encodeURIComponent(classId)}?enrolled=1`);
}

export async function removeStudentAction(formData: FormData) {
  const supabase = await requireSignedIn();
  const classId = String(formData.get("classId") ?? "");
  const studentId = String(formData.get("studentId") ?? "");

  if (!classId) redirect("/classes");

  const { error } = await supabase.rpc("remove_student_from_class", {
    p_class_id: classId,
    p_student_id: studentId,
  });

  if (error) {
    redirect(`/classes/${encodeURIComponent(classId)}?error=${encodeURIComponent(friendlyClassRpcError(error.message))}`);
  }

  redirect(`/classes/${encodeURIComponent(classId)}?removed=1`);
}
