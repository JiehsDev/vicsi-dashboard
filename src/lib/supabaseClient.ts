// src/lib/supabaseClient.ts
import { createSupabaseServerClient } from "./supabaseServer";
import type {
  StudentSessionSummary,
  ScenarioAggregate,
  EvidenceEvent,
  EvidenceEventKind,
  ErrorLogEntry,
  Profile,
  Role,
} from "./types";

/* ---------------- Row mappers: snake_case (Postgres) -> camelCase (TS) ---------------- */

interface StudentSessionSummaryRow {
  id: string;
  name: string;
  role: Role;
  section?: string | null;
  scenario_id: string;
  scenario_name: string;
  accuracy: number | null;
  compliance: number | null;
  completion_pct?: number | null;
  time_on_task_min: number;
  error_count: number;
  session_id: string;
  trend_pts?: number | null;
}

function mapStudentRow(row: StudentSessionSummaryRow): StudentSessionSummary {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    section: row.section ?? undefined,
    scenarioId: row.scenario_id,
    scenarioName: row.scenario_name,
    accuracy: row.accuracy,
    compliance: row.compliance,
    completionPct: row.completion_pct ?? undefined,
    timeOnTaskMin: row.time_on_task_min,
    errorCount: row.error_count,
    sessionId: row.session_id,
    trendPts: row.trend_pts ?? undefined,
  };
}

interface ScenarioAggregateRow {
  scenario_id: string;
  scenario_name: string;
  completion_rate: number;
  avg_time_min: number;
  common_error: string;
  error_frequency: number;
}

function mapScenarioRow(row: ScenarioAggregateRow): ScenarioAggregate {
  return {
    scenarioId: row.scenario_id,
    scenarioName: row.scenario_name,
    completionRate: row.completion_rate,
    avgTimeMin: row.avg_time_min,
    commonError: row.common_error,
    errorFrequency: row.error_frequency,
  };
}

interface ProfileRow {
  id: string;
  role: "instructor" | "student";
  full_name: string;
  student_id: string | null;
  section: string | null;
}

function mapProfileRow(row: ProfileRow): Profile {
  return {
    id: row.id,
    role: row.role,
    fullName: row.full_name,
    studentId: row.student_id,
    section: row.section,
  };
}

interface EvidenceEventRow {
  event_timestamp: string;
  action: string;
  item: string;
  event_kind: EvidenceEventKind;
  correct: boolean | null;
  note?: string | null;
}

function mapEvidenceEventRow(row: EvidenceEventRow): EvidenceEvent {
  return {
    timestamp: row.event_timestamp,
    action: row.action,
    item: row.item,
    eventKind: row.event_kind,
    correct: row.correct,
    note: row.note ?? undefined,
  };
}

interface ErrorLogRow {
  label: string;
  occurrences: number;
}

function mapErrorLogRow(row: ErrorLogRow): ErrorLogEntry {
  return {
    label: row.label,
    occurrences: row.occurrences,
  };
}

/* ---------------- Public data-access functions ----------------
   All now use the SESSION-AWARE server client, so RLS sees these
   requests as `authenticated` (matching the policies we set up
   earlier) instead of `anon`. Proxy guarantees the caller is signed in
   (instructor OR student) — it does NOT check role. Row-level access
   for the `profiles` table is enforced by RLS (see
   supabase/migrations/001_profiles.sql); `student_session_summary` has
   no such per-row restriction yet, so any authenticated caller can read
   every student's rows via this function today. */

/** The signed-in user's own app-level identity (role, Student ID,
 *  section). No mock fallback — fabricating a fake identity for a real
 *  logged-in user would be actively wrong, not just incomplete. Returns
 *  null if unauthenticated or the profile row doesn't exist. */
export async function getMyProfile(): Promise<Profile | null> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.warn("[supabaseClient] profiles query failed:", error.message);
    return null;
  }

  return data ? mapProfileRow(data) : null;
}

/** Any profile by id — relies entirely on "instructors read all profiles"
 *  (001_profiles.sql) for authorization: a student caller gets nothing back
 *  for any id but their own (RLS "read own profile" only), an instructor
 *  gets any profile. This function adds no role check of its own — same
 *  "RLS is the real boundary" discipline as every other read in this file. */
export async function getProfileById(id: string): Promise<Profile | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.warn("[supabaseClient] getProfileById query failed:", error.message);
    return null;
  }
  return data ? mapProfileRow(data) : null;
}

/** @deprecated Legacy pre-assessment-pipeline table, no longer reachable
 *  from any live route (both / and /sessions/[id] now redirect to
 *  /class-results - see those files' own comments on why: no unique data,
 *  no timestamps, a looser un-class-scoped RLS model). Kept only in case a
 *  future one-off migration/reporting script still needs it; never call
 *  this from a page. Fails closed (empty array + a logged warning) on any
 *  query error - no mock-data fallback. */
export async function getStudentSessionSummaries(
  scenarioId?: string,
): Promise<StudentSessionSummary[]> {
  const supabase = await createSupabaseServerClient();

  let query = supabase.from("student_session_summary").select("*");
  if (scenarioId) query = query.eq("scenario_id", scenarioId);

  const { data, error } = await query;

  if (error) {
    console.warn("[supabaseClient] student_session_summary query failed:", error.message);
    return [];
  }

  return (data ?? []).map(mapStudentRow);
}

/** @deprecated Legacy table, not called from any live route - see
 *  getStudentSessionSummaries's own comment. Fails closed, no mock fallback. */
export async function getScenarioAggregate(
  scenarioId: string,
): Promise<ScenarioAggregate | null> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("scenario_aggregate")
    .select("*")
    .eq("scenario_id", scenarioId)
    .maybeSingle();

  if (error) {
    console.warn("[supabaseClient] scenario_aggregate query failed:", error.message);
    return null;
  }

  return data ? mapScenarioRow(data) : null;
}

/** @deprecated Legacy table, not called from any live route - see
 *  getStudentSessionSummaries's own comment. Fails closed, no mock fallback. */
export async function getAllScenarioAggregates(): Promise<
  ScenarioAggregate[]
> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("scenario_aggregate")
    .select("*")
    .order("scenario_name", { ascending: true });

  if (error) {
    console.warn("[supabaseClient] scenario_aggregate (all) query failed:", error.message);
    return [];
  }

  return (data ?? []).map(mapScenarioRow);
}

/** @deprecated Legacy table, no longer reachable from any live route - see
 *  getStudentSessionSummaries's own comment (the ordered event timeline
 *  this used to back is now /class-results/[sessionId]'s own real
 *  session_events section). Fails closed, no mock fallback. */
export async function getEvidenceTimeline(
  sessionId: string,
): Promise<EvidenceEvent[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("evidence_events")
    .select("*")
    .eq("session_id", sessionId)
    .order("sequence", { ascending: true });

  if (error) {
    console.warn("[supabaseClient] evidence_events query failed:", error.message);
    return [];
  }

  return (data ?? []).map(mapEvidenceEventRow);
}

/** @deprecated Legacy table, not called from any live route - see
 *  getStudentSessionSummaries's own comment. Fails closed, no mock fallback. */
export async function getClassErrorLog(): Promise<ErrorLogEntry[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("class_error_log")
    .select("*")
    .order("occurrences", { ascending: false });

  if (error) {
    console.warn("[supabaseClient] class_error_log query failed:", error.message);
    return [];
  }

  return (data ?? []).map(mapErrorLogRow);
}
