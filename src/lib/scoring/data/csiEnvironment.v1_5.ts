// src/lib/scoring/data/csiEnvironment.v1_5.ts
import "server-only";
import type { ScoringRules } from "../types.ts";
import { CSI_ENVIRONMENT_SCORING_RULES_V1_4 } from "./csiEnvironment.v1_4.ts";

/** scoringRulesVersion "1.5.0" for CSI-ENVIRONMENT-001: identical to 1.4.0 -
 *  same categories, weights, formulas and 0.10 m tolerance - except two
 *  references in the MEASUREMENT ANSWER KEY. The knife's and the blood
 *  pattern's "North Wall" references sat behind the built-in north cabinet run,
 *  out of reach in VR; both now use the front edge of that cabinet run
 *  (z = 14.396, parallel to the wall, so each item keeps a 90-degree pair).
 *  New reference ids (REF-KNIFE-CAB, REF-SPATTER-CAB) and new expected
 *  distances; the other six references are unchanged.
 *
 *  A new version, not an edit of 1.4.0: sessions verified under 1.4.0 must stay
 *  re-explainable against exactly that key. Payload format unchanged.
 *
 *  Values baked in Unity from CSI_Environment (MeasurementRequirementSetEditor,
 *  Measurements_CSI_Environment.asset). Re-bake and publish a new version if the
 *  references are moved in the scene. */
const KNIFE = { referenceBId: "REF-KNIFE-CAB", expectedDistanceB: 1.079 };
const SPATTER = { referenceAId: "REF-SPATTER-CAB", expectedDistanceA: 1.382 };

export const CSI_ENVIRONMENT_SCORING_RULES_V1_5: ScoringRules = {
  ...CSI_ENVIRONMENT_SCORING_RULES_V1_4,
  scoringRulesVersion: "1.5.0",
  measurement: {
    ...CSI_ENVIRONMENT_SCORING_RULES_V1_4.measurement!,
    requirements: CSI_ENVIRONMENT_SCORING_RULES_V1_4.measurement!.requirements.map((r) =>
      r.requirementId === "MEAS-EVD-014"
        ? { ...r, ...KNIFE } // West Wall (x = -5.45) / Cabinet Front Edge (z = 14.396)
        : r.requirementId === "MEAS-EVD-015"
          ? { ...r, ...SPATTER } // Cabinet Front Edge (z = 14.396) / Cabinet End (x = -2.12)
          : r,
    ),
  },
};
