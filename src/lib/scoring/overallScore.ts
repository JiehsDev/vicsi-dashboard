// src/lib/scoring/overallScore.ts
import "server-only";
import type { CategoryWeights, ScoreCategories } from "./types.ts";

/** Combines every DEFINED category into one weighted 0-1 overall score.
 *
 *  This is NOT a validated pedagogical grading formula - it is exactly what
 *  this feature asked for: an explicit, versioned, instructor-editable
 *  weighting (see ScoringRules.categoryWeights), never a hidden or invented
 *  "the" formula. The .NET reference tool deliberately refuses to produce
 *  a single number at all ("turning these numbers into a grade is a faculty
 *  decision this tool has no business pre-empting") - collapsing categories
 *  into one score is new behavior this feature explicitly requested, done
 *  here as transparently and reversibly as possible: change the weights in
 *  a new ScoringRules version, nothing here needs to change.
 *
 *  Categories with an undefined value (a scenario with no Distractor items,
 *  say) are excluded from BOTH the numerator and the weight-sum denominator
 *  - never treated as 0, which would silently penalize a session for a
 *  category the scenario itself cannot produce. distractorFallRate is
 *  inverted (1 - fallRate) before weighting, since a LOWER fall-rate is
 *  better, unlike every other category here. */
export function computeOverallScore(categories: ScoreCategories, weights: CategoryWeights): number | undefined {
  const contributions: Array<[number | undefined, number]> = [
    [categories.criticalRecall, weights.criticalRecall],
    [categories.relevantRecall, weights.relevantRecall],
    [categories.precision, weights.precision],
    [categories.distractorFallRate === undefined ? undefined : 1 - categories.distractorFallRate, weights.distractorFallRate],
    [categories.reasoningAccuracy, weights.reasoningAccuracy],
    [categories.documentationAccuracy, weights.documentationAccuracy],
    [categories.relationshipAccuracy, weights.relationshipAccuracy],
    [categories.proceduralCompliance, weights.proceduralCompliance],
    [categories.finalConclusionAccuracy, weights.finalConclusionAccuracy],
  ];

  let weightedSum = 0;
  let weightTotal = 0;
  for (const [value, weight] of contributions) {
    if (value === undefined || weight <= 0) continue;
    weightedSum += value * weight;
    weightTotal += weight;
  }

  if (weightTotal === 0) return undefined;
  return Math.round((weightedSum / weightTotal) * 10000) / 10000;
}
