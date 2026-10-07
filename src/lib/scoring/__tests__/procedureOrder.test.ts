// src/lib/scoring/__tests__/procedureOrder.test.ts
//
// Procedure order compliance (scoring rules 1.3.0): 1 - 0.1 per unique
// countable ProcedureOutOfOrder warning, floor 0, never re-penalizing a
// mistake Scene Photography or Measurement already scores.

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSessionScoring } from "../registry.ts";
import { scoreProcedureOrder } from "../procedureOrderScorer.ts";
import { scoreMeasurement } from "../measurementScorer.ts";
import { scoreScenePhotography } from "../scenePhotographyScorer.ts";
import { computeOverallScore } from "../overallScore.ts";
import type { ScoreCategories, ScoringSessionEvent } from "../types.ts";

const SCENARIO = "CSI-ENVIRONMENT-001";
const rules13 = () => resolveSessionScoring(SCENARIO, "1.1.0", "1.3.0").scoringRules!;
const rules12 = () => resolveSessionScoring(SCENARIO, "1.1.0", "1.2.0").scoringRules!;

let seq = 0;
function ev(eventType: string, targetId: string | null, payload: Record<string, string>, timestampMs = (seq + 1) * 1000): ScoringSessionEvent {
  seq++;
  return { sequenceNumber: seq, timestampMs, eventType, targetId, payload: Object.entries(payload).map(([key, value]) => ({ key, value })) };
}

/** ProcedureOutOfOrder exactly as ProcedureLog.LogOutOfOrder writes it. */
function outOfOrder(procedureId: string, evidenceId: string, timestampMs?: number): ScoringSessionEvent {
  const prerequisite = procedureId === "final-evidence-photograph" ? `measurement:MEAS-${evidenceId}` : "scene-photography";
  return ev("ProcedureOutOfOrder", evidenceId, { procedureId, evidenceId, expectedPrerequisite: prerequisite, sessionTimeSeconds: "10.00" }, timestampMs);
}
const earlyPhoto = (id: string, t?: number) => outOfOrder("scene-photos-before-evidence-photo", id, t);
const finalPhotoFirst = (id: string) => outOfOrder("final-evidence-photograph", id);

const EXPECTED: Record<string, [number, number]> = {
  "BODY-A": [3.271, 7.447],
  "EVD-014": [2.13, 8.395],
  "EVD-015": [3.006, 7.544],
  "EVD-018": [4.592, 7.467],
};
function taken(evidenceId: string, ref: "REF-A" | "REF-B", late = false) {
  const [a, b] = EXPECTED[evidenceId];
  return ev("MeasurementTaken", evidenceId, {
    requirementId: `MEAS-${evidenceId}`,
    evidenceId,
    referenceId: ref,
    measuredDistance: (ref === "REF-A" ? a : b).toFixed(3),
    afterDisturbance: late ? "True" : "False",
  });
}
const completed = (evidenceId: string) => ev("MeasurementCompleted", evidenceId, { requirementId: `MEAS-${evidenceId}`, evidenceId });
/** Measured correctly and on time, both sides. */
const measuredOk = (id: string) => [taken(id, "REF-A"), taken(id, "REF-B"), completed(id)];

const score = (events: ScoringSessionEvent[]) => scoreProcedureOrder(events, rules13().procedureOrder);

test("rules 1.3.0: weight 1, 0.1 per warning, allowlist = the two authored Warn rules; 1.2.0 untouched", () => {
  const r = rules13();
  assert.equal(r.scoringRulesVersion, "1.3.0");
  assert.equal(r.categoryWeights.procedureOrderCompliance, 1);
  assert.equal(r.procedureOrder?.penaltyPerWarning, 0.1);
  assert.deepEqual(r.procedureOrder?.countable.map((c) => c.procedureId).sort(), ["final-evidence-photograph", "scene-photos-before-evidence-photo"]);
  const { procedureOrderCompliance: _p, ...w13 } = r.categoryWeights;
  assert.deepEqual(w13, rules12().categoryWeights); // every earlier weight identical
  assert.equal(rules12().procedureOrder, undefined);
  assert.equal(rules12().categoryWeights.procedureOrderCompliance ?? 0, 0);
  assert.equal(Object.values(r.categoryWeights).reduce((s, x) => s + (x ?? 0), 0), 15);
});

