// src/lib/scoring/__tests__/newCategories.test.ts
//
// Ordinary unit tests (not parity — no .NET reference exists for these) for
// the four categories this feature adds beyond the ported EvidenceScorer:
// relationshipAccuracy, proceduralCompliance, finalConclusionAccuracy, and
// overallScore. See each scorer module's own class comment for why no
// parity check applies here.

import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreRelationships } from "../relationshipScorer.ts";
import { scoreProcedural } from "../proceduralScorer.ts";
import { scoreConclusion } from "../conclusionScorer.ts";
import { computeOverallScore } from "../overallScore.ts";
import { CSI_ENVIRONMENT_GROUND_TRUTH_V1, CSI_ENVIRONMENT_SCORING_RULES_V1 } from "../data/csiEnvironment.v1.ts";

test("relationshipScorer: all 7 completed -> accuracy 1.0", () => {
  const sessionRelationships = CSI_ENVIRONMENT_GROUND_TRUTH_V1.relationships.map((r) => ({
    relationshipId: r.relationshipId,
    state: "Completed",
    wasEverSelected: true,
  }));
  const result = scoreRelationships(sessionRelationships, CSI_ENVIRONMENT_GROUND_TRUTH_V1);
  assert.equal(result.relationshipAccuracy, 1);
  assert.equal(result.relationshipsCompleted, 7);
  assert.equal(result.relationshipsTotal, 7);
});

test("relationshipScorer: none completed -> accuracy 0.0, not undefined", () => {
  const result = scoreRelationships([], CSI_ENVIRONMENT_GROUND_TRUTH_V1);
  assert.equal(result.relationshipAccuracy, 0);
});

test("relationshipScorer: 'Available' (not 'Completed') does not count", () => {
  const sessionRelationships = [{ relationshipId: "REL-knife-consistent-wound", state: "Available", wasEverSelected: true }];
  const result = scoreRelationships(sessionRelationships, CSI_ENVIRONMENT_GROUND_TRUTH_V1);
  assert.equal(result.relationshipsCompleted, 0);
});

test("proceduralScorer: zero violations -> compliance 1.0", () => {
  const result = scoreProcedural([], CSI_ENVIRONMENT_SCORING_RULES_V1.procedural);
  assert.equal(result.proceduralCompliance, 1);
  assert.equal(result.weightedProceduralViolations, 0);
});

test("proceduralScorer: violations at exactly the budget -> compliance floors at 0", () => {
  const violations = Array.from({ length: 10 }, () => ({ eventType: "NonEvidenceMarked" })); // weight 1 each, budget 10
  const result = scoreProcedural(violations, CSI_ENVIRONMENT_SCORING_RULES_V1.procedural);
  assert.equal(result.proceduralCompliance, 0);
});

test("proceduralScorer: violations beyond the budget never go negative", () => {
  const violations = Array.from({ length: 50 }, () => ({ eventType: "NonEvidenceMarked" }));
  const result = scoreProcedural(violations, CSI_ENVIRONMENT_SCORING_RULES_V1.procedural);
  assert.equal(result.proceduralCompliance, 0);
});

test("proceduralScorer: unweighted event types contribute nothing", () => {
  const result = scoreProcedural([{ eventType: "SomeUnrelatedEventType" }], CSI_ENVIRONMENT_SCORING_RULES_V1.procedural);
  assert.equal(result.proceduralCompliance, 1);
});

test("conclusionScorer: correct conclusion AND ending -> 1", () => {
  const score = scoreConclusion(
    { sessionId: "s1", scenarioId: "CSI-ENVIRONMENT-001", selectedConclusionId: "conclusion-wife", resolvedEndingId: "ending-wife-convicted" },
    CSI_ENVIRONMENT_GROUND_TRUTH_V1,
  );
  assert.equal(score, 1);
});

test("conclusionScorer: wrong conclusion -> 0", () => {
  const score = scoreConclusion(
    { sessionId: "s1", scenarioId: "CSI-ENVIRONMENT-001", selectedConclusionId: "conclusion-brother", resolvedEndingId: "ending-brother-accused" },
    CSI_ENVIRONMENT_GROUND_TRUTH_V1,
  );
  assert.equal(score, 0);
});

test("conclusionScorer: right conclusion but wrong/insufficient ending -> 0 (divergence is meaningful)", () => {
  const score = scoreConclusion(
    { sessionId: "s1", scenarioId: "CSI-ENVIRONMENT-001", selectedConclusionId: "conclusion-wife", resolvedEndingId: "ending-wife-suspected-insufficient" },
    CSI_ENVIRONMENT_GROUND_TRUTH_V1,
  );
  assert.equal(score, 0);
});

test("overallScore: a category with undefined value is excluded from both numerator and weight-sum", () => {
  const withoutDistractor = computeOverallScore(
    { criticalRecall: 1, relevantRecall: 1, precision: 1, distractorFallRate: undefined, reasoningAccuracy: 1, documentationAccuracy: 1, relationshipAccuracy: 1, proceduralCompliance: 1, finalConclusionAccuracy: 1 },
    CSI_ENVIRONMENT_SCORING_RULES_V1.categoryWeights,
  );
  assert.equal(withoutDistractor, 1); // every defined category is 1.0, so the weighted average is 1.0 regardless of which weights applied
});

test("overallScore: all categories undefined -> undefined, never 0", () => {
  const result = computeOverallScore({}, CSI_ENVIRONMENT_SCORING_RULES_V1.categoryWeights);
  assert.equal(result, undefined);
});

test("overallScore: a perfect session scores 1.0 exactly", () => {
  const result = computeOverallScore(
    { criticalRecall: 1, relevantRecall: 1, precision: 1, distractorFallRate: 0, reasoningAccuracy: 1, documentationAccuracy: 1, relationshipAccuracy: 1, proceduralCompliance: 1, finalConclusionAccuracy: 1 },
    CSI_ENVIRONMENT_SCORING_RULES_V1.categoryWeights,
  );
  assert.equal(result, 1);
});
