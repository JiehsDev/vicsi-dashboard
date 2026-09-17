// src/app/(dashboard)/assignments/actions.ts
"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { friendlyAssignmentRpcError } from "@/lib/assignments";

/** Same identity discipline as src/app/(dashboard)/classes/actions.ts: every
 *  RPC call goes through the session-cookie-scoped client, never the admin
 *  client, so the RPC's own auth.uid()-derived ownership check is exercised
 *  for real - no id read from formData here is ever trusted as proof of
 *  ownership on its own. */

async function requireSignedIn() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return supabase;
}

function parseDateInput(value: FormDataEntryValue | null): string | null {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function createAssignmentAction(formData: FormData) {
  const supabase = await requireSignedIn();
  const classId = String(formData.get("classId") ?? "");
  const scenarioId = String(formData.get("scenarioId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const opensAt = parseDateInput(formData.get("opensAt"));
  const closesAt = parseDateInput(formData.get("closesAt"));

  if (!classId || !scenarioId) redirect("/assignments/new?error=" + encodeURIComponent("Choose a class and a scenario."));

  const { data, error } = await supabase.rpc("create_class_assignment", {
    p_class_id: classId,
    p_scenario_id: scenarioId,
    p_title: title || null,
    p_opens_at: opensAt,
    p_closes_at: closesAt,
  });

  if (error) {
    redirect(`/assignments/new?error=${encodeURIComponent(friendlyAssignmentRpcError(error.message))}&classId=${encodeURIComponent(classId)}&scenarioId=${encodeURIComponent(scenarioId)}&title=${encodeURIComponent(title)}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  redirect(`/assignments/${encodeURIComponent(row.id)}?created=1`);
}

export async function updateAssignmentAction(formData: FormData) {
  const supabase = await requireSignedIn();
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const opensAt = parseDateInput(formData.get("opensAt"));
  const closesAt = parseDateInput(formData.get("closesAt"));

  if (!assignmentId) redirect("/assignments");

  const { error } = await supabase.rpc("update_class_assignment", {
    p_assignment_id: assignmentId,
    p_title: title || null,
    p_opens_at: opensAt,
    p_closes_at: closesAt,
  });

  if (error) {
    redirect(`/assignments/${encodeURIComponent(assignmentId)}/edit?error=${encodeURIComponent(friendlyAssignmentRpcError(error.message))}`);
  }

  redirect(`/assignments/${encodeURIComponent(assignmentId)}?updated=1`);
}

export async function setAssignmentActiveAction(formData: FormData) {
  const supabase = await requireSignedIn();
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const active = String(formData.get("active") ?? "true") === "true";

  if (!assignmentId) redirect("/assignments");

  const { error } = await supabase.rpc("set_assignment_active", {
    p_assignment_id: assignmentId,
    p_active: active,
  });

  if (error) {
    redirect(`/assignments/${encodeURIComponent(assignmentId)}?error=${encodeURIComponent(friendlyAssignmentRpcError(error.message))}`);
  }

  redirect(`/assignments/${encodeURIComponent(assignmentId)}?${active ? "activated" : "deactivated"}=1`);
}
