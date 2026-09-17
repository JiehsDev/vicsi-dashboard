// src/lib/scoring/conclusionScorer.ts
import "server-only";
import type { GroundTruth, ScoringSessionContext } from "./types.ts";

/** NEW category — binary by design: the scenario's narrative has exactly
 *  one intended resolution (see GroundTruth.conclusion, sourced from the
 *  highest-priority non-premature ending in
 *  Assets/_Project/Data/Ending/Endings_CSI_Environment.asset). 1.0 only when
 *  BOTH the selected conclusion and the resolved ending match the ground
 *  truth exactly - a resolvedEndingId can diverge from selectedConclusionId
 *  (e.g. an insufficient-evidence ending for the right conclusion), and that
 *  divergence is itself meaningful, not something this check should paper
 *  over by checking only one field. */
export function scoreConclusion(context: ScoringSessionContext, groundTruth: GroundTruth): number {
  const matchesConclusion = context.selectedConclusionId === groundTruth.conclusion.correctConclusionId;
  const matchesEnding = context.resolvedEndingId === groundTruth.conclusion.correctEndingId;
  return matchesConclusion && matchesEnding ? 1 : 0;
}
