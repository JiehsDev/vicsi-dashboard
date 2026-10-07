// src/lib/scoring/__tests__/scoringVersion.test.ts
//
// Which scoring rules a stored session is verified with (resolveSessionScoring -
// what verify.ts uses), and what scene photography contributes under each version.
// Current Unity clients stamp scoringRulesVersion "1.5.0" (ScenarioDefinition; see
// cabinetMeasurementReference.test.ts); sessions stamped 1.1.0-1.4.0 keep those rules;
// historical sessions stamped "1.0.0" - or nothing - keep their original scoring.

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSessionScoring, LATEST_SCORING_RULES_VERSION } from "../registry.ts";
import { scoreScenePhotography } from "../scenePhotographyScorer.ts";
import { computeOverallScore } from "../overallScore.ts";
import type { ScoreCategories, ScoringSessionEvent } from "../types.ts";

const SCENARIO = "CSI-ENVIRONMENT-001";

// ---- version selection -----------------------------------------------------

test("session stamped 1.1.0 / 1.1.0 resolves rules 1.1.0 with scene photography weighted", () => {
  const r = resolveSessionScoring(SCENARIO, "1.1.0", "1.1.0");
  assert.equal(r.scoringRulesVersion, "1.1.0");
  assert.equal(r.scoringRules?.scoringRulesVersion, "1.1.0");
  assert.equal(r.scoringRules?.categoryWeights.scenePhotography, 1);
  assert.ok(r.scoringRules?.scenePhotography);
  assert.equal(r.groundTruth?.groundTruthVersion, "1.1.0");
});

test("historical session stamped 1.0.0 stays on 1.0.0 (no scene photography weight)", () => {
  const r = resolveSessionScoring(SCENARIO, "1.0.0", "1.0.0");
  assert.equal(r.scoringRules?.scoringRulesVersion, "1.0.0");
  assert.equal(r.scoringRules?.categoryWeights.scenePhotography ?? 0, 0);
});

test("scoring version and answer-key version are independent", () => {
  const r = resolveSessionScoring(SCENARIO, "1.1.0", "1.0.0");
  assert.equal(r.groundTruth?.groundTruthVersion, "1.1.0");
  assert.equal(r.scoringRules?.scoringRulesVersion, "1.0.0");
});

test("missing scoring version (older client) falls back to the historical 1.0.0, not the newest", () => {
  assert.equal(LATEST_SCORING_RULES_VERSION[SCENARIO], "1.0.0");
  for (const missing of [null, undefined, ""]) {
    const r = resolveSessionScoring(SCENARIO, "1.0.0", missing);
    assert.equal(r.scoringRules?.scoringRulesVersion, "1.0.0");
  }
});

test("unsupported or malformed scoring version resolves to nothing (requires_review), never the newest rules", () => {
  for (const bad of ["9.9.9", "1.6.0", "1.1", "v1.1.0", "latest", " 1.1.0"]) {
    assert.equal(resolveSessionScoring(SCENARIO, "1.1.0", bad).scoringRules, null, bad);
  }
  assert.equal(resolveSessionScoring("UNKNOWN-SCENARIO", "1.1.0", "1.1.0").scoringRules, null);
});

// ---- scene photography under 1.1.0 ----------------------------------------

const IDS = ["p10", "p20", "p30", "p40", "p50", "p60", "p70"];
let seq = 0;
function ev(eventType: string, targetId: string | null, payload: Record<string, string> = {}): ScoringSessionEvent {
  seq++;
  return { sequenceNumber: seq, timestampMs: seq * 1000, eventType, targetId, payload: Object.entries(payload).map(([key, value]) => ({ key, value })) };
}
const started = () => ev("ScenePhotographyStarted", null, { requiredPointCount: "7", pointCount: "7" });
const completed = (id: string) => ev("ScenePhotoCompleted", id, { inOrder: "True", required: "True" });
const rules11 = () => resolveSessionScoring(SCENARIO, "1.1.0", "1.1.0").scoringRules!;

