// src/lib/results.ts
import "server-only";
import { createSupabaseServerClient } from "./supabaseServer";

/** All reads below use the SESSION-COOKIE-SCOPED client (RLS sees the
 *  caller as `authenticated`), never the service-role client - the actual
 *  "students see only their own sessions" / "instructors see only their own
 *  classes' sessions" enforcement is the RLS policies in
 *  010_assessment_sessions_rls.sql, not application code here. This file
 *  only shapes rows for display; a bug here can misrender data, but it
 *  cannot leak a row RLS wouldn't already have returned. */

const SESSION_SELECT = `
  session_id, receipt_id, scenario_id, scenario_version,
  started_at_utc, completed_at_utc, duration_seconds,
  selected_conclusion_id, resolved_ending_id,
  has_client_reported_scores, client_relationships_correct, client_relationships_incorrect,
  client_objectives_completed, client_objectives_failed, client_procedural_violation_count,
  verification_status, verified_score, verification_message, verified_at_utc,
  server_received_at_utc, student_id, class_id,
  scenarios(display_name)
`;

export interface ResultSummary {
  sessionId: string;
  receiptId: string;
  studentId: string;
  classId: string;
  scenarioId: string;
  scenarioDisplayName: string;
  scenarioVersion: string;
  startedAtUtc: string | null;
  completedAtUtc: string | null;
  durationSeconds: number | null;
  selectedConclusionId: string | null;
  resolvedEndingId: string | null;
  verificationStatus: string;
  verifiedScore: number | null;
  serverReceivedAtUtc: string;
}

export interface ResultDetail extends ResultSummary {
  verificationMessage: string | null;
  verifiedAtUtc: string | null;
  clientReported: {
    hasScores: boolean;
    relationshipsCorrect: number | null;
    relationshipsIncorrect: number | null;
    objectivesCompleted: number | null;
    objectivesFailed: number | null;
    proceduralViolationCount: number | null;
  };
  categories: Record<string, number>;
  procedureViolations: { eventType: string; targetId: string | null; timestampMs: number }[];
  missedEvidence: { evidenceId: string; finalStatus: string }[];
  /** Server-stored relationship state for this session — NOT the ground-truth
   *  "is this relationship actually correct" flag (that lives only in
   *  src/lib/scoring/data/**, which is never read from a page). `state`
   *  ("Completed", "Available", etc.) is this session's own board progress,
   *  the same thing Unity's RelationshipStateManager already tracked. */
  relationships: { relationshipId: string; state: string; wasEverSelected: boolean }[];
  /** Ordered event log exactly as Unity submitted it — the session's own
   *  recorded actions, not an answer key. */
  events: { sequenceNumber: number; timestampMs: number; eventType: string; targetId: string | null }[];
  /** Every evidence item's full server-recorded result, not just the
   *  filtered-to-missed subset `missedEvidence` above shows a student/
   *  instructor day-to-day. Used by the per-session export (Part 5), which
   *  needs the complete record, not the display-friendly summary. */
  evidenceResults: {
    evidenceId: string;
    finalStatus: string;
    swabbingDone: boolean;
    fingerprintingDone: boolean;
    isFlipped: boolean;
    fingerprintLabStatus: string | null;
    tentNumber: number | null;
    tentLetter: string | null;
  }[];
  /** Hypothesis-checkpoint answers — the closest thing to "objectives" this
   *  schema tracks per-session (there is no separate session_objectives
   *  table; see 009_assessment_sessions.sql's own table list). */
  hypotheses: { checkpointId: string; selectedOptionId: string | null; reasoningOptionId: string | null }[];
}

function mapSummaryRow(row: Record<string, unknown>): ResultSummary {
  const scenario = Array.isArray(row.scenarios) ? row.scenarios[0] : row.scenarios;
  return {
    sessionId: row.session_id as string,
    receiptId: row.receipt_id as string,
    studentId: row.student_id as string,
    classId: row.class_id as string,
    scenarioId: row.scenario_id as string,
    scenarioDisplayName: (scenario as { display_name?: string } | null)?.display_name ?? (row.scenario_id as string),
    scenarioVersion: row.scenario_version as string,
    startedAtUtc: row.started_at_utc as string | null,
    completedAtUtc: row.completed_at_utc as string | null,
    durationSeconds: row.duration_seconds as number | null,
    selectedConclusionId: row.selected_conclusion_id as string | null,
    resolvedEndingId: row.resolved_ending_id as string | null,
    verificationStatus: row.verification_status as string,
    verifiedScore: row.verified_score as number | null,
    serverReceivedAtUtc: row.server_received_at_utc as string,
  };
}

