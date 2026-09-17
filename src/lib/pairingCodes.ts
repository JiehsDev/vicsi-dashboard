// src/lib/pairingCodes.ts
import "server-only";
import { createSupabaseAdminClient } from "./supabaseAdmin";
import type { createSupabaseServerClient } from "./supabaseServer";

export interface StudentAssignment {
  assignmentId: string;
  classId: string;
  classDisplayName: string;
  scenarioId: string;
  scenarioDisplayName: string;
  title: string | null;
  closesAt: string | null;
}

type SessionClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** Assignments the signed-in student is currently allowed to pair against —
 *  relies entirely on students_read_active_enrolled_assignments (migration
 *  007) to scope "enrolled + active + within window"; this function adds no
 *  authorization of its own, only shaping/joining for display. */
export async function getEnrolledActiveAssignments(supabase: SessionClient): Promise<StudentAssignment[]> {
  const { data, error } = await supabase
    .from("assessment_assignments")
    .select("id, title, closes_at, class_id, scenario_id, classes(name, section), scenarios(display_name)")
    .order("closes_at", { ascending: true, nullsFirst: false });

  if (error) {
    console.warn("[pairingCodes] assessment_assignments query failed:", error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const klass = Array.isArray(row.classes) ? row.classes[0] : row.classes;
    const scenario = Array.isArray(row.scenarios) ? row.scenarios[0] : row.scenarios;
    return {
      assignmentId: row.id,
      classId: row.class_id,
      classDisplayName: klass ? (klass.section ? `${klass.name} - ${klass.section}` : klass.name) : row.class_id,
      scenarioId: row.scenario_id,
      scenarioDisplayName: scenario?.display_name ?? row.scenario_id,
      title: row.title,
      closesAt: row.closes_at,
    };
  });
}

export type PairingCodeState = "none" | "active" | "expired" | "consumed";

export interface PairingCodeStatus {
  id: string;
  state: PairingCodeState;
  expiresAt: string;
  consumedAt: string | null;
}

/** Reads the most recent non-revoked pairing code for (student, assignment)
 *  by going straight to assessment_pairing_codes with the SERVICE-ROLE
 *  client (that table has zero client-facing RLS policies — see
 *  008_assessment_pairing_and_tokens.sql). Safe because every query here is
 *  filtered by `studentId`, which callers must derive from the authenticated
 *  session (see pairing/actions.ts and pairing/page.tsx) — never accept it
 *  as a parameter sourced from client input. Never selects code_hash. */
export async function getLatestPairingCodeStatus(
  studentId: string,
  assignmentId: string,
): Promise<PairingCodeStatus | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("assessment_pairing_codes")
    .select("id, expires_at, consumed_at")
    .eq("student_id", studentId)
    .eq("assignment_id", assignmentId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[pairingCodes] status query failed:", error.message);
    return null;
  }
  if (!data) return null;

  let state: PairingCodeState;
  if (data.consumed_at) state = "consumed";
  else if (new Date(data.expires_at).getTime() < Date.now()) state = "expired";
  else state = "active";

  return { id: data.id, state, expiresAt: data.expires_at, consumedAt: data.consumed_at };
}

/** Revokes (never deletes) the student's own unconsumed code. Ownership is
 *  enforced by the `.eq("student_id", studentId)` filter using a
 *  server-derived studentId — this is the same "scope every service-role
 *  query to the caller's own id" discipline getLatestPairingCodeStatus uses,
 *  since the table itself has no RLS policy to fall back on. */
export async function cancelPairingCode(studentId: string, codeId: string): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("assessment_pairing_codes")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", codeId)
    .eq("student_id", studentId)
    .is("consumed_at", null);

  if (error) {
    console.warn("[pairingCodes] cancel failed:", error.message);
    return false;
  }
  return true;
}
