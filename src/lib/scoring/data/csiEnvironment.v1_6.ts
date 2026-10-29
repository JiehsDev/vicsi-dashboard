import "server-only";
import type { ScoringRules } from "../types.ts";
import { CSI_ENVIRONMENT_SCORING_RULES_V1_5 } from "./csiEnvironment.v1_5.ts";

/** Phase 1: procedures remain required training, independently of deduction.
 * All historical training ratios/counts remain available for analytics. Zero
 * weights remove them from BOTH the overall numerator and denominator.
 * Marker-based recall/precision/fall-rate depend on handling actions, so they
 * are also training analytics. Assessment weights are inherited unchanged.
 * No historical rules/keys, missing-version fallbacks or payload fields change.
 */
export const CSI_ENVIRONMENT_SCORING_RULES_V1_6: ScoringRules = {
  ...CSI_ENVIRONMENT_SCORING_RULES_V1_5,
  scoringRulesVersion: "1.6.0",
  categoryWeights: {
    ...CSI_ENVIRONMENT_SCORING_RULES_V1_5.categoryWeights,
    criticalRecall: 0,
    relevantRecall: 0,
    precision: 0,
    distractorFallRate: 0,
    proceduralCompliance: 0,
    scenePhotography: 0,
    measurement: 0,
    procedureOrderCompliance: 0,
  },
  // IDs were classified against current authored text, not their legacy names.
  // These statements attest only to procedure completion. All observations,
  // interpretation and unsupported assumptions continue to be assessed.
  trainingReportLines: [
    { evidenceId: "EVD-014", lineId: "knife-print-on-handle" },
    { evidenceId: "EVD-015", lineId: "blood-spatter-swab-collection" },
    { evidenceId: "EVD-018", lineId: "bottle-standard-procedure" },
  ],
};
