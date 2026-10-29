import type { ResultSummary } from "./results.ts";
import { assessedScore } from "./assessmentPresentation.ts";

/** Additive export columns keep historical verifiedScore's original 0-1 units. */
export function deductionExportColumns(result:ResultSummary) {
  const modern=result.scoringVersion==="1.7.0";
  const deductionScore=modern?assessedScore(result):null;
  return {
    scoringVersion:result.scoringVersion??null,
    groundTruthVersion:result.groundTruthVersion??null,
    deductionScore,
    reasoningCheckpointPoints:deductionScore!==null?result.assessmentComponents?.reasoningCheckpointComponent??null:null,
    evidenceRelationshipPoints:deductionScore!==null?result.assessmentComponents?.deductionRelationshipComponent??null:null,
    finalConclusionPoints:deductionScore!==null?result.assessmentComponents?.finalConclusionComponent??null:null,
    trainingCompletion:modern?result.trainingCompletion??"Not recorded":null,
  };
}
