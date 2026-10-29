import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSessionScoring } from "../registry.ts";
import { scoreEvidence } from "../evidenceScorer.ts";
import { computeOverallScore } from "../overallScore.ts";
import type { ScoringSessionEvent } from "../types.ts";

const config = resolveSessionScoring("CSI-ENVIRONMENT-001", "1.2.0", "1.6.0");
const truth = config.groundTruth!;
const rules = config.scoringRules!;
const event = (eventType: string, targetId: string, values: Record<string,string>): ScoringSessionEvent => ({
  sequenceNumber: 1, timestampMs: 1, eventType, targetId,
  payload: Object.entries(values).map(([key,value]) => ({key,value}))
});
const legacy = event("HypothesisSubmitted", "HYP-02", {
  selectedOptionId: "theory-homicide", reasoningOptionId: "hyp02-print-needs-reconstruction"
});
test("all new 1-4 weights remain outside 1.6.0 evidence and aggregate scores", () => {
  const before = scoreEvidence([legacy],truth,rules);
  for (const weight of [1,2,3,4]) {
    const snapshot = event("ReasoningCheckpointSubmitted", "RC-03-FINGERPRINT", {
      responseId: "RC-03-FINGERPRINT-C", weight: String(weight), maximumWeight: "4",
      reasoningCategory: "LIMITATION_RECOGNITION", responseOrder: "3"
    });
    const after = scoreEvidence([legacy,snapshot],truth,rules);
    assert.deepEqual(after,before);
    assert.equal(computeOverallScore(after,rules.categoryWeights),computeOverallScore(before,rules.categoryWeights));
  }
});
test("checkpoint records alone generate no active reasoning score", () => {
  const result = scoreEvidence([event("ReasoningCheckpointSubmitted","RC-01-PETER",{responseId:"RC-01-PETER-C",weight:"4"})],truth,rules);
  assert.equal(result.reasoningAccuracy,undefined);
});
test("integrated HYP-02 retains legacy justification scoring with new stable first-choice IDs", () => {
  for (const id of ["RC-03-FINGERPRINT-A","RC-03-FINGERPRINT-B","RC-03-FINGERPRINT-C","RC-03-FINGERPRINT-D"]) {
    const integrated = event("HypothesisSubmitted","HYP-02",{selectedOptionId:id,reasoningOptionId:"hyp02-print-needs-reconstruction"});
    assert.deepEqual(scoreEvidence([integrated],truth,rules),scoreEvidence([legacy],truth,rules));
  }
  assert.equal(scoreEvidence([event("HypothesisSubmitted","HYP-02",{selectedOptionId:"RC-03-FINGERPRINT-C",reasoningOptionId:"hyp02-print-proves-attacker"})],truth,rules).reasoningAccuracy,0);
});
test("historical 1.0.0-1.5.0 scoring also ignores the additive checkpoint event", () => {
  for (const version of ["1.0.0","1.1.0","1.2.0","1.3.0","1.4.0","1.5.0"]) {
    const old = resolveSessionScoring("CSI-ENVIRONMENT-001","1.2.0",version);
    assert.deepEqual(scoreEvidence([event("ReasoningCheckpointSubmitted","RC-01-PETER",{weight:"4"})],old.groundTruth!,old.scoringRules!),scoreEvidence([],old.groundTruth!,old.scoringRules!));
  }
});

test("eligible but unanswered checkpoints do not alter score or its denominator", () => {
  const availability = event("ReasoningCheckpointEligible","RC-06-BLOODSTAIN",{
    maximumWeight: "4", reasoningCategory: "EVIDENCE_INTEGRATION", eligibleSeconds: "250.000", contentVersion: "1.0.0"
  });
  assert.deepEqual(scoreEvidence([legacy,availability],truth,rules),scoreEvidence([legacy],truth,rules));
});