/** Every session belonging to the signed-in student, newest first. RLS
 *  (students_read_own_sessions) is what actually restricts this to "own" -
 *  no student_id filter is applied here in application code. */
export async function getMyResultSummaries(): Promise<ResultSummary[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("assessment_sessions")
    .select(SESSION_SELECT)
    .order("server_received_at_utc", { ascending: false });

  if (error) {
    console.warn("[results] getMyResultSummaries failed:", error.message);
    return [];
  }
  return (data ?? []).map(mapSummaryRow);
}

/** Every session across every class the signed-in instructor teaches,
 *  newest first, with student display name. RLS
 *  (instructors_read_own_class_sessions) restricts this to "own classes"
 *  only. */
export interface InstructorResultRow extends ResultSummary {
  studentDisplayName: string;
  /** profiles.student_id, the human-readable code (e.g. "2099-00001") -
   *  distinct from ResultSummary.studentId (the auth uuid). Exposed so the
   *  name/ID search filter can match either. Null when the profile row has
   *  none set. */
  studentIdCode: string | null;
  classDisplayName: string;
}

export async function getInstructorResultSummaries(): Promise<InstructorResultRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("assessment_sessions")
    .select(`${SESSION_SELECT}, profiles!assessment_sessions_student_id_fkey(full_name, student_id), classes(name, section)`)
    .order("server_received_at_utc", { ascending: false });

  if (error) {
    console.warn("[results] getInstructorResultSummaries failed:", error.message);
    return [];
  }

  return (data ?? []).map(mapInstructorRow);
}

function mapInstructorRow(row: Record<string, unknown>): InstructorResultRow {
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  const klass = Array.isArray(row.classes) ? row.classes[0] : row.classes;
  const p = profile as { full_name?: string; student_id?: string } | null;
  return {
    ...mapSummaryRow(row),
    studentDisplayName: p?.full_name ?? p?.student_id ?? "Unknown student",
    studentIdCode: p?.student_id ?? null,
    classDisplayName: klass ? `${(klass as { name: string }).name}${(klass as { section?: string }).section ? ` - ${(klass as { section?: string }).section}` : ""}` : "Unknown class",
  };
}

/** studentDisplayName/classDisplayName for exactly one session — used by
 *  the per-session export, which needs that identity alongside
 *  getResultDetail's own (identity-free) detail. Same RLS-scoped read
 *  pattern as getInstructorResultSummaries, just narrowed with .eq rather
 *  than fetched in bulk and filtered in application code, since the export
 *  route only ever needs the one row. Returns null if RLS filtered the row
 *  out - same "not found, never distinguish why" rule as getResultDetail. */
export async function getInstructorSessionIdentity(
  sessionId: string,
): Promise<Pick<InstructorResultRow, "studentDisplayName" | "studentIdCode" | "classDisplayName"> | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("assessment_sessions")
    .select(`${SESSION_SELECT}, profiles!assessment_sessions_student_id_fkey(full_name, student_id), classes(name, section)`)
    .eq("session_id", sessionId)
    .maybeSingle();

  if (error || !data) {
    if (error) console.warn("[results] getInstructorSessionIdentity failed:", error.message);
    return null;
  }

  const mapped = mapInstructorRow(data);
  return { studentDisplayName: mapped.studentDisplayName, studentIdCode: mapped.studentIdCode, classDisplayName: mapped.classDisplayName };
}

/** One session's full detail — caller-agnostic: works for either a student
 *  viewing their own session or an instructor viewing a session in their own
 *  class, since RLS already scoped the row to exist at all. Returns null if
 *  RLS filtered the row out (not found, or not this caller's to see) -
 *  callers must render that as "not found," never distinguish "doesn't
 *  exist" from "exists but not yours" (same safe-generic principle the
 *  pairing endpoints already follow). */
