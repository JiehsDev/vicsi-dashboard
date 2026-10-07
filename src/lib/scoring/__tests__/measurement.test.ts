// src/lib/scoring/__tests__/measurement.test.ts
//
// Measurement assessment (scoring rules 1.2.0): per item 0.3 completion +
// 0.5 accuracy + 0.2 timing, equal-weight mean over the four required items,
// scored from MeasurementTaken events against the server's own expected
// distances. Same formula as Unity's MeasurementScoring (display only).

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSessionScoring } from "../registry.ts";
import { scoreMeasurement } from "../measurementScorer.ts";
import { computeOverallScore } from "../overallScore.ts";
import type { ScoreCategories, ScoringSessionEvent } from "../types.ts";

const SCENARIO = "CSI-ENVIRONMENT-001";
const rules12 = () => resolveSessionScoring(SCENARIO, "1.1.0", "1.2.0").scoringRules!;
const rules11 = () => resolveSessionScoring(SCENARIO, "1.1.0", "1.1.0").scoringRules!;

// Expected distances (REF-A, REF-B) - Measurements_CSI_Environment.asset.
const EXPECTED: Record<string, [string, number, number]> = {
  "MEAS-BODY-A": ["BODY-A", 3.271, 7.447],
  "MEAS-EVD-014": ["EVD-014", 2.13, 8.395],
  "MEAS-EVD-015": ["EVD-015", 3.006, 7.544],
  "MEAS-EVD-018": ["EVD-018", 4.592, 7.467],
};

let seq = 0;
function ev(eventType: string, targetId: string | null, payload: Record<string, string>): ScoringSessionEvent {
  seq++;
  return { sequenceNumber: seq, timestampMs: seq * 1000, eventType, targetId, payload: Object.entries(payload).map(([key, value]) => ({ key, value })) };
}

/** One MeasurementTaken as MeasurementStateManager logs it. `clientWithin` is
 *  what the client claims - the server must ignore it. */
function taken(reqId: string, ref: "REF-A" | "REF-B", offset = 0, late = false, clientWithin = "True"): ScoringSessionEvent {
  const [evidenceId, a, b] = EXPECTED[reqId];
  const expected = ref === "REF-A" ? a : b;
  return ev("MeasurementTaken", evidenceId, {
    requirementId: reqId,
    evidenceId,
    sessionTimeSeconds: "12.000",
    referenceId: ref,
    measuredDistance: (expected + offset).toFixed(3),
    expectedDistance: expected.toFixed(3),
    error: offset.toFixed(3),
    tolerance: "0.100",
    withinTolerance: clientWithin,
    afterDisturbance: late ? "True" : "False",
  });
}
const both = (reqId: string) => [taken(reqId, "REF-A"), taken(reqId, "REF-B")];
const ALL = Object.keys(EXPECTED);

test("rules 1.2.0 resolve with measurement weighted 1 and all four requirements; 1.1.0 untouched", () => {
  const r = rules12();
  assert.equal(r.scoringRulesVersion, "1.2.0");
  assert.equal(r.categoryWeights.measurement, 1);
  assert.equal(r.categoryWeights.scenePhotography, 1);
  assert.deepEqual(r.measurement?.requirements.map((q) => q.requirementId), ALL);
  assert.ok(r.measurement?.requirements.every((q) => q.tolerance === 0.1));
  assert.equal(rules11().categoryWeights.measurement ?? 0, 0);
  assert.equal(rules11().measurement, undefined);
  // every pre-existing weight is identical to 1.1.0
  const { measurement: _m, ...w12 } = r.categoryWeights;
  assert.deepEqual(w12, rules11().categoryWeights);
});

test("perfect: every item measured from both references, in tolerance, before disturbance -> 1", () => {
  const r = scoreMeasurement(ALL.flatMap(both), rules12().measurement);
  assert.equal(r.measurement, 1);
  assert.equal(r.measurementCompletion, 1);
  assert.equal(r.measurementAccuracy, 1);
  assert.equal(r.measurementTiming, 1);
  assert.ok(r.items.every((i) => i.score === 1));
});

test("missing one reference: completion 0.5, accuracy 0.5, timing 1 -> item 0.6", () => {
  const r = scoreMeasurement([taken("MEAS-EVD-014", "REF-A")], rules12().measurement);
  const item = r.items.find((i) => i.requirementId === "MEAS-EVD-014")!;
  assert.deepEqual([item.completion, item.accuracy, item.timing, item.score], [0.5, 0.5, 1, 0.6]);
});

test("outside tolerance: B off by 0.15 m -> accuracy 0.5 -> item 0.75; exactly 0.100 m still passes", () => {
  const r = scoreMeasurement([taken("MEAS-EVD-015", "REF-A", 0.1), taken("MEAS-EVD-015", "REF-B", -0.15)], rules12().measurement);
  const item = r.items.find((i) => i.requirementId === "MEAS-EVD-015")!;
  assert.equal(item.withinToleranceA, true);
  assert.equal(item.withinToleranceB, false);
  assert.deepEqual([item.completion, item.accuracy, item.timing, item.score], [1, 0.5, 1, 0.75]);
});

test("late: both sides accurate but taken after disturbance -> timing 0 -> item 0.8", () => {
  const r = scoreMeasurement([taken("MEAS-EVD-018", "REF-A"), taken("MEAS-EVD-018", "REF-B", 0, true)], rules12().measurement);
  const item = r.items.find((i) => i.requirementId === "MEAS-EVD-018")!;
  assert.equal(item.late, true);
  assert.deepEqual([item.completion, item.accuracy, item.timing, item.score], [1, 1, 0, 0.8]);
});