test("no warnings -> 100%", () => {
  const r = score([...measuredOk("BODY-A")]);
  assert.equal(r.procedureOrderCompliance, 1);
  assert.equal(r.procedureOrderWarningCount, 0);
});

test("one unique countable warning -> 90%", () => {
  const r = score([earlyPhoto("EVD-018")]);
  assert.equal(r.procedureOrderCompliance, 0.9);
  assert.equal(r.procedureOrderWarningCount, 1);
});

test("the same logical warning repeated -> one penalty", () => {
  const r = score([earlyPhoto("EVD-018"), earlyPhoto("EVD-018"), earlyPhoto("EVD-018")]);
  assert.equal(r.procedureOrderCompliance, 0.9);
  assert.equal(r.warnings.length, 1);
});

test("two different warnings -> 80% (different rule, or same rule on another item)", () => {
  assert.equal(score([earlyPhoto("EVD-018"), earlyPhoto("EVD-014")]).procedureOrderCompliance, 0.8);
  assert.equal(score([earlyPhoto("EVD-018"), ...measuredOk("EVD-018"), finalPhotoFirst("EVD-018")]).procedureOrderCompliance, 0.8);
});

test("many warnings -> floor 0%", () => {
  const ids = ["BODY-A", "EVD-014", "EVD-015", "EVD-018"];
  const events = [
    ...ids.flatMap(measuredOk),
    ...ids.map((id) => earlyPhoto(id)),
    ...ids.map(finalPhotoFirst),
    // a few unknown ids that must not count either
    ...ids.map((id) => outOfOrder("some-future-rule", id)),
  ];
  const r = score(events);
  assert.equal(r.procedureOrderWarningCount, 8);
  assert.equal(r.procedureOrderCompliance, 0.2);
  const tighter = { ...rules13().procedureOrder!, penaltyPerWarning: 0.2 };
  assert.equal(scoreProcedureOrder(events, tighter).procedureOrderCompliance, 0);
});

test("non-allowlisted procedureId never counts", () => {
  const r = score([outOfOrder("obj-test-never-completes-rule", "BODY-A")]);
  assert.equal(r.procedureOrderCompliance, 1);
  assert.equal(r.warnings.length, 0);
});

// ---- double-penalty guards --------------------------------------------------

test("final photo before measuring, measurement NEVER completed -> Measurement penalizes, procedure order does not", () => {
  const events = [finalPhotoFirst("EVD-014"), taken("EVD-014", "REF-A")];
  assert.equal(score(events).procedureOrderCompliance, 1);
  assert.match(score(events).warnings[0].excludedBecause ?? "", /measurement/);
  assert.equal(scoreMeasurement(events, rules13().measurement).items.find((i) => i.evidenceId === "EVD-014")!.score, 0.6);
});

test("late measurement: Measurement timing applies its penalty; no extra procedure order penalty", () => {
  const events = [finalPhotoFirst("EVD-018"), taken("EVD-018", "REF-A", true), taken("EVD-018", "REF-B", true), completed("EVD-018")];
  const item = scoreMeasurement(events, rules13().measurement).items.find((i) => i.evidenceId === "EVD-018")!;
  assert.equal(item.timing, 0);
  assert.equal(item.score, 0.8);
  const r = score(events);
  assert.equal(r.procedureOrderCompliance, 1);
  assert.match(r.warnings[0].excludedBecause ?? "", /timing/);
});

test("final photo first, then measured correctly on time -> Measurement 1.0, procedure order 90% (one penalty, here)", () => {
  const events = [finalPhotoFirst("BODY-A"), ...measuredOk("BODY-A")];
  assert.equal(scoreMeasurement(events, rules13().measurement).items[0].score, 1);
  assert.equal(score(events).procedureOrderCompliance, 0.9);
});

