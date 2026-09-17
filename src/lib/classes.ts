// src/lib/classes.ts
import "server-only";
import { createSupabaseServerClient } from "./supabaseServer";
import { getAssignmentsForClass, type AssignmentSummary } from "./assignments";

/** RPCs in 015_instructor_class_management.sql and 016_class_assignment_
 *  management.sql (create_instructor_class_with_period/update_instructor_
 *  class_with_period/validate_academic_period) raise exceptions as
 *  `RAISE EXCEPTION 'CODE: detail'` - same convention parseRpcError (src/lib/
 *  assessmentErrors.ts) already established for 011's RPCs. This is a
 *  separate, smaller mapping rather than reusing that one because these
 *  codes back a plain redirect-with-?error= flow (see every action in
 *  src/app/(dashboard)/classes/actions.ts), not the v1 JSON API envelope -
 *  no ApiErrorCode/HTTP status involved here, just a safe, human-readable
 *  string for the form to show. VALIDATION_ERROR's own message text from
 *  validate_academic_period (e.g. the specific "must be 2026-2027" or "must
 *  be 1st/2nd/Summer" detail) is itself already safe/specific, so that one
 *  code is passed through verbatim rather than flattened to a generic
 *  string - every other code maps to a fixed, generic message. Falls back
 *  to a fully generic message for anything that doesn't match the
 *  convention at all (a real constraint violation, a connection failure) -
 *  that raw text must never reach the browser. */
const FRIENDLY_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: "You don't have permission to do that.",
  NOT_FOUND: "That class couldn't be found in your account.",
  CLASS_ARCHIVED: "This class is archived. Restore it before enrolling students.",
  STUDENT_NOT_FOUND: "No student was found with that student number.",
  DUPLICATE_ENROLLMENT: "That student is already enrolled in this class.",
  ENROLLMENT_NOT_FOUND: "That student isn't enrolled in this class.",
};

/** Whether the underlying RPC message body (after the "CODE: " prefix) is
 *  already safe, specific, instructor-facing text - true only for
 *  validate_academic_period's own three messages, which name the exact
 *  problem ("must look like 2026-2027", etc.) and contain no internal
 *  identifiers, SQL, or anything else unsafe to show. */
function isSafeValidationDetail(rawMessage: string): boolean {
  return /^VALIDATION_ERROR: (academic year|semester)/.test(rawMessage);
}

export function friendlyClassRpcError(rawMessage: string): string {
  if (isSafeValidationDetail(rawMessage)) {
    return rawMessage.slice(rawMessage.indexOf(":") + 1).trim();
  }
  const separatorIndex = rawMessage.indexOf(":");
  if (separatorIndex > 0) {
    const code = rawMessage.slice(0, separatorIndex).trim();
    if (code === "VALIDATION_ERROR") {
      return "Please check the form and try again.";
    }
    if (code in FRIENDLY_MESSAGES) {
      return FRIENDLY_MESSAGES[code];
    }
  }
  return "Something went wrong. Please try again.";
}

/** All reads below use the SESSION-COOKIE-SCOPED client (RLS sees the
 *  caller as `authenticated`) - the actual "an instructor only sees their
 *  own classes" enforcement is instructors_read_own_classes/
 *  instructors_read_own_class_enrollments (006/013), not application code
 *  here. Every write goes through one of the five RPCs in
 *  015_instructor_class_management.sql via the same session-scoped client -
 *  never the admin client - so each RPC's own auth.uid()-based ownership
 *  check is exercised for real, the same way a call from any other
 *  authenticated browser session would be. */

export interface InstructorClass {
  id: string;
  name: string;
  section: string | null;
  /** "2026-2027" or null - see 016_class_assignment_management.sql's own
   *  header for why this lives on classes, not assessment_assignments, and
   *  why existing rows are null rather than an invented value. */
  academicYear: string | null;
  /** "1st" | "2nd" | "Summer" or null - DB CHECK-enforced (016), not just
   *  validated in this file. */
  semester: string | null;
  archivedAt: string | null;
  createdAt: string;
}

export async function getInstructorClasses(): Promise<InstructorClass[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("classes")
    .select("id, name, section, academic_year, semester, archived_at, created_at")
    .order("name", { ascending: true });

  if (error) {
    console.warn("[classes] getInstructorClasses failed:", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    section: row.section,
    academicYear: row.academic_year,
    semester: row.semester,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
  }));
}

export interface EnrolledStudent {
  studentId: string;
  fullName: string;
  studentNumber: string | null;
  enrolledAt: string;
}

export interface ClassDetail extends InstructorClass {
  students: EnrolledStudent[];
  /** Full assignment rows (Part 5 - class detail shows scenario,
   *  availability, active state, completion count, avg score per
   *  assignment), not just a count. */
  assignments: AssignmentSummary[];
  sessionCount: number;
  averageVerifiedScore: number | null;
}

/** Returns null if RLS filtered the class out (doesn't exist, or belongs to
 *  a different instructor) - same "not found, never distinguish why" rule
 *  every other detail read in this project follows. */
export async function getClassDetail(classId: string): Promise<ClassDetail | null> {
  const supabase = await createSupabaseServerClient();

  const { data: klass, error: classError } = await supabase
    .from("classes")
    .select("id, name, section, academic_year, semester, archived_at, created_at")
    .eq("id", classId)
    .maybeSingle();

  if (classError || !klass) return null;

  const [{ data: enrollmentRows }, { data: sessionRows }, assignments] = await Promise.all([
    supabase
      .from("class_enrollments")
      .select("student_id, enrolled_at, profiles(full_name, student_id)")
      .eq("class_id", classId)
      .order("enrolled_at", { ascending: false }),
    supabase.from("assessment_sessions").select("verification_status, verified_score").eq("class_id", classId),
    getAssignmentsForClass(classId),
  ]);

  const students: EnrolledStudent[] = (enrollmentRows ?? []).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    const p = profile as { full_name?: string; student_id?: string } | null;
    return {
      studentId: row.student_id,
      fullName: p?.full_name ?? "Unknown student",
      studentNumber: p?.student_id ?? null,
      enrolledAt: row.enrolled_at,
    };
  });

  const sessions = sessionRows ?? [];
  const verified = sessions.filter((s) => s.verification_status === "verified" && s.verified_score !== null);

  return {
    id: klass.id,
    name: klass.name,
    section: klass.section,
    academicYear: klass.academic_year,
    semester: klass.semester,
    archivedAt: klass.archived_at,
    createdAt: klass.created_at,
    students,
    assignments,
    sessionCount: sessions.length,
    averageVerifiedScore: verified.length > 0 ? verified.reduce((sum, s) => sum + (s.verified_score as number), 0) / verified.length : null,
  };
}