export async function getResultDetail(sessionId: string): Promise<ResultDetail | null> {
  const supabase = await createSupabaseServerClient();

  const { data: session, error: sessionError } = await supabase
    .from("assessment_sessions")
    .select(SESSION_SELECT)
    .eq("session_id", sessionId)
    .maybeSingle();

  if (sessionError || !session) return null;

  const [{ data: categoryRows }, { data: violationRows }, { data: evidenceRows }, { data: relationshipRows }, { data: eventRows }, { data: hypothesisRows }] = await Promise.all([
    supabase.from("session_score_categories").select("category_key, category_value, source").eq("session_id", sessionId).eq("source", "server"),
    supabase.from("session_procedure_violations").select("event_type, target_id, timestamp_ms").eq("session_id", sessionId),
    supabase.from("session_evidence_results").select("evidence_id, final_status, swabbing_done, fingerprinting_done, is_flipped, fingerprint_lab_status, tent_number, tent_letter").eq("session_id", sessionId),
    supabase.from("session_relationships").select("relationship_id, state, was_ever_selected").eq("session_id", sessionId),
    supabase.from("session_events").select("sequence_number, timestamp_ms, event_type, target_id").eq("session_id", sessionId).order("sequence_number", { ascending: true }),
    supabase.from("session_hypotheses").select("checkpoint_id, selected_option_id, reasoning_option_id").eq("session_id", sessionId),
  ]);

  const categories: Record<string, number> = {};
  for (const row of categoryRows ?? []) {
    categories[row.category_key] = row.category_value;
  }

  // "Missed evidence" - collectible items that never reached a Processed-ish
  // final state. Deliberately just the ITEM ID + its own final status, never
  // the ground truth's relevance classification - relevance is exactly the
  // kind of "hidden answer" this feature says not to expose while an
  // assignment is still active.
  const missedEvidence = (evidenceRows ?? [])
    .filter((r) => r.final_status !== "Processed")
    .map((r) => ({ evidenceId: r.evidence_id, finalStatus: r.final_status }));

  return {
    ...mapSummaryRow(session),
    verificationMessage: session.verification_message as string | null,
    verifiedAtUtc: session.verified_at_utc as string | null,
    clientReported: {
      hasScores: Boolean(session.has_client_reported_scores),
      relationshipsCorrect: session.client_relationships_correct as number | null,
      relationshipsIncorrect: session.client_relationships_incorrect as number | null,
      objectivesCompleted: session.client_objectives_completed as number | null,
      objectivesFailed: session.client_objectives_failed as number | null,
      proceduralViolationCount: session.client_procedural_violation_count as number | null,
    },
    categories,
    procedureViolations: (violationRows ?? []).map((v) => ({ eventType: v.event_type, targetId: v.target_id, timestampMs: Number(v.timestamp_ms) })),
    missedEvidence,
    relationships: (relationshipRows ?? []).map((r) => ({
      relationshipId: r.relationship_id,
      state: r.state,
      wasEverSelected: Boolean(r.was_ever_selected),
    })),
    events: (eventRows ?? []).map((e) => ({
      sequenceNumber: e.sequence_number,
      timestampMs: Number(e.timestamp_ms),
      eventType: e.event_type,
      targetId: e.target_id,
    })),
    evidenceResults: (evidenceRows ?? []).map((r) => ({
      evidenceId: r.evidence_id,
      finalStatus: r.final_status,
      swabbingDone: Boolean(r.swabbing_done),
      fingerprintingDone: Boolean(r.fingerprinting_done),
      isFlipped: Boolean(r.is_flipped),
      fingerprintLabStatus: r.fingerprint_lab_status,
      tentNumber: r.tent_number,
      tentLetter: r.tent_letter,
    })),
    hypotheses: (hypothesisRows ?? []).map((h) => ({
      checkpointId: h.checkpoint_id,
      selectedOptionId: h.selected_option_id,
      reasoningOptionId: h.reasoning_option_id,
    })),
  };
}

/** Options for the class-results filter UI. `classes` and `scenarios` both
 *  come back already scoped: `classes` via instructors_read_own_classes RLS,
 *  `scenarios` derived only from the instructor's own assignments (not the
 *  full world-readable scenarios table) so the dropdown never lists a
 *  scenario the instructor has never assigned. */
export async function getInstructorFilterOptions(): Promise<{
  classes: { id: string; displayName: string }[];
  scenarios: { scenarioId: string; displayName: string }[];
}> {
  const supabase = await createSupabaseServerClient();
  const [{ data: classRows, error: classError }, { data: assignmentRows, error: assignmentError }] = await Promise.all([
    supabase.from("classes").select("id, name, section").order("name"),
    supabase.from("assessment_assignments").select("scenario_id, scenarios(display_name)"),
  ]);

  if (classError) console.warn("[results] getInstructorFilterOptions classes failed:", classError.message);
  if (assignmentError) console.warn("[results] getInstructorFilterOptions assignments failed:", assignmentError.message);

  const scenarioMap = new Map<string, string>();
  for (const row of assignmentRows ?? []) {
    const scenario = Array.isArray(row.scenarios) ? row.scenarios[0] : row.scenarios;
    scenarioMap.set(row.scenario_id, (scenario as { display_name?: string } | null)?.display_name ?? row.scenario_id);
  }

  return {
    classes: (classRows ?? []).map((c) => ({ id: c.id, displayName: c.section ? `${c.name} - ${c.section}` : c.name })),
    scenarios: [...scenarioMap.entries()].map(([scenarioId, displayName]) => ({ scenarioId, displayName })),
  };
}

