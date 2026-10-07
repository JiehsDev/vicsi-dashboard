// src/lib/scoring/data/csiEnvironment.v1_1.ts
import "server-only";
import type { ScoringRules } from "../types.ts";
import { CSI_ENVIRONMENT_SCORING_RULES_V1 } from "./csiEnvironment.v1.ts";

/** scoringRulesVersion "1.1.0" for CSI-ENVIRONMENT-001: identical to 1.0.0
 *  plus the scene photography category. Independent of the ground-truth
 *  version - scene photography needs no answer key, it is scored from the session's own
 *  ScenePhoto* events against the route the client reports in
 *  ScenePhotographyStarted.
 *
 *  Effect on the overall score: the existing category weights sum to 12, so a
 *  scenePhotography weight of 1 makes it 1/13 (~7.7%) of the overall score
 *  and scales every other category's share by 12/13. A session with no scene
 *  photography events leaves the category undefined, so its overall score is
 *  computed exactly as under 1.0.0. Sessions already verified under 1.0.0 are
 *  never re-scored with these weights. */
export const CSI_ENVIRONMENT_SCORING_RULES_V1_1: ScoringRules = {
  ...CSI_ENVIRONMENT_SCORING_RULES_V1,
  scoringRulesVersion: "1.1.0",
  categoryWeights: {
    ...CSI_ENVIRONMENT_SCORING_RULES_V1.categoryWeights,
    scenePhotography: 1,
  },
  scenePhotography: {
    coverageWeight: 0.5,
    sequenceWeight: 0.3,
    accuracyWeight: 0.2,
  },
};
