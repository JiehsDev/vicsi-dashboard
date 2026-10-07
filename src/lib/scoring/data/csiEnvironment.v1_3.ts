// src/lib/scoring/data/csiEnvironment.v1_3.ts
import "server-only";
import type { ScoringRules } from "../types.ts";
import { CSI_ENVIRONMENT_SCORING_RULES_V1_2 } from "./csiEnvironment.v1_2.ts";

/** scoringRulesVersion "1.3.0" for CSI-ENVIRONMENT-001: identical to 1.2.0
 *  plus procedure order compliance (see procedureOrderScorer.ts) - warning-
 *  level out-of-order actions only; blocked actions stay in
 *  proceduralCompliance, unchanged. No earlier weight changes.
 *
 *  Effect on the overall score: 1.2.0's category weights sum to 14, so a
 *  weight of 1 makes it 1/15 (~6.7%) nominally - 1/14 (~7.1%) for this
 *  scenario's current answer key, which has no distractor items. Sessions
 *  verified under earlier versions are never re-scored with these weights.
 *
 *  The allowlist covers every Warn stepRequirement authored today (the only
 *  ProcedureOutOfOrder source). A procedureId not listed here never counts. */
export const CSI_ENVIRONMENT_SCORING_RULES_V1_3: ScoringRules = {
  ...CSI_ENVIRONMENT_SCORING_RULES_V1_2,
  scoringRulesVersion: "1.3.0",
  categoryWeights: {
    ...CSI_ENVIRONMENT_SCORING_RULES_V1_2.categoryWeights,
    procedureOrderCompliance: 1,
  },
  procedureOrder: {
    penaltyPerWarning: 0.1,
    samePressWindowMs: 250,
    countable: [
      // Initial evidence photo before the overall scene photography.
      { procedureId: "scene-photos-before-evidence-photo", excludeWhen: "sceneAttemptSamePress" },
      // Final evidence photo before the item's position was measured.
      { procedureId: "final-evidence-photograph", excludeWhen: "measurementNotCompletedOnTime" },
    ],
  },
};
