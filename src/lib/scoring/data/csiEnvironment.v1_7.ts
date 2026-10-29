import "server-only";
import type { ScoringRules, DeductionScoringDefinition } from "../types.ts";
import definition from "./csiEnvironment.v1_7.json" with { type: "json" };
import { CSI_ENVIRONMENT_SCORING_RULES_V1_6 } from "./csiEnvironment.v1_6.ts";
import { CSI_NEW_HOUSE_MEASUREMENTS_V1 } from "./csiEnvironment.newHouse.v1.ts";
import { CSI_NEW_HOUSE_MEASUREMENTS_V2 } from "./csiEnvironment.newHouse.v2.ts";
import { CSI_NEW_HOUSE_MEASUREMENTS_V3 } from "./csiEnvironment.newHouse.v3.ts";

/** Append-only research configuration. JSON mirrors the Unity resource exactly;
 * expert validation is pending. Legacy categories continue as analytics only. */
export const CSI_ENVIRONMENT_SCORING_RULES_V1_7: ScoringRules = {
  ...CSI_ENVIRONMENT_SCORING_RULES_V1_6,
  scoringRulesVersion: definition.scoringRulesVersion,
  measurement: {
    ...CSI_ENVIRONMENT_SCORING_RULES_V1_6.measurement!,
    layoutProfiles: { "new-house-v1": CSI_NEW_HOUSE_MEASUREMENTS_V1, "new-house-v2": CSI_NEW_HOUSE_MEASUREMENTS_V2, "new-house-v3": CSI_NEW_HOUSE_MEASUREMENTS_V3 },
  },
  categoryWeights: {
    criticalRecall: 0, relevantRecall: 0, precision: 0, distractorFallRate: 0,
    reasoningAccuracy: 0, documentationAccuracy: 0, relationshipAccuracy: 0,
    proceduralCompliance: 0, finalConclusionAccuracy: 0,
    scenePhotography: 0, measurement: 0, procedureOrderCompliance: 0,
  },
  deduction: definition as DeductionScoringDefinition,
};
