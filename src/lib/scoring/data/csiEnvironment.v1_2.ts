// src/lib/scoring/data/csiEnvironment.v1_2.ts
import "server-only";
import type { ScoringRules } from "../types.ts";
import { CSI_ENVIRONMENT_SCORING_RULES_V1_1 } from "./csiEnvironment.v1_1.ts";

/** scoringRulesVersion "1.2.0" for CSI-ENVIRONMENT-001: identical to 1.1.0
 *  plus the measurement category (see measurementScorer.ts). No earlier
 *  weight changes.
 *
 *  Effect on the overall score: 1.1.0's category weights sum to 13, so a
 *  measurement weight of 1 makes it 1/14 (~7.1%) of the overall score and
 *  scales every other category's share by 13/14. Sessions verified under
 *  1.0.0/1.1.0 are never re-scored with these weights.
 *
 *  The requirements below are the authoritative copy of Unity's
 *  Measurements_CSI_Environment.asset (expected floor-plan distances from
 *  REF-A / REF-B, 0.10 m tolerance). The server judges accuracy against
 *  THESE values, never the client's own withinTolerance flags. */
export const CSI_ENVIRONMENT_SCORING_RULES_V1_2: ScoringRules = {
  ...CSI_ENVIRONMENT_SCORING_RULES_V1_1,
  scoringRulesVersion: "1.2.0",
  categoryWeights: {
    ...CSI_ENVIRONMENT_SCORING_RULES_V1_1.categoryWeights,
    measurement: 1,
  },
  measurement: {
    completionWeight: 0.3,
    accuracyWeight: 0.5,
    timingWeight: 0.2,
    requirements: [
      { requirementId: "MEAS-BODY-A", evidenceId: "BODY-A", referenceAId: "REF-A", referenceBId: "REF-B", expectedDistanceA: 3.271, expectedDistanceB: 7.447, tolerance: 0.1 },
      { requirementId: "MEAS-EVD-014", evidenceId: "EVD-014", referenceAId: "REF-A", referenceBId: "REF-B", expectedDistanceA: 2.13, expectedDistanceB: 8.395, tolerance: 0.1 },
      { requirementId: "MEAS-EVD-015", evidenceId: "EVD-015", referenceAId: "REF-A", referenceBId: "REF-B", expectedDistanceA: 3.006, expectedDistanceB: 7.544, tolerance: 0.1 },
      { requirementId: "MEAS-EVD-018", evidenceId: "EVD-018", referenceAId: "REF-A", referenceBId: "REF-B", expectedDistanceA: 4.592, expectedDistanceB: 7.467, tolerance: 0.1 },
    ],
  },
};
