// src/lib/assignments.ts
import "server-only";
import { createSupabaseServerClient } from "./supabaseServer";

/** All reads below use the SESSION-COOKIE-SCOPED client - RLS
 *  (instructors_read_own_assignments, 007) is what actually restricts these
 *  to the signed-in instructor's own classes. Writes go through the three
 *  RPCs in 016_class_assignment_management.sql via the same session-scoped
 *  client, never the admin client. */

export type AssignmentStatus = "active" | "upcoming" | "closed" | "inactive";

export function computeAssignmentStatus(isActive: boolean, opensAt: string | null, closesAt: string | null): AssignmentStatus {
  if (!isActive) return "inactive";
  const now = Date.now();
  if (opensAt && new Date(opensAt).getTime() > now) return "upcoming";
  if (closesAt && new Date(closesAt).getTime() < now) return "closed";
  return "active";
}

/** Mirrors create_pairing_code's own eligibility checks (assignment active,
 *  class not archived, within window) for display only - see the RPC itself
 *  for the real, authoritative check. Factored out of the detail page's own
 *  render body so the "impure Date.now()" lint rule (meant for client
 *  component render purity) doesn't flag a plain server-side computation -
 *  this function is never called during a React render pass, only from an
 *  async Server Component body before it returns JSX. */
export function computePairingEligibility(assignment: Pick<AssignmentSummary, "isActive" | "classArchived" | "opensAt" | "closesAt" | "status">): {
  eligible: boolean;
  withinWindow: boolean;
} {
  const now = Date.now();
  const withinWindow = (!assignment.opensAt || new Date(assignment.opensAt).getTime() <= now) && (!assignment.closesAt || new Date(assignment.closesAt).getTime() >= now);
  return { eligible: assignment.isActive && !assignment.classArchived && withinWindow, withinWindow };
}

export interface AssignmentSummary {
  id: string;
  classId: string;
  classDisplayName: string;
  classArchived: boolean;
  /** For consistent period display everywhere an assignment is shown - see
   *  src/components/AcademicPeriodFields.tsx's own formatAcademicPeriod. */
  classAcademicYear: string | null;
  classSemester: string | null;
  scenarioId: string;
  scenarioDisplayName: string;
  title: string | null;
  isActive: boolean;
  opensAt: string | null;
  closesAt: string | null;
  createdAt: string;
  sessionCount: number;
  averageVerifiedScore: number | null;
  status: AssignmentStatus;
}

function classDisplayName(row: { name: string; section?: string | null } | null): string {
  if (!row) return "Unknown class";
  return row.section ? `${row.name} - ${row.section}` : row.name;
}

async function attachSessionStats(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  rows: { id: string }[],
): Promise<Map<string, { count: number; avgScore: number | null }>> {
  const stats = new Map<string, { count: number; avgScore: number | null }>();
  if (rows.length === 0) return stats;

  const { data, error } = await supabase
    .from("assessment_sessions")
    .select("assignment_id, verification_status, verified_score")
    .in(
      "assignment_id",
      rows.map((r) => r.id),
    );

  if (error) {
    console.warn("[assignments] session-stats query failed:", error.message);
    return stats;
  }

  const byAssignment = new Map<string, { verified: number[]; count: number }>();
  for (const row of data ?? []) {
    const key = row.assignment_id as string;
    const entry = byAssignment.get(key) ?? { verified: [], count: 0 };
    entry.count += 1;
    if (row.verification_status === "verified" && row.verified_score !== null) {
      entry.verified.push(row.verified_score as number);
    }
    byAssignment.set(key, entry);
  }

  for (const [key, entry] of byAssignment) {
    stats.set(key, {
      count: entry.count,
      avgScore: entry.verified.length > 0 ? entry.verified.reduce((s, v) => s + v, 0) / entry.verified.length : null,
    });
  }
  return stats;
}

export async function getAssignmentsForClass(classId: string): Promise<AssignmentSummary[]> {
  const all = await getInstructorAssignments();
  return all.filter((a) => a.classId === classId);
}

