// src/lib/scoring/__tests__/relationalPayload.test.ts
//
// Scene relational measurement (Unity): evidence-to-evidence pair distances are logged
// (EvidencePairMeasured / EvidencePairMeasurementRejected) and a new, unscored Warn step
// ("evidence-distances-before-final-photo") can raise ProcedureOutOfOrder. No scoring
// rules version consumes any of it yet - these events must leave every score unchanged.

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSessionScoring } from "../registry.ts";
import { scoreMeasurement } from "../measurementScorer.ts";
import { scoreProcedureOrder } from "../procedureOrderScorer.ts";
import type { ScoringSessionEvent } from "../types.ts";

const SCENARIO = "CSI-ENVIRONMENT-001";
const rules15 = () => resolveSessionScoring(SCENARIO, "1.1.0", "1.5.0").scoringRules!;

let seq = 0;
function ev(eventType: string, targetId: string | null, payload: Record<string, string>): ScoringSessionEvent {
  seq++;
  return { sequenceNumber: seq, timestampMs: seq * 1000, eventType, targetId, payload: Object.entries(payload).map(([key, value]) => ({ key, value })) };
}

// The fixed-reference answer key of 1.5.0, measured exactly.
function fixedEvents(): ScoringSessionEvent[] {
  return rules15().measurement!.requirements.flatMap((r) => [
    ev("MeasurementTaken", r.evidenceId, { requirementId: r.requirementId, evidenceId: r.evidenceId, referenceId: r.referenceAId, measuredDistance: r.expectedDistanceA.toFixed(3), afterDisturbance: "False" }),
    ev("MeasurementTaken", r.evidenceId, { requirementId: r.requirementId, evidenceId: r.evidenceId, referenceId: r.referenceBId, measuredDistance: r.expectedDistanceB.toFixed(3), afterDisturbance: "False" }),
  ]);
}

// Exactly what MeasurementStateManager.Pairs logs, plus the new Warn step.
function relationalEvents(): ScoringSessionEvent[] {
  const pair = (a: string, b: string, d: string, late = "False") =>
    ev("EvidencePairMeasured", `${a}|${b}`, { pairKey: `${a}|${b}`, evidenceA: a, evidenceB: b, measuredDistance: d, expectedDistance: d, tolerance: "0.100", withinTolerance: "True", afterDisturbance: late, order: "1", measuredFrom: b, sessionTimeSeconds: "30.000" });
  return [
    pair("BODY-A", "EVD-014", "1.223"),
    pair("BODY-A", "EVD-015", "0.272", "True"),
    pair("EVD-014", "EVD-018", "2.140"),
    ev("EvidencePairMeasurementRejected", "EVD-014|EVD-014", { pairKey: "EVD-014|EVD-014", evidenceA: "EVD-014", evidenceB: "EVD-014", reason: "SameEvidence", sessionTimeSeconds: "31.000" }),
    ev("ProcedureOutOfOrder", "EVD-015", { procedureId: "evidence-distances-before-final-photo", evidenceId: "EVD-015", expectedPrerequisite: "evidence-distances:EVD-015", sessionTimeSeconds: "40.00" }),
  ];
}

test("pair events and the new Warn step leave the measurement score unchanged", () => {
  const base = scoreMeasurement(fixedEvents(), rules15().measurement);
  const withPairs = scoreMeasurement([...fixedEvents(), ...relationalEvents()], rules15().measurement);
  assert.equal(base.measurement, 1);
  assert.deepEqual(withPairs, base);
});

test("the evidence-distances Warn step is not a countable procedure-order warning", () => {
  const base = scoreProcedureOrder(fixedEvents(), rules15().procedureOrder);
  const withPairs = scoreProcedureOrder([...fixedEvents(), ...relationalEvents()], rules15().procedureOrder);
  assert.equal(withPairs.procedureOrderCompliance, base.procedureOrderCompliance);
  assert.equal(withPairs.procedureOrderCompliance, 1);
  assert.ok(withPairs.warnings.every((w) => !w.counted));
});

test("no scoring rules version knows the pair events (not scored yet)", () => {
  for (const v of ["1.0.0", "1.1.0", "1.2.0", "1.3.0", "1.4.0", "1.5.0"]) {
    const rules = resolveSessionScoring(SCENARIO, "1.1.0", v).scoringRules!;
    assert.ok(rules, v);
    assert.ok(!JSON.stringify(rules).includes("EvidencePair"), v);
    assert.ok(!JSON.stringify(rules).includes("evidence-distances-before-final-photo"), v);
  }
});