test("mixed: one perfect, one incomplete, one inaccurate, one late -> exactly 0.7875", () => {
  const events = [
    ...both("MEAS-BODY-A"), // 1.0
    taken("MEAS-EVD-014", "REF-A"), // 0.3*0.5 + 0.5*0.5 + 0.2*1 = 0.6
    taken("MEAS-EVD-015", "REF-A"),
    taken("MEAS-EVD-015", "REF-B", 0.25), // 0.3 + 0.25 + 0.2 = 0.75
    taken("MEAS-EVD-018", "REF-A", 0, true),
    taken("MEAS-EVD-018", "REF-B", 0, true), // 0.3 + 0.5 + 0 = 0.8
  ];
  const r = scoreMeasurement(events, rules12().measurement);
  assert.deepEqual(r.items.map((i) => i.score), [1, 0.6, 0.75, 0.8]);
  assert.equal(r.measurementCompletion, 0.875); // (1 + 0.5 + 1 + 1) / 4
  assert.equal(r.measurementAccuracy, 0.75); // (1 + 0.5 + 0.5 + 1) / 4
  assert.equal(r.measurementTiming, 0.75); // (1 + 1 + 1 + 0) / 4
  assert.equal(r.measurement, 0.7875); // (1 + 0.6 + 0.75 + 0.8) / 4
});

test("server ignores the client's withinTolerance claim and uses its own expected distances", () => {
  const r = scoreMeasurement([taken("MEAS-BODY-A", "REF-A", 0.5, false, "True"), taken("MEAS-BODY-A", "REF-B")], rules12().measurement);
  assert.equal(r.items[0].withinToleranceA, false);
  assert.equal(r.items[0].score, 0.75);
});

test("re-measuring a side replaces it: out of tolerance, then corrected -> accurate", () => {
  const r = scoreMeasurement(
    [taken("MEAS-BODY-A", "REF-A", 0.4, false, "False"), taken("MEAS-BODY-A", "REF-A"), taken("MEAS-BODY-A", "REF-B")],
    rules12().measurement,
  );
  assert.equal(r.items[0].score, 1);
});

test("unknown requirement / wrong reference / non-measurement events (incl. ProcedureOutOfOrder) are ignored", () => {
  const events = [
    ev("MeasurementTaken", "EVD-999", { requirementId: "MEAS-EVD-999", referenceId: "REF-A", measuredDistance: "1.000", afterDisturbance: "False" }),
    ev("MeasurementTaken", "BODY-A", { requirementId: "MEAS-BODY-A", referenceId: "REF-Z", measuredDistance: "3.271", afterDisturbance: "False" }),
    ev("ProcedureOutOfOrder", "BODY-A", { stepId: "final-evidence-photograph" }),
    ev("MeasurementOutOfTolerance", "BODY-A", { requirementId: "MEAS-BODY-A", referenceId: "REF-A", measuredDistance: "9.000" }),
  ];
  const r = scoreMeasurement(events, rules12().measurement);
  assert.equal(r.measurement, 0);
});

test("1.2.0 session that measured nothing -> 0 (four required items, none measured)", () => {
  const r = scoreMeasurement([], rules12().measurement);
  assert.equal(r.measurement, 0);
  assert.equal(r.items.length, 4);
});

test("no measurement section under 1.1.0 / 1.0.0 -> undefined, whatever events exist", () => {
  assert.equal(scoreMeasurement(ALL.flatMap(both), rules11().measurement).measurement, undefined);
  assert.equal(scoreMeasurement([], resolveSessionScoring(SCENARIO, "1.0.0", "1.0.0").scoringRules!.measurement).measurement, undefined);
});

// ---- overall score: same session, 1.1.0 vs 1.2.0 --------------------------

const session: ScoreCategories = {
  criticalRecall: 1,
  relevantRecall: 1,
  precision: 1,
  reasoningAccuracy: 2 / 3,
  documentationAccuracy: 0.75,
  relationshipAccuracy: 1,
  proceduralCompliance: 0.9,
  finalConclusionAccuracy: 1,
  scenePhotography: 0.5,
  measurement: 0.7875,
};

test("overall: 1.1.0 ignores measurement; 1.2.0 adds it with weight 1 (1/14 nominal, 1/13 with no distractors)", () => {
  const v11 = computeOverallScore(session, rules11().categoryWeights)!;
  const v12 = computeOverallScore(session, rules12().categoryWeights)!;
  const { measurement: _ignored, ...withoutMeasurement } = session;
  assert.equal(v11, computeOverallScore(withoutMeasurement, rules11().categoryWeights));
  // distractorFallRate undefined under GT 1.1.0 -> its weight 1 drops out of the denominator.
  const otherWeight = 2 + 1 + 1 + 1.5 + 1 + 1.5 + 1 + 2 + 1; // incl. scene photography
  const weightedOthers = 2 + 1 + 1 + (2 / 3) * 1.5 + 0.75 + 1.5 + 0.9 + 2 + 0.5;
  assert.equal(v11, Math.round((weightedOthers / otherWeight) * 10000) / 10000);
  assert.equal(v12, Math.round(((weightedOthers + 0.7875) / (otherWeight + 1)) * 10000) / 10000);
  // Nominal 1.2.0 weight total: 12 (1.0.0) + 1 scene + 1 measurement.
  const w = rules12().categoryWeights;
  const total = Object.values(w).reduce((s, x) => s + (x ?? 0), 0);
  assert.equal(total, 14);
});
