// src/lib/scoring/__tests__/perEvidenceMeasurement.test.ts
//
// Scoring rules 1.4.0: each item is scored against its OWN two fixed references
// (perpendicular distances to nearby walls / built-in counter faces). Same
// categories, weights and measurement formula as 1.3.0 - only the answer key moved.

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSessionScoring } from "../registry.ts";
import { scoreMeasurement } from "../measurementScorer.ts";
import type { ScoringSessionEvent } from "../types.ts";

const SCENARIO = "CSI-ENVIRONMENT-001";
const rules14 = () => resolveSessionScoring(SCENARIO, "1.1.0", "1.4.0").scoringRules!;
const rules13 = () => resolveSessionScoring(SCENARIO, "1.1.0", "1.3.0").scoringRules!;

// [evidenceId, ref1, dist1, ref2, dist2] - baked in Unity (Measurements_CSI_Environment.asset).
const KEY: Record<string, [string, string, number, string, number]> = {
  "MEAS-BODY-A": ["BODY-A", "REF-BODYA-1", 2.449, "REF-BODYA-2", 1.131],
  "MEAS-EVD-014": ["EVD-014", "REF-KNIFE-1", 1.341, "REF-KNIFE-2", 1.663],
  "MEAS-EVD-015": ["EVD-015", "REF-SPATTER-1", 1.966, "REF-SPATTER-2", 1.042],
  "MEAS-EVD-018": ["EVD-018", "REF-BOTTLE-1", 0.353, "REF-BOTTLE-2", 0.405],
};

let seq = 0;
function taken(reqId: string, referenceId: string, distance: number, late = false): ScoringSessionEvent {
  seq++;
  const evidenceId = KEY[reqId]?.[0] ?? "UNKNOWN";
  return {
    sequenceNumber: seq,
    timestampMs: seq * 1000,
    eventType: "MeasurementTaken",
    targetId: evidenceId,
    payload: [
      { key: "requirementId", value: reqId },
      { key: "evidenceId", value: evidenceId },
      { key: "referenceId", value: referenceId },
      { key: "measuredDistance", value: distance.toFixed(3) },
      { key: "afterDisturbance", value: late ? "True" : "False" },
    ],
  };
}
const both = (reqId: string) => {
  const [, r1, d1, r2, d2] = KEY[reqId];
  return [taken(reqId, r1, d1), taken(reqId, r2, d2)];
};
const item = (events: ScoringSessionEvent[], reqId: string) =>
  scoreMeasurement(events, rules14().measurement).items.find((i) => i.requirementId === reqId)!;

test("1.4.0 = 1.3.0 except the measurement answer key (same weights, formula, tolerance)", () => {
  const r14 = rules14();
  const r13 = rules13();
  assert.equal(r14.scoringRulesVersion, "1.4.0");
  assert.deepEqual(r14.categoryWeights, r13.categoryWeights);
  assert.deepEqual(r14.procedural, r13.procedural);
  assert.deepEqual(r14.scenePhotography, r13.scenePhotography);
  assert.deepEqual(r14.procedureOrder, r13.procedureOrder);
  assert.equal(r14.measurement!.completionWeight, r13.measurement!.completionWeight);
  assert.equal(r14.measurement!.accuracyWeight, r13.measurement!.accuracyWeight);
  assert.equal(r14.measurement!.timingWeight, r13.measurement!.timingWeight);
  assert.ok(r14.measurement!.requirements.every((q) => q.tolerance === 0.1));
});

test("1.4.0: every item has its own two references - no reference shared between items", () => {
  const refs = rules14().measurement!.requirements.flatMap((q) => [q.referenceAId, q.referenceBId]);
  assert.equal(new Set(refs).size, 8);
  for (const q of rules14().measurement!.requirements) {
    assert.deepEqual([q.referenceAId, q.referenceBId], [KEY[q.requirementId][1], KEY[q.requirementId][3]]);
  }
});

test("1.3.0 answer key unchanged (shared corners REF-A / REF-B)", () => {
  for (const q of rules13().measurement!.requirements) {
    assert.deepEqual([q.referenceAId, q.referenceBId], ["REF-A", "REF-B"]);
  }
});

test("perfect: each item measured from its own pair -> measurement 1.0", () => {
  const events = Object.keys(KEY).flatMap(both);
  assert.equal(scoreMeasurement(events, rules14().measurement).measurement, 1);
});

for (const reqId of Object.keys(KEY)) {
  test(`${KEY[reqId][0]} completes only with its own pair`, () => {
    assert.equal(item(both(reqId), reqId).score, 1);
  });
}

test("knife measured from the bottle's references (with the knife's correct distances) earns nothing", () => {
  const events = [taken("MEAS-EVD-014", "REF-BOTTLE-1", 1.341), taken("MEAS-EVD-014", "REF-BOTTLE-2", 1.663)];
  const k = item(events, "MEAS-EVD-014");
  assert.deepEqual([k.measuredA, k.measuredB, k.score], [false, false, 0]);
});

test("knife using a spatter reference: refused side counts for nothing; own side still counts", () => {
  const events = [taken("MEAS-EVD-014", "REF-SPATTER-1", 1.341), taken("MEAS-EVD-014", "REF-KNIFE-2", 1.663)];
  const k = item(events, "MEAS-EVD-014");
  assert.deepEqual([k.measuredA, k.measuredB], [false, true]);
  assert.equal(k.score, 0.6); // one reference only: 0.3*0.5 + 0.5*0.5 + 0.2*1
});

test("partial: reference 1 only -> incomplete (0.6)", () => {
  const [, r1, d1] = KEY["MEAS-EVD-015"];
  const s = item([taken("MEAS-EVD-015", r1, d1)], "MEAS-EVD-015");
  assert.deepEqual([s.completion, s.score], [0.5, 0.6]);
});

test("accuracy: 0.10 m tolerance against each item's own expected distances", () => {
  const [, r1, d1, r2, d2] = KEY["MEAS-BODY-A"];
  const edge = item([taken("MEAS-BODY-A", r1, d1 + 0.1), taken("MEAS-BODY-A", r2, d2 - 0.1)], "MEAS-BODY-A");
  assert.equal(edge.accuracy, 1);
  const off = item([taken("MEAS-BODY-A", r1, d1 + 0.15), taken("MEAS-BODY-A", r2, d2)], "MEAS-BODY-A");
  assert.deepEqual([off.withinToleranceA, off.withinToleranceB, off.score], [false, true, 0.75]);
});

test("late: taken after disturbance -> timing 0 (item 0.8)", () => {
  const [, r1, d1, r2, d2] = KEY["MEAS-EVD-018"];
  const s = item([taken("MEAS-EVD-018", r1, d1), taken("MEAS-EVD-018", r2, d2, true)], "MEAS-EVD-018");
  assert.deepEqual([s.timing, s.score], [0, 0.8]);
});

test("old corner-reference events (REF-A/REF-B) do not count under 1.4.0", () => {
  const events = [taken("MEAS-EVD-014", "REF-A", 2.13), taken("MEAS-EVD-014", "REF-B", 8.395)];
  assert.equal(item(events, "MEAS-EVD-014").score, 0);
});
