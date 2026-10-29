// src/lib/scoring/registry.ts
import "server-only";
import type { GroundTruth, ScoringRules } from "./types.ts";
import { CSI_ENVIRONMENT_GROUND_TRUTH_V1, CSI_ENVIRONMENT_SCORING_RULES_V1 } from "./data/csiEnvironment.v1.ts";
import { CSI_ENVIRONMENT_SCORING_RULES_V1_1 } from "./data/csiEnvironment.v1_1.ts";
import { CSI_ENVIRONMENT_SCORING_RULES_V1_2 } from "./data/csiEnvironment.v1_2.ts";
import { CSI_ENVIRONMENT_SCORING_RULES_V1_3 } from "./data/csiEnvironment.v1_3.ts";
import { CSI_ENVIRONMENT_SCORING_RULES_V1_4 } from "./data/csiEnvironment.v1_4.ts";
import { CSI_ENVIRONMENT_SCORING_RULES_V1_5 } from "./data/csiEnvironment.v1_5.ts";
import { CSI_ENVIRONMENT_GROUND_TRUTH_V1_1 } from "./data/csiEnvironment.groundTruth.v1_1.ts";

/** Versioned lookup — the ONLY place a scenarioId+version resolves to an
 *  actual ground-truth/rules object. Adding a new scenario or a new version
 *  of an existing one means adding a new entry here and a new data file
 *  under src/lib/scoring/data/, never mutating an existing version in place
 *  (a session already verified against groundTruthVersion "1" must always
 *  be re-explainable against exactly that version's answer key). */
import { CSI_ENVIRONMENT_GROUND_TRUTH_V1_2 } from "./data/csiEnvironment.groundTruth.v1_2.ts";

const GROUND_TRUTH_REGISTRY: Record<string, Record<string, GroundTruth>> = {
  "CSI-ENVIRONMENT-001": {
    "1.0.0": CSI_ENVIRONMENT_GROUND_TRUTH_V1,
    "1.1.0": CSI_ENVIRONMENT_GROUND_TRUTH_V1_1,
    "1.2.0": CSI_ENVIRONMENT_GROUND_TRUTH_V1_2,
  },
};

import { CSI_ENVIRONMENT_SCORING_RULES_V1_6 } from "./data/csiEnvironment.v1_6.ts";
import { CSI_ENVIRONMENT_SCORING_RULES_V1_7 } from "./data/csiEnvironment.v1_7.ts";

const SCORING_RULES_REGISTRY: Record<string, Record<string, ScoringRules>> = {
  "CSI-ENVIRONMENT-001": {
    "1.0.0": CSI_ENVIRONMENT_SCORING_RULES_V1,
    "1.1.0": CSI_ENVIRONMENT_SCORING_RULES_V1_1,
    "1.2.0": CSI_ENVIRONMENT_SCORING_RULES_V1_2,
    "1.3.0": CSI_ENVIRONMENT_SCORING_RULES_V1_3,
    "1.4.0": CSI_ENVIRONMENT_SCORING_RULES_V1_4,
    "1.5.0": CSI_ENVIRONMENT_SCORING_RULES_V1_5,
    "1.6.0": CSI_ENVIRONMENT_SCORING_RULES_V1_6,
    "1.7.0": CSI_ENVIRONMENT_SCORING_RULES_V1_7,
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

export interface SessionScoringResolution {
  groundTruthVersion?: string;
  scoringRulesVersion?: string;
  groundTruth: GroundTruth | null;
  scoringRules: ScoringRules | null;
}

/** The versions a stored session is scored with: exactly what the session
 *  carries, or - only when a version is MISSING (an older client that never
 *  sent one) - the LATEST_* fallback above, which stays at the historical
 *  1.0.0 so such sessions keep their original scoring. An unsupported or
 *  malformed version resolves to null (the caller marks the session
 *  requires_review) - never silently scored with the newest rules. Current
 *  clients send scoringRulesVersion explicitly (Unity ScenarioDefinition). */
export function resolveSessionScoring(
  scenarioId: string,
  groundTruthVersion: string | null | undefined,
  scoringRulesVersion: string | null | undefined,
): SessionScoringResolution {
  const gtv = groundTruthVersion || LATEST_GROUND_TRUTH_VERSION[scenarioId];
  const srv = scoringRulesVersion || LATEST_SCORING_RULES_VERSION[scenarioId];
  return {
    groundTruthVersion: gtv,
    scoringRulesVersion: srv,
    groundTruth: gtv ? resolveGroundTruth(scenarioId, gtv) : null,
    scoringRules: srv ? resolveScoringRules(scenarioId, srv) : null,
  };
}
