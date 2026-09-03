// src/lib/types.ts

export type Role = "Photographer" | "IOC";

export type StudentStatus = "flagged" | "onTrack" | "strong";

/** Mirrors the `student_session_summary` SQL view */
export interface StudentSessionSummary {
  id: string; // e.g. "STU-0231"
  name: string;
  role: Role;
  section?: string; // e.g. "A" — optional until the view backs it
  scenarioId: string;
  scenarioName: string;
  accuracy: number; // deduction accuracy, 0-100
  compliance: number; // procedural compliance, 0-100
  /** % of required scenario steps completed, 0-100. Optional — the live
   *  `student_session_summary` table doesn't have a `completion_pct`
   *  column yet (verified against the real DB), so real rows omit it
   *  until that column exists. Only the mock fallback populates it today. */
  completionPct?: number;
  timeOnTaskMin: number;
  errorCount: number;
  sessionId: string; // FK used to fetch the timeline
  /** Change in accuracy (pts) vs. the previous grading period. Optional —
   *  requires a period-over-period SQL view that doesn't exist yet, so
   *  real rows simply omit it until that view is built. */
  trendPts?: number;
}

/** Mirrors the `scenario_aggregate` SQL view */
export interface ScenarioAggregate {
  scenarioId: string;
  scenarioName: string;
  completionRate: number;
  avgTimeMin: number;
  commonError: string;
  errorFrequency: number;
}

/** One row from the `evidence_events` table, filtered by session_id */
export interface EvidenceEvent {
  timestamp: string; // "00:02:11" elapsed, or ISO string from DB
  action: string; // e.g. "Photographed", "Connected evidence"
  item: string; // e.g. "Kitchen knife"
  correct: boolean;
  note?: string; // optional explanation when correct === false
}

/** Mirrors a row in the `profiles` table — app-level identity layered on
 *  top of Supabase auth (role, Student ID, section). See
 *  supabase/migrations/001_profiles.sql. */
export interface Profile {
  id: string; // auth.users.id
  role: "instructor" | "student";
  fullName: string;
  studentId: string | null;
  section: string | null;
}

export interface ExpertBenchmark {
  accuracy: number;
  compliance: number;
  completion: number;
  timeOnTaskMin: number;
}

/** A single named failure mode aggregated across the whole class (not tied
 *  to one scenario). Distinct from `ScenarioAggregate.commonError`, which is
 *  just the single most frequent error for one scenario. */
export interface ErrorLogEntry {
  label: string;
  occurrences: number;
}

/** Simple, tunable threshold logic — kept in one place so it's a one-line
 *  change once real pilot data tells you what "flagged" should mean. */
export function statusOf(
  s: Pick<StudentSessionSummary, "accuracy" | "compliance">,
): StudentStatus {
  if (s.accuracy < 65 || s.compliance < 70) return "flagged";
  if (s.accuracy >= 90 && s.compliance >= 90) return "strong";
  return "onTrack";
}
