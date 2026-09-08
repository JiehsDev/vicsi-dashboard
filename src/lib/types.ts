// src/lib/types.ts

export type Role = "Photographer" | "IOC";

/** Mirrors the `student_session_summary` SQL view */
export interface StudentSessionSummary {
  id: string; // e.g. "STU-0231"
  name: string;
  role: Role;
  section?: string; // e.g. "A" — optional until the view backs it
  scenarioId: string;
  scenarioName: string;
  /** Deduction accuracy, 0-100, or null if it cannot yet be computed - no
   *  agreed formula exists yet for collapsing the offline scorer's separate
   *  metrics (criticalRecall, relevantRecall, precision, distractorFallRate)
   *  into this one number. Genuinely nullable at the DB level (see
   *  supabase/migrations/004_evidence_events_correctness_and_missing_ddl.sql
   *  §3) and the mapper passes that through as-is - render null as an
   *  honest "not available" state, never as 0. */
  accuracy: number | null;
  /** Procedural compliance, 0-100, or null - same nullability and reasoning
   *  as accuracy above. */
  compliance: number | null;
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

/** Which of three incompatible jobs a row's correctness dimension is doing -
 *  see supabase/migrations/004_evidence_events_correctness_and_missing_ddl.sql
 *  §2 for why this replaced inferring the distinction from `action` text. */
export type EvidenceEventKind = "procedural" | "inferential" | "informational";

/** One row from the `evidence_events` table, filtered by session_id */
export interface EvidenceEvent {
  timestamp: string; // "00:02:11" elapsed, or ISO string from DB
  action: string; // e.g. "Photographed", "Connected evidence"
  item: string; // e.g. "Kitchen knife"
  eventKind: EvidenceEventKind;
  /** null for `informational` rows - a routine milestone (e.g.
   *  "Photographed") has no correctness dimension at all, and forcing a
   *  boolean there was the vacuous-true bug §2 of migration 004 fixed.
   *  Render null as neutral, never as a fabricated true/false. */
  correct: boolean | null;
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