test("early evidence photo on the SAME shutter press as a scene wrong-angle -> Scene Photography owns it", () => {
  const sceneAttempt = ev("ScenePhotoWrongAngle", "p10", { angle: "40.0" }, 50_000);
  const warning = earlyPhoto("EVD-018", 50_004);
  const r = score([sceneAttempt, warning]);
  assert.equal(r.procedureOrderCompliance, 1);
  assert.match(r.warnings[0].excludedBecause ?? "", /scene photography/);
  // and Scene Photography did score that press
  const started = ev("ScenePhotographyStarted", null, { requiredPointCount: "7" });
  const sp = scoreScenePhotography([started, sceneAttempt], rules13().scenePhotography);
  assert.equal(sp.counts.wrongAngleAttempts, 1);
});

test("early evidence photo on a SEPARATE press (no scene event) -> counts", () => {
  const sceneAttempt = ev("ScenePhotoOutOfSequence", "p30", {}, 20_000);
  const r = score([sceneAttempt, earlyPhoto("EVD-018", 50_000)]);
  assert.equal(r.procedureOrderCompliance, 0.9);
});

test("events out of storage order are sorted before the same-press check", () => {
  const sceneAttempt = ev("ScenePhotoWrongAngle", "p10", {}, 50_000);
  const warning = earlyPhoto("EVD-018", 50_002);
  assert.equal(score([warning, sceneAttempt]).procedureOrderCompliance, 1);
});

// ---- historical preservation -----------------------------------------------

test("under 1.2.0 / 1.1.0 / 1.0.0 the category is undefined whatever the events", () => {
  const events = [earlyPhoto("EVD-018"), earlyPhoto("EVD-014")];
  for (const v of ["1.2.0", "1.1.0", "1.0.0"]) {
    const rules = resolveSessionScoring(SCENARIO, v === "1.0.0" ? "1.0.0" : "1.1.0", v).scoringRules!;
    assert.equal(scoreProcedureOrder(events, rules.procedureOrder).procedureOrderCompliance, undefined, v);
  }
});

test("overall: 1.2.0 score unchanged by the new category; 1.3.0 adds it with weight 1", () => {
  const session: ScoreCategories = {
    criticalRecall: 1, relevantRecall: 1, precision: 1, reasoningAccuracy: 2 / 3, documentationAccuracy: 0.75,
    relationshipAccuracy: 1, proceduralCompliance: 0.9, finalConclusionAccuracy: 1,
    scenePhotography: 1, measurement: 1, procedureOrderCompliance: 0.9, procedureOrderWarningCount: 1,
  };
  const { procedureOrderCompliance: _p, procedureOrderWarningCount: _c, ...without } = session;
  const v12 = computeOverallScore(session, rules12().categoryWeights)!;
  assert.equal(v12, computeOverallScore(without, rules12().categoryWeights));
  const otherWeight = 2 + 1 + 1 + 1.5 + 1 + 1.5 + 1 + 2 + 1 + 1; // no distractors under GT 1.1.0
  const weightedOthers = 2 + 1 + 1 + (2 / 3) * 1.5 + 0.75 + 1.5 + 0.9 + 2 + 1 + 1;
  assert.equal(v12, Math.round((weightedOthers / otherWeight) * 10000) / 10000);
  assert.equal(computeOverallScore(session, rules13().categoryWeights), Math.round(((weightedOthers + 0.9) / (otherWeight + 1)) * 10000) / 10000);
});

test("session resolution: 1.3.0 supported; unsupported 1.6.0 still requires review", () => {
  assert.equal(resolveSessionScoring(SCENARIO, "1.1.0", "1.3.0").scoringRules?.scoringRulesVersion, "1.3.0");
  assert.equal(resolveSessionScoring(SCENARIO, "1.1.0", "1.6.0").scoringRules, null);
});
