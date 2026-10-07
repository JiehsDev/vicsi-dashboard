// src/lib/scoring/__tests__/cabinetMeasurementReference.test.ts
//
// Scoring rules 1.5.0: the knife's and the blood pattern's unreachable "North Wall"
// references (behind the built-in north cabinet run) are replaced by the front edge
// of that cabinet run. Everything else - categories, weights, formula, tolerance and
// the other six references - is exactly 1.4.0.

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSessionScoring } from "../registry.ts";
import { scoreMeasurement } from "../measurementScorer.ts";
import type { ScoringSessionEvent } from "../types.ts";

const SCENARIO = "CSI-ENVIRONMENT-001";
const rules15 = () => resolveSessionScoring(SCENARIO, "1.1.0", "1.5.0").scoringRules!;
const rules14 = () => resolveSessionScoring(SCENARIO, "1.1.0", "1.4.0").scoringRules!;

// [evidenceId, ref1, dist1, ref2, dist2] - baked in Unity (Measurements_CSI_Environment.asset).
const KEY: Record<string, [string, string, number, string, number]> = {
  "MEAS-BODY-A": ["BODY-A", "REF-BODYA-1", 2.449, "REF-BODYA-2", 1.131],
  "MEAS-EVD-014": ["EVD-014", "REF-KNIFE-1", 1.341, "REF-KNIFE-CAB", 1.079],
  "MEAS-EVD-015": ["EVD-015", "REF-SPATTER-CAB", 1.382, "REF-SPATTER-2", 1.042],
  "MEAS-EVD-018": ["EVD-018", "REF-BOTTLE-1", 0.353, "REF-BOTTLE-2", 0.405],
};

let seq = 0;
function taken(reqId: string, referenceId: string, distance: number): ScoringSessionEvent {
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
      { key: "afterDisturbance", value: "False" },
    ],
  };
}
const both = (reqId: string) => {
  const [, r1, d1, r2, d2] = KEY[reqId];
  return [taken(reqId, r1, d1), taken(reqId, r2, d2)];
};
const item = (events: ScoringSessionEvent[], reqId: string, rules = rules15()) =>
  scoreMeasurement(events, rules.measurement).items.find((i) => i.requirementId === reqId)!;

test("1.5.0 = 1.4.0 except the knife and spatter cabinet references (same weights, formula, tolerance)", () => {
  const r15 = rules15();
  const r14 = rules14();
  assert.equal(r15.scoringRulesVersion, "1.5.0");
  assert.deepEqual(r15.categoryWeights, r14.categoryWeights);
  assert.deepEqual(r15.procedural, r14.procedural);
  assert.deepEqual(r15.scenePhotography, r14.scenePhotography);
  assert.deepEqual(r15.procedureOrder, r14.procedureOrder);
  const { requirements: q15, ...rest15 } = r15.measurement!;
  const { requirements: q14, ...rest14 } = r14.measurement!;
  assert.deepEqual(rest15, rest14);
  assert.ok(q15.every((q) => q.tolerance === 0.1));
  const changed = q15.filter((q, i) => JSON.stringify(q) !== JSON.stringify(q14[i])).map((q) => q.requirementId);
  assert.deepEqual(changed, ["MEAS-EVD-014", "MEAS-EVD-015"]);
});

test("1.5.0 answer key matches the Unity bake; still 8 distinct references", () => {
  const reqs = rules15().measurement!.requirements;
  for (const q of reqs) {
    const [, r1, d1, r2, d2] = KEY[q.requirementId];
    assert.deepEqual([q.referenceAId, q.expectedDistanceA, q.referenceBId, q.expectedDistanceB], [r1, d1, r2, d2]);
  }
  assert.equal(new Set(reqs.flatMap((q) => [q.referenceAId, q.referenceBId])).size, 8);
});

test("1.4.0 answer key untouched (North Wall references and distances)", () => {
  const q = Object.fromEntries(rules14().measurement!.requirements.map((r) => [r.requirementId, r]));
  assert.deepEqual([q["MEAS-EVD-014"].referenceBId, q["MEAS-EVD-014"].expectedDistanceB], ["REF-KNIFE-2", 1.663]);
  assert.deepEqual([q["MEAS-EVD-015"].referenceAId, q["MEAS-EVD-015"].expectedDistanceA], ["REF-SPATTER-1", 1.966]);
});

test("perfect: every item from its own pair (cabinet edges included) -> measurement 1.0", () => {
  assert.equal(scoreMeasurement(Object.keys(KEY).flatMap(both), rules15().measurement).measurement, 1);
});

test("knife and spatter complete with the cabinet front edge", () => {
  assert.equal(item(both("MEAS-EVD-014"), "MEAS-EVD-014").score, 1);
  assert.equal(item(both("MEAS-EVD-015"), "MEAS-EVD-015").score, 1);
});

test("old hidden-wall references no longer count under 1.5.0 (only the other side scores)", () => {
  const k = item([taken("MEAS-EVD-014", "REF-KNIFE-1", 1.341), taken("MEAS-EVD-014", "REF-KNIFE-2", 1.663)], "MEAS-EVD-014");
  assert.deepEqual([k.measuredA, k.measuredB, k.score], [true, false, 0.6]);
  const s = item([taken("MEAS-EVD-015", "REF-SPATTER-1", 1.966), taken("MEAS-EVD-015", "REF-SPATTER-2", 1.042)], "MEAS-EVD-015");
  assert.deepEqual([s.measuredA, s.measuredB, s.score], [false, true, 0.6]);
});

test("a session stamped 1.4.0 keeps scoring the North Wall references exactly as before", () => {
  const k = item([taken("MEAS-EVD-014", "REF-KNIFE-1", 1.341), taken("MEAS-EVD-014", "REF-KNIFE-2", 1.663)], "MEAS-EVD-014", rules14());
  assert.equal(k.score, 1);
});

test("cabinet references are evidence-specific: the knife's edge does not count for the spatter", () => {
  const s = item([taken("MEAS-EVD-015", "REF-KNIFE-CAB", 1.382), taken("MEAS-EVD-015", "REF-SPATTER-2", 1.042)], "MEAS-EVD-015");
  assert.deepEqual([s.measuredA, s.measuredB], [false, true]);
});

test("partial: cabinet edge only -> incomplete (0.6)", () => {
  assert.equal(item([taken("MEAS-EVD-014", "REF-KNIFE-CAB", 1.079)], "MEAS-EVD-014").score, 0.6);
});

test("accuracy: 0.10 m tolerance against the new cabinet distances", () => {
  const edge = item([taken("MEAS-EVD-015", "REF-SPATTER-CAB", 1.382 + 0.1), taken("MEAS-EVD-015", "REF-SPATTER-2", 1.042)], "MEAS-EVD-015");
  assert.equal(edge.accuracy, 1);
  // The old wall distance measured against the new reference is far outside tolerance.
  const old = item([taken("MEAS-EVD-015", "REF-SPATTER-CAB", 1.966), taken("MEAS-EVD-015", "REF-SPATTER-2", 1.042)], "MEAS-EVD-015");
  assert.deepEqual([old.withinToleranceA, old.withinToleranceB, old.score], [false, true, 0.75]);
});