export interface InstructorOverview {
  totalClasses: number;
  totalStudents: number;
  totalAssignments: number;
  totalScenarios: number;
  totalSessions: number;
  verifiedSessions: number;
  averageVerifiedScore: number | null;
  averageDurationSeconds: number | null;
  mostMissedEvidence: { evidenceId: string; count: number }[];
  mostCommonViolations: { eventType: string; count: number }[];
  endingDistribution: { endingId: string; count: number }[];
}

function topEntries(counts: Map<string, number>, limit = 5): { key: string; count: number }[] {
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([key, count]) => ({ key, count }));
}

/** Class/scenario-level analytics across every class the signed-in
 *  instructor teaches. Every query below is RLS-scoped exactly like
 *  getInstructorResultSummaries — no student_id/class_id filter is applied
 *  in application code; instructors_read_own_class_% (010) and
 *  instructors_read_own_classes/assignments (006/007) are what actually
 *  restrict every one of these reads to "my own." All aggregation happens
 *  in application code, not SQL, since this project has no reporting RPC —
 *  fine at today's data scale; revisit if a class grows into the thousands
 *  of sessions. */
export async function getInstructorOverview(): Promise<InstructorOverview> {
  const supabase = await createSupabaseServerClient();

  const [
    { data: classRows, error: classError },
    { data: enrollmentRows, error: enrollmentError },
    { data: assignmentRows, error: assignmentError },
    { data: sessionRows, error: sessionError },
    { data: evidenceRows, error: evidenceError },
    { data: violationRows, error: violationError },
  ] = await Promise.all([
    supabase.from("classes").select("id"),
    supabase.from("class_enrollments").select("student_id"),
    supabase.from("assessment_assignments").select("id, scenario_id"),
    supabase.from("assessment_sessions").select("session_id, verification_status, verified_score, duration_seconds, resolved_ending_id"),
    supabase.from("session_evidence_results").select("evidence_id, final_status"),
    supabase.from("session_procedure_violations").select("event_type"),
  ]);

  for (const [label, error] of [
    ["classes", classError],
    ["class_enrollments", enrollmentError],
    ["assessment_assignments", assignmentError],
    ["assessment_sessions", sessionError],
    ["session_evidence_results", evidenceError],
    ["session_procedure_violations", violationError],
  ] as const) {
    if (error) console.warn(`[results] getInstructorOverview ${label} query failed:`, error.message);
  }

  const sessions = sessionRows ?? [];
  const verified = sessions.filter((s) => s.verification_status === "verified" && s.verified_score !== null);
  const withDuration = sessions.filter((s) => s.duration_seconds !== null);

  const endingCounts = new Map<string, number>();
  for (const s of sessions) {
    if (s.resolved_ending_id) endingCounts.set(s.resolved_ending_id, (endingCounts.get(s.resolved_ending_id) ?? 0) + 1);
  }

  const missedCounts = new Map<string, number>();
  for (const e of evidenceRows ?? []) {
    if (e.final_status !== "Processed") missedCounts.set(e.evidence_id, (missedCounts.get(e.evidence_id) ?? 0) + 1);
  }

  const violationCounts = new Map<string, number>();
  for (const v of violationRows ?? []) {
    violationCounts.set(v.event_type, (violationCounts.get(v.event_type) ?? 0) + 1);
  }

  return {
    totalClasses: classRows?.length ?? 0,
    totalStudents: new Set((enrollmentRows ?? []).map((e) => e.student_id)).size,
    totalAssignments: assignmentRows?.length ?? 0,
    totalScenarios: new Set((assignmentRows ?? []).map((a) => a.scenario_id)).size,
    totalSessions: sessions.length,
    verifiedSessions: verified.length,
    averageVerifiedScore: verified.length > 0 ? verified.reduce((sum, s) => sum + (s.verified_score as number), 0) / verified.length : null,
    averageDurationSeconds: withDuration.length > 0 ? withDuration.reduce((sum, s) => sum + (s.duration_seconds as number), 0) / withDuration.length : null,
    mostMissedEvidence: topEntries(missedCounts).map(({ key, count }) => ({ evidenceId: key, count })),
    mostCommonViolations: topEntries(violationCounts).map(({ key, count }) => ({ eventType: key, count })),
    endingDistribution: [...endingCounts.entries()].sort((a, b) => b[1] - a[1]).map(([endingId, count]) => ({ endingId, count })),
  };
}

