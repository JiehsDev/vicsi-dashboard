// src/lib/scoring/__tests__/scenePhotography.test.ts
//
// Unit tests for the scene photography category and its effect on the
// overall score. Event shapes mirror what Unity's ScenePhotographyManager logs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreScenePhotography } from "../scenePhotographyScorer.ts";
import { computeOverallScore } from "../overallScore.ts";
import { CSI_ENVIRONMENT_SCORING_RULES_V1 } from "../data/csiEnvironment.v1.ts";
import { CSI_ENVIRONMENT_SCORING_RULES_V1_1 } from "../data/csiEnvironment.v1_1.ts";
import type { ScoreCategories, ScoringSessionEvent } from "../types.ts";

const IDS = ["p10", "p20", "p30", "p40", "p50", "p60", "p70"];
let seq = 0;

function ev(eventType: string, targetId: string | null, payload: Record<string, string> = {}, timestampMs = seq * 1000): ScoringSessionEvent {
  seq++;
  return { sequenceNumber: seq, timestampMs, eventType, targetId, payload: Object.entries(payload).map(([key, value]) => ({ key, value })) };
}

function started(required = 7): ScoringSessionEvent {
  return ev("ScenePhotographyStarted", null, { requiredPointCount: String(required), pointCount: String(required) }, 0);
}

function completed(id: string, inOrder = true, required = true, t?: number): ScoringSessionEvent {
  return ev("ScenePhotoCompleted", id, { inOrder: inOrder ? "True" : "False", required: required ? "True" : "False" }, t);
}

const rules = CSI_ENVIRONMENT_SCORING_RULES_V1_1.scenePhotography;

test("perfect route -> 100/100/100, score 1", () => {
  const events = [started(), ...IDS.map((id) => completed(id)), ev("ScenePhotographyCompleted", null, {}, 90_000)];
  const r = scoreScenePhotography(events, rules);
  assert.equal(r.scenePhotographyCoverage, 1);
  assert.equal(r.scenePhotographySequence, 1);
  assert.equal(r.scenePhotographyAccuracy, 1);
  assert.equal(r.scenePhotography, 1);
  assert.equal(r.counts.completionSeconds, 90);
  assert.equal(r.counts.totalAttempts, 7);
});

test("one wrong-order attempt -> coverage 1, sequence 7/8, score 0.9625", () => {
  const events = [started(), completed("p10"), ev("ScenePhotoOutOfSequence", "p30"), ...IDS.slice(1).map((id) => completed(id))];
  const r = scoreScenePhotography(events, rules);
  assert.equal(r.scenePhotographyCoverage, 1);
  assert.equal(r.scenePhotographySequence, 0.875);
  assert.equal(r.scenePhotographyAccuracy, 1);
  assert.equal(r.scenePhotography, 0.9625);
});

test("one wrong-angle attempt -> accuracy 7/8, score 0.975", () => {
  const events = [started(), ev("ScenePhotoWrongAngle", "p10"), ...IDS.map((id) => completed(id))];
  const r = scoreScenePhotography(events, rules);
  assert.equal(r.scenePhotographyCoverage, 1);
  assert.equal(r.scenePhotographyAccuracy, 0.875);
  assert.equal(r.scenePhotography, 0.975);
});

test("incomplete route (5 of 7) -> coverage 5/7, no completion time", () => {
  const events = [started(), ...IDS.slice(0, 5).map((id) => completed(id))];
  const r = scoreScenePhotography(events, rules);
  assert.equal(r.scenePhotographyCoverage, 0.7143);
  assert.equal(r.scenePhotography, 0.8571);
  assert.equal(r.counts.completionSeconds, undefined);
});

test("duplicate completion events are counted once", () => {
  const events = [started(), ...IDS.map((id) => completed(id)), completed("p10"), completed("p10")];
  assert.equal(scoreScenePhotography(events, rules).counts.completedTotalCount, 7);
});

test("route started but nothing documented -> score 0, not undefined", () => {
  assert.equal(scoreScenePhotography([started()], rules).scenePhotography, 0);
});

test("no ScenePhotographyStarted event (older client) -> undefined, not 0", () => {
  const r = scoreScenePhotography([ev("SessionStarted", null)], rules);
  assert.equal(r.scenePhotography, undefined);
});

const baseCategories: ScoreCategories = {
  criticalRecall: 1,
  relevantRecall: 0.5,
  precision: 0.8,
  distractorFallRate: 0,
  reasoningAccuracy: 0.6,
  documentationAccuracy: 0.7,
  relationshipAccuracy: 0.5,
  proceduralCompliance: 0.9,
  finalConclusionAccuracy: 1,
};

test("rules 1.0.0: overall score unchanged by a scene photography category", () => {
  const without = computeOverallScore(baseCategories, CSI_ENVIRONMENT_SCORING_RULES_V1.categoryWeights);
  const withScene = computeOverallScore({ ...baseCategories, scenePhotography: 0.2 }, CSI_ENVIRONMENT_SCORING_RULES_V1.categoryWeights);
  assert.equal(withScene, without);
});

test("rules 1.1.0: no scene photography data -> same overall as 1.0.0", () => {
  assert.equal(
    computeOverallScore(baseCategories, CSI_ENVIRONMENT_SCORING_RULES_V1_1.categoryWeights),
    computeOverallScore(baseCategories, CSI_ENVIRONMENT_SCORING_RULES_V1.categoryWeights),
  );
});

test("rules 1.1.0: scene photography is weight 1 of 13", () => {
  const v1 = computeOverallScore(baseCategories, CSI_ENVIRONMENT_SCORING_RULES_V1.categoryWeights)!;
  const v11 = computeOverallScore({ ...baseCategories, scenePhotography: 1 }, CSI_ENVIRONMENT_SCORING_RULES_V1_1.categoryWeights)!;
  assert.ok(Math.abs(v11 - (v1 * 12 + 1) / 13) < 1e-4);
});
