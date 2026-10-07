// src/lib/scoring/data/csiEnvironment.v1_4.ts
import "server-only";
import type { ScoringRules } from "../types.ts";
import { CSI_ENVIRONMENT_SCORING_RULES_V1_3 } from "./csiEnvironment.v1_3.ts";

/** scoringRulesVersion "1.4.0" for CSI-ENVIRONMENT-001: identical to 1.3.0 -
 *  same categories, weights and scoring formulas - except the MEASUREMENT ANSWER
 *  KEY. From this version each item is measured from its own two nearby fixed
 *  references (walls / built-in counter faces), as perpendicular distances
 *  (rectangular coordinates), instead of two shared room corners. New reference
 *  ids, new expected distances; tolerance unchanged (0.10 m).
 *
 *  The payload format did not change. A new version is required only because the
 *  answer key did: sessions verified under 1.2.0/1.3.0 (corner references
 *  REF-A/REF-B) must stay re-explainable against exactly that key.
 *
 *  Values baked in Unity from CSI_Environment (MeasurementRequirementSetEditor,
 *  Measurements_CSI_Environment.asset). Re-bake and publish a new version if the
 *  references are moved in the scene. */
export const CSI_ENVIRONMENT_SCORING_RULES_V1_4: ScoringRules = {
  ...CSI_ENVIRONMENT_SCORING_RULES_V1_3,
  scoringRulesVersion: "1.4.0",
  measurement: {
    ...CSI_ENVIRONMENT_SCORING_RULES_V1_3.measurement!,
    requirements: [
      // West Wall (x = -5.45) / back face of the built-in counter (z = 11.67)
      { requirementId: "MEAS-BODY-A", evidenceId: "BODY-A", referenceAId: "REF-BODYA-1", referenceBId: "REF-BODYA-2", expectedDistanceA: 2.449, expectedDistanceB: 1.131, tolerance: 0.1 },
      // West Wall (x = -5.45) / North Wall (z = 14.98)
      { requirementId: "MEAS-EVD-014", evidenceId: "EVD-014", referenceAId: "REF-KNIFE-1", referenceBId: "REF-KNIFE-2", expectedDistanceA: 1.341, expectedDistanceB: 1.663, tolerance: 0.1 },
      // North Wall (z = 14.98) / east end of the built-in north cabinet run (x = -2.12)
      { requirementId: "MEAS-EVD-015", evidenceId: "EVD-015", referenceAId: "REF-SPATTER-1", referenceBId: "REF-SPATTER-2", expectedDistanceA: 1.966, expectedDistanceB: 1.042, tolerance: 0.1 },
      // End (x = -2.12) and front (z = 11.07) faces of the built-in counter it stands on
      { requirementId: "MEAS-EVD-018", evidenceId: "EVD-018", referenceAId: "REF-BOTTLE-1", referenceBId: "REF-BOTTLE-2", expectedDistanceA: 0.353, expectedDistanceB: 0.405, tolerance: 0.1 },
    ],
  },
};
