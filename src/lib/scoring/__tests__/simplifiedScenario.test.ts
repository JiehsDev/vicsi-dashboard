// src/lib/scoring/__tests__/simplifiedScenario.test.ts
//
// Ground truth 1.1.0 (single-path scenario: phone and gloves retired) vs the
// historical 1.0.0 answer key, which must keep scoring old sessions unchanged.

import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreEvidence } from "../evidenceScorer.ts";
import { scoreConclusion } from "../conclusionScorer.ts";
import { resolveGroundTruth } from "../registry.ts";
import type { ScoringSessionEvent } from "../types.ts";

const v1 = resolveGroundTruth("CSI-ENVIRONMENT-001", "1.0.0")!;
const v11 = resolveGroundTruth("CSI-ENVIRONMENT-001", "1.1.0")!;

let seq = 0;
function marked(evidenceId: string): ScoringSessionEvent {
  seq++;
  return { sequenceNumber: seq, timestampMs: seq * 100, eventType: "EvidenceStatusChanged", targetId: evidenceId, payload: [{ key: "status", value: "Marked" }] };
}

test("both versions resolve (historical sessions stay readable)", () => {
  assert.ok(v1);
  assert.ok(v11);
  assert.equal(v11.groundTruthVersion, "1.1.0");
});

test("1.1.0 roster excludes the phone and gloves; 1.0.0 is untouched", () => {
  const ids11 = v11.evidence.map((e) => e.evidenceId);
  assert.deepEqual(ids11, ["EVD-014", "EVD-015", "EVD-018"]);
  assert.ok(v1.evidence.some((e) => e.evidenceId === "EVD-019"));
  assert.ok(v1.evidence.some((e) => e.evidenceId === "EVD-017"));
  assert.ok(!v11.evidenceReportLines.some((r) => r.evidenceId === "EVD-017" || r.evidenceId === "EVD-019"));
});

test("1.1.0 removes the phone/gloves HYP-03 options and wife relationships", () => {
  const hyp03 = v11.hypothesisCheckpoints.find((h) => h.id === "HYP-03")!;
  assert.ok(!hyp03.reasoningOptions.some((o) => o.id === "hyp03-phone-overclaim" || o.id === "hyp03-gloves-wife-match"));
  assert.deepEqual(
    v11.relationships.map((r) => r.relationshipId).sort(),
    ["REL-bottle-supports-brother", "REL-knife-consistent-wound", "REL-spatter-consistent-reconstruction"],
  );
  assert.equal(v11.conclusion.correctConclusionId, "conclusion-brother");
});

test("1.1.0 HYP-02 and HYP-03 each have exactly one correct reasoning option", () => {
  for (const id of ["HYP-02", "HYP-03"]) {
    const cp = v11.hypothesisCheckpoints.find((h) => h.id === id)!;
    assert.equal(cp.reasoningOptions.filter((o) => o.isCorrect).length, 1, id);
  }
  const hyp02 = v11.hypothesisCheckpoints.find((h) => h.id === "HYP-02")!;
  assert.equal(hyp02.reasoningOptions.find((o) => o.isCorrect)!.id, "hyp02-print-needs-reconstruction");
  const hyp03 = v11.hypothesisCheckpoints.find((h) => h.id === "HYP-03")!;
  assert.equal(hyp03.reasoningOptions.find((o) => o.isCorrect)!.id, "hyp03-combined-physical-evidence");
});

test("1.1.0 treats the bottle as supporting context, not a distractor; 1.0.0 unchanged", () => {
  assert.equal(v11.evidence.find((e) => e.evidenceId === "EVD-018")!.relevance, "Relevant");
  assert.equal(v1.evidence.find((e) => e.evidenceId === "EVD-018")!.relevance, "Distractor");
  // No distractors left in 1.1.0 -> fall-rate is undefined (excluded), never a fabricated 0.
  assert.equal(scoreEvidence([marked("EVD-018")], v11).distractorFallRate, undefined);
});

test("1.1.0: the brother conclusion + ending is the supported outcome", () => {
  const ctx = (c: string | null, e: string | null) => ({ sessionId: "s", scenarioId: "CSI-ENVIRONMENT-001", selectedConclusionId: c, resolvedEndingId: e });
  assert.equal(scoreConclusion(ctx("conclusion-brother", "ending-brother-accused"), v11), 1);
  assert.equal(scoreConclusion(ctx("CONCLUSION-INCONCLUSIVE", "ending-inconclusive"), v11), 0);
});

test("removed evidence no longer affects the recall denominator", () => {
  const events = [marked("EVD-014"), marked("EVD-015")];
  const under11 = scoreEvidence(events, v11);
  const under1 = scoreEvidence(events, v1);
  assert.equal(under11.criticalRecall, 1); // knife + spatter are all the critical items now
  assert.ok((under1.criticalRecall ?? 0) < 1); // gloves still critical in the historical key
});

test("a historical session that marked EVD-017/EVD-019 still scores under 1.0.0 without error", () => {
  const events = [marked("EVD-014"), marked("EVD-015"), marked("EVD-017"), marked("EVD-019")];
  const r = scoreEvidence(events, v1);
  assert.equal(r.criticalRecall, 1);
});
