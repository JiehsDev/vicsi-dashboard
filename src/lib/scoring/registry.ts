// src/lib/scoring/registry.ts
import "server-only";
import type { GroundTruth, ScoringRules } from "./types.ts";
import { CSI_ENVIRONMENT_GROUND_TRUTH_V1, CSI_ENVIRONMENT_SCORING_RULES_V1 } from "./data/csiEnvironment.v1.ts";

/** Versioned lookup — the ONLY place a scenarioId+version resolves to an
 *  actual ground-truth/rules object. Adding a new scenario or a new version
 *  of an existing one means adding a new entry here and a new data file
 *  under src/lib/scoring/data/, never mutating an existing version in place
 *  (a session already verified against groundTruthVersion "1" must always
 *  be re-explainable against exactly that version's answer key). */
const GROUND_TRUTH_REGISTRY: Record<string, Record<string, GroundTruth>> = {
  "CSI-ENVIRONMENT-001": {
    "1.0.0": CSI_ENVIRONMENT_GROUND_TRUTH_V1,
  },
};

const SCORING_RULES_REGISTRY: Record<string, Record<string, ScoringRules>> = {
  "CSI-ENVIRONMENT-001": {
    "1.0.0": CSI_ENVIRONMENT_SCORING_RULES_V1,
  },
};

export function resolveGroundTruth(scenarioId: string, groundTruthVersion: string): GroundTruth | null {
  return GROUND_TRUTH_REGISTRY[scenarioId]?.[groundTruthVersion] ?? null;
}

export function resolveScoringRules(scenarioId: string, scoringRulesVersion: string): ScoringRules | null {
  return SCORING_RULES_REGISTRY[scenarioId]?.[scoringRulesVersion] ?? null;
}

/** The version a fresh submission with no explicit version should be scored
 *  against — used by verify.ts when a session's own scoring_rules_version/
 *  ground_truth_version columns are empty (an older client, or one that
 *  never set them). Never used to silently override a version a session DID
 *  specify. */
export const LATEST_GROUND_TRUTH_VERSION: Record<string, string> = {
  "CSI-ENVIRONMENT-001": "1.0.0",
};
export const LATEST_SCORING_RULES_VERSION: Record<string, string> = {
  "CSI-ENVIRONMENT-001": "1.0.0",
};