export async function getInstructorAssignments(): Promise<AssignmentSummary[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("assessment_assignments")
    .select("id, class_id, scenario_id, title, is_active, opens_at, closes_at, created_at, classes(name, section, archived_at, academic_year, semester), scenarios(display_name)")
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("[assignments] getInstructorAssignments failed:", error.message);
    return [];
  }

  const rows = data ?? [];
  const stats = await attachSessionStats(supabase, rows);

  return rows.map((row) => {
    const klass = Array.isArray(row.classes) ? row.classes[0] : row.classes;
    const scenario = Array.isArray(row.scenarios) ? row.scenarios[0] : row.scenarios;
    const stat = stats.get(row.id) ?? { count: 0, avgScore: null };
    return {
      id: row.id,
      classId: row.class_id,
      classDisplayName: classDisplayName(klass as { name: string; section?: string | null } | null),
      classArchived: Boolean((klass as { archived_at?: string | null } | null)?.archived_at),
      classAcademicYear: (klass as { academic_year?: string | null } | null)?.academic_year ?? null,
      classSemester: (klass as { semester?: string | null } | null)?.semester ?? null,
      scenarioId: row.scenario_id,
      scenarioDisplayName: (scenario as { display_name?: string } | null)?.display_name ?? row.scenario_id,
      title: row.title,
      isActive: row.is_active,
      opensAt: row.opens_at,
      closesAt: row.closes_at,
      createdAt: row.created_at,
      sessionCount: stat.count,
      averageVerifiedScore: stat.avgScore,
      status: computeAssignmentStatus(row.is_active, row.opens_at, row.closes_at),
    };
  });
}

/** Returns null if RLS filtered the row out - not found, or not this
 *  instructor's own class's assignment - same "not found, never distinguish
 *  why" rule every other detail read in this project follows. */
export async function getAssignmentDetail(assignmentId: string): Promise<AssignmentSummary | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("assessment_assignments")
    .select("id, class_id, scenario_id, title, is_active, opens_at, closes_at, created_at, classes(name, section, archived_at, academic_year, semester), scenarios(display_name)")
    .eq("id", assignmentId)
    .maybeSingle();

  if (error || !data) return null;

  const stats = await attachSessionStats(supabase, [data]);
  const klass = Array.isArray(data.classes) ? data.classes[0] : data.classes;
  const scenario = Array.isArray(data.scenarios) ? data.scenarios[0] : data.scenarios;
  const stat = stats.get(data.id) ?? { count: 0, avgScore: null };

  return {
    id: data.id,
    classId: data.class_id,
    classDisplayName: classDisplayName(klass as { name: string; section?: string | null } | null),
    classArchived: Boolean((klass as { archived_at?: string | null } | null)?.archived_at),
    classAcademicYear: (klass as { academic_year?: string | null } | null)?.academic_year ?? null,
    classSemester: (klass as { semester?: string | null } | null)?.semester ?? null,
    scenarioId: data.scenario_id,
    scenarioDisplayName: (scenario as { display_name?: string } | null)?.display_name ?? data.scenario_id,
    title: data.title,
    isActive: data.is_active,
    opensAt: data.opens_at,
    closesAt: data.closes_at,
    createdAt: data.created_at,
    sessionCount: stat.count,
    averageVerifiedScore: stat.avgScore,
    status: computeAssignmentStatus(data.is_active, data.opens_at, data.closes_at),
  };
}

/** Classes the instructor can create a NEW assignment for - active
 *  (non-archived) only, since create_class_assignment itself refuses an
 *  archived class anyway; filtering here just keeps the dropdown from
 *  offering a choice the RPC would immediately reject. */
export async function getActiveInstructorClasses(): Promise<{ id: string; displayName: string; academicYear: string | null; semester: string | null }[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("classes").select("id, name, section, academic_year, semester").is("archived_at", null).order("name");

  if (error) {
    console.warn("[assignments] getActiveInstructorClasses failed:", error.message);
    return [];
  }
  return (data ?? []).map((c) => ({ id: c.id, displayName: classDisplayName(c), academicYear: c.academic_year, semester: c.semester }));
}

export async function getAvailableScenarios(): Promise<{ scenarioId: string; displayName: string }[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("scenarios").select("scenario_id, display_name").order("display_name");

  if (error) {
    console.warn("[assignments] getAvailableScenarios failed:", error.message);
    return [];
  }
  return (data ?? []).map((s) => ({ scenarioId: s.scenario_id, displayName: s.display_name }));
}

const FRIENDLY_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: "You don't have permission to do that.",
  VALIDATION_ERROR: "Please check the form and try again.",
  NOT_FOUND: "That assignment couldn't be found in your account.",
  CLASS_ARCHIVED: "This class is archived. Restore it first.",
  SCENARIO_NOT_FOUND: "That scenario doesn't exist.",
  DUPLICATE_ASSIGNMENT: "This class already has an active assignment for that scenario.",
};

export function friendlyAssignmentRpcError(rawMessage: string): string {
  const separatorIndex = rawMessage.indexOf(":");
  if (separatorIndex > 0) {
    const code = rawMessage.slice(0, separatorIndex).trim();
    if (code in FRIENDLY_MESSAGES) {
      return FRIENDLY_MESSAGES[code];
    }
  }
  return "Something went wrong. Please try again.";
}