/** One student's own session history across the instructor's classes —
 *  read-only, no enroll/remove capability (that requires new RLS write
 *  policies, out of scope for this batch). Filters the already-RLS-scoped
 *  getInstructorResultSummaries() result down to one student rather than
 *  issuing a separate query with a student_id the caller supplied — RLS has
 *  already proven every one of these rows belongs to this instructor's own
 *  classes, so narrowing in application code cannot leak a row RLS
 *  wouldn't already have returned. */
export async function getInstructorStudentSessions(studentId: string) {
  const all = await getInstructorResultSummaries();
  return all.filter((r) => r.studentId === studentId);
}

/** Every filter /class-results and its CSV export both accept — kept as one
 *  shared shape + one shared apply function so the page and the export can
 *  never drift out of sync (the export must "respect every active filter"
 *  exactly as the page shows them). All string values as read from
 *  searchParams/URL query params - `undefined`/empty means "no filter". */
export interface ResultFilters {
  classId?: string;
  scenarioId?: string;
  status?: string;
  /** Matches against student display name OR student ID code,
   *  case-insensitive substring. */
  q?: string;
  /** Inclusive, "YYYY-MM-DD", compared against completedAtUtc. */
  dateFrom?: string;
  dateTo?: string;
}

export interface DateRangeValidation {
  dateFrom?: string;
  dateTo?: string;
  /** Set when either date failed to parse, or dateFrom is after dateTo —
   *  callers should show this instead of silently dropping/misapplying the
   *  range. */
  error: string | null;
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Validates a raw "YYYY-MM-DD"/"YYYY-MM-DD" pair from query params.
 *  Deliberately does not throw - an instructor typing/pasting a bad date
 *  into the URL should see a clear message, not a 500. */
export function validateDateRange(dateFromRaw?: string, dateToRaw?: string): DateRangeValidation {
  const dateFrom = dateFromRaw?.trim() || undefined;
  const dateTo = dateToRaw?.trim() || undefined;

  if (dateFrom && (!DATE_ONLY_PATTERN.test(dateFrom) || Number.isNaN(Date.parse(dateFrom)))) {
    return { dateFrom: undefined, dateTo, error: `"${dateFrom}" isn't a valid date (expected YYYY-MM-DD).` };
  }
  if (dateTo && (!DATE_ONLY_PATTERN.test(dateTo) || Number.isNaN(Date.parse(dateTo)))) {
    return { dateFrom, dateTo: undefined, error: `"${dateTo}" isn't a valid date (expected YYYY-MM-DD).` };
  }
  if (dateFrom && dateTo && dateFrom > dateTo) {
    return { dateFrom, dateTo, error: "The start date is after the end date." };
  }
  return { dateFrom, dateTo, error: null };
}

/** Applies every active filter to an already RLS-scoped result list.
 *  dateFrom/dateTo compare against completedAtUtc's own date - a session
 *  with no completedAtUtc (still in progress) never matches an active date
 *  filter, which is the honest behavior (it doesn't have a completion date
 *  to be "in range"). */
export function applyResultFilters<T extends InstructorResultRow>(results: T[], filters: ResultFilters): T[] {
  const q = filters.q?.trim().toLowerCase();
  const { dateFrom, dateTo } = validateDateRange(filters.dateFrom, filters.dateTo);

  return results.filter((r) => {
    if (filters.classId && r.classId !== filters.classId) return false;
    if (filters.scenarioId && r.scenarioId !== filters.scenarioId) return false;
    if (filters.status && r.verificationStatus !== filters.status) return false;
    if (q) {
      const matchesName = r.studentDisplayName.toLowerCase().includes(q);
      const matchesId = r.studentIdCode?.toLowerCase().includes(q) ?? false;
      if (!matchesName && !matchesId) return false;
    }
    if (dateFrom || dateTo) {
      if (!r.completedAtUtc) return false;
      const completedDate = r.completedAtUtc.slice(0, 10);
      if (dateFrom && completedDate < dateFrom) return false;
      if (dateTo && completedDate > dateTo) return false;
    }
    return true;
  });
}
