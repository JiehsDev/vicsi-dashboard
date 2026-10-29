// src/lib/vrAccessCodeAdmin.ts
import "server-only";
import { createSupabaseServerClient } from "./supabaseServer";
import { formatVrAccessCode } from "./vrAccessCodes";

/** Instructor actions on a student's VR access code. Both RPCs (018) run with
 *  the caller's OWN session (RLS sees them as `authenticated`) and check
 *  inside the function that the caller is an instructor of a class the
 *  student is enrolled in - same trust boundary as the class-management RPCs
 *  in 015, never the service-role client. Errors come back as the RPC's
 *  `CODE: detail` text; map them for display the way friendlyClassRpcError
 *  does. No UI calls these yet (Phase 1 is backend only). */

export interface RegeneratedVrAccessCode {
  studentId: string;
  /** Display form, e.g. "K7M4-PQ2D". The only time the code leaves the server. */
  accessCode: string;
  codeVersion: number;
  enabled: boolean;
  updatedAtUtc: string;
}

export type VrAccessCodeActionResult<T> = { ok: true; data: T } | { ok: false; rpcError: string };

/** Issues a new code; the old one stops validating at once. The student id is unchanged. */
export async function regenerateStudentVrAccessCode(studentId: string): Promise<VrAccessCodeActionResult<RegeneratedVrAccessCode>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("regenerate_student_vr_access_code", { p_student_id: studentId });
  if (error) {
    return { ok: false, rpcError: error.message };
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return { ok: false, rpcError: "SERVER_ERROR: regenerate_student_vr_access_code returned no row" };
  }
  return {
    ok: true,
    data: {
      studentId: row.student_id,
      accessCode: formatVrAccessCode(row.access_code),
      codeVersion: row.code_version,
      enabled: row.enabled,
      updatedAtUtc: new Date(row.updated_at).toISOString(),
    },
  };
}

export interface VrAccessCodeState {
  studentId: string;
  codeVersion: number;
  enabled: boolean;
  updatedAtUtc: string;
}

/** Disables (enabled=false) or re-enables a code. Never deletes the student or any history. */
export async function setStudentVrAccessCodeEnabled(
  studentId: string,
  enabled: boolean,
): Promise<VrAccessCodeActionResult<VrAccessCodeState>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("set_student_vr_access_code_enabled", {
    p_student_id: studentId,
    p_enabled: enabled,
  });
  if (error) {
    return { ok: false, rpcError: error.message };
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return { ok: false, rpcError: "SERVER_ERROR: set_student_vr_access_code_enabled returned no row" };
  }
  return {
    ok: true,
    data: {
      studentId: row.student_id,
      codeVersion: row.code_version,
      enabled: row.enabled,
      updatedAtUtc: new Date(row.updated_at).toISOString(),
    },
  };
}
