// src/app/pairing/actions.ts
"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { generatePairingCode, hmacPairingCodeHash, DEFAULT_PAIRING_CODE_LENGTH } from "@/lib/assessmentCrypto";
import { cancelPairingCode as cancelPairingCodeRow } from "@/lib/pairingCodes";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rateLimit";
import { parseRpcError } from "@/lib/assessmentErrors";

const PAIRING_CODE_TTL_SECONDS = 5 * 60;

/** Server Action behind the dashboard's "Generate pairing code" button.
 *  studentId is always the authenticated caller's own id — never read from
 *  formData — matching the same identity rule the Route Handler at
 *  /api/v1/pairing-codes enforces for Unity/external callers. This action
 *  exists so the dashboard doesn't have to round-trip through its own HTTP
 *  API for a call it can make directly. */
export async function generatePairingCodeAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const classId = String(formData.get("classId") ?? "");
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const scenarioId = String(formData.get("scenarioId") ?? "");

  if (!classId || !assignmentId || !scenarioId) {
    redirect("/pairing?error=" + encodeURIComponent("Missing assignment details."));
    return;
  }

  const rateLimit = await checkRateLimit(
    `pairing-create:${user.id}`,
    RATE_LIMITS.pairingCreatePerStudent.limit,
    RATE_LIMITS.pairingCreatePerStudent.windowSeconds,
  );
  if (!rateLimit.allowed) {
    redirect("/pairing?error=" + encodeURIComponent("Too many codes requested. Wait a minute and try again."));
    return;
  }

  const plainCode = generatePairingCode(DEFAULT_PAIRING_CODE_LENGTH);
  const codeHash = hmacPairingCodeHash(plainCode);

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("create_pairing_code", {
    p_student_id: user.id,
    p_class_id: classId,
    p_assignment_id: assignmentId,
    p_scenario_id: scenarioId,
    p_code_hash: codeHash,
    p_ttl_seconds: PAIRING_CODE_TTL_SECONDS,
  });

  if (error) {
    const parsed = parseRpcError(error.message);
    console.error("[pairing/actions] create_pairing_code failed:", error.message);
    redirect(
      "/pairing?error=" +
        encodeURIComponent(
          parsed.code === "ASSIGNMENT_INACTIVE"
            ? "This assignment is no longer active."
            : "Unable to generate a pairing code right now.",
        ),
    );
    return;
  }

  const row = Array.isArray(data) ? data[0] : data;
  const expiresAt = row?.expires_at ?? "";

  // The plaintext code travels only in this one redirect's URL, rendered
  // once on /pairing, and is never written to a database column or a log
  // line — see pairing/page.tsx's own handling of the `code` search param.
  redirect(
    `/pairing?generated=1&code=${encodeURIComponent(plainCode)}&expiresAt=${encodeURIComponent(expiresAt)}&assignmentId=${encodeURIComponent(assignmentId)}`,
  );
}

export async function cancelPairingCodeAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const codeId = String(formData.get("codeId") ?? "");
  if (codeId) {
    await cancelPairingCodeRow(user.id, codeId);
  }

  redirect("/pairing");
}
