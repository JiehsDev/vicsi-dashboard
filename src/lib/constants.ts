// src/lib/constants.ts
import type { ExpertBenchmark } from "./types";

/** Reference performance for a proficient examiner completing the standard
 *  indoor case scenario. Shared by the overview and student-profile pages. */
export const EXPERT_BENCHMARK: ExpertBenchmark = {
  accuracy: 96,
  compliance: 98,
  completion: 100,
  timeOnTaskMin: 11,
};

/** Every student belongs to exactly one of these — enforced server-side by
 *  the `section_is_single_uppercase_letter` check on `profiles` (see
 *  supabase/migrations/003_require_student_section.sql). This list is just
 *  the app-level menu of sections currently in use; the DB accepts any
 *  single uppercase letter, so extend this array to open a new section. */
export const SECTIONS = ["A", "B", "C", "D", "E", "F"] as const;
export type Section = (typeof SECTIONS)[number];

/** Illustrative period-over-period deltas for the class-wide KPI tiles.
 *  There's no "previous period" SQL view yet — once one exists, these
 *  should be computed from it instead of hardcoded. */
export const CLASS_TREND = {
  accuracyPts: 3,
  compliancePts: 2,
  completionPts: 5,
  responseTimeFasterMin: 0.37, // "0:22 faster"
};