test("perfect route under 1.1.0 -> scene photography 100%", () => {
  const r = scoreScenePhotography([started(), ...IDS.map(completed)], rules11().scenePhotography);
  assert.equal(r.scenePhotography, 1);
});

test("one wrong-position attempt -> accuracy 7/8, score 0.975", () => {
  const r = scoreScenePhotography([started(), ev("ScenePhotoWrongPosition", "p10"), ...IDS.map(completed)], rules11().scenePhotography);
  assert.equal(r.scenePhotographyAccuracy, 0.875);
  assert.equal(r.scenePhotography, 0.975);
});

test("mixed: one wrong-order + one wrong-angle + one wrong-position -> 0.9225 (matches Unity's ScenePhotographyScoring)", () => {
  const events = [
    started(),
    completed("p10"),
    ev("ScenePhotoOutOfSequence", "p30"),
    ev("ScenePhotoWrongAngle", "p20"),
    ev("ScenePhotoWrongPosition", "p20"),
    ...IDS.slice(1).map(completed),
  ];
  const r = scoreScenePhotography(events, rules11().scenePhotography);
  assert.equal(r.scenePhotographyCoverage, 1); // 7/7
  assert.equal(r.scenePhotographySequence, 0.875); // 7 in order / (7 + 1 wrong-order)
  assert.equal(r.scenePhotographyAccuracy, 0.8); // well-placed 8 / (8 + 1 + 1)
  assert.equal(r.scenePhotography, 0.9225); // 0.5*1 + 0.3*0.875 + 0.2*0.8
});

// ---- overall score: same session data, 1.0.0 vs 1.1.0 --------------------

const sameSession: ScoreCategories = {
  criticalRecall: 1,
  relevantRecall: 1,
  precision: 1,
  reasoningAccuracy: 2 / 3,
  documentationAccuracy: 0.75,
  relationshipAccuracy: 1,
  proceduralCompliance: 0.9,
  finalConclusionAccuracy: 1,
  scenePhotography: 0.5, // a sloppy route, so its effect on the total is visible
};

test("same session: 1.0.0 ignores scene photography; 1.1.0 weights it 1 of 13", () => {
  const v1 = computeOverallScore(sameSession, resolveSessionScoring(SCENARIO, "1.1.0", "1.0.0").scoringRules!.categoryWeights)!;
  const v11 = computeOverallScore(sameSession, rules11().categoryWeights)!;
  const { scenePhotography: _ignored, ...withoutScene } = sameSession;
  assert.equal(v1, computeOverallScore(withoutScene, resolveSessionScoring(SCENARIO, "1.1.0", "1.0.0").scoringRules!.categoryWeights));
  // Other categories' weights sum to 11 here (distractorFallRate undefined under GT 1.1.0 -> excluded);
  // scene photography adds weight 1 to that denominator.
  const otherWeight = 2 + 1 + 1 + 1.5 + 1 + 1.5 + 1 + 2;
  const weightedOthers = 1 * 2 + 1 * 1 + 1 * 1 + (2 / 3) * 1.5 + 0.75 * 1 + 1 * 1.5 + 0.9 * 1 + 1 * 2;
  assert.equal(v1, Math.round((weightedOthers / otherWeight) * 10000) / 10000);
  assert.equal(v11, Math.round(((weightedOthers + 0.5) / (otherWeight + 1)) * 10000) / 10000);
  assert.notEqual(v1, v11);
});

test("session stamped 1.1.0 / 1.2.0 resolves rules 1.2.0: scene photography and measurement weighted", () => {
  const r = resolveSessionScoring(SCENARIO, "1.1.0", "1.2.0");
  assert.equal(r.scoringRules?.scoringRulesVersion, "1.2.0");
  assert.equal(r.scoringRules?.categoryWeights.scenePhotography, 1);
  assert.equal(r.scoringRules?.categoryWeights.measurement, 1);
  assert.equal(r.groundTruth?.groundTruthVersion, "1.1.0");
});
