import type { ResultSummary } from "@/lib/results";
import { assessedScore, formatPoints } from "@/lib/assessmentPresentation";

export function ResultScoreSummary({result}:{result:ResultSummary}) {
  const modern=result.scoringVersion==="1.7.0";
  const points=assessedScore(result);
  return <div className="min-w-0 text-left sm:text-right">
    <p className="text-xs text-ink-muted">{modern?"Deduction Performance":"Historical verified score"} · {result.scoringVersion??"Original version"}</p>
    <p className="text-lg font-bold text-ink">{formatPoints(points)}{points!==null && (modern?" / 100":"%")}</p>
    {modern && points!==null && <p className="mt-1 text-xs text-ink-muted">Reasoning {formatPoints(result.assessmentComponents?.reasoningCheckpointComponent??null)} / 60 · Relationships {formatPoints(result.assessmentComponents?.deductionRelationshipComponent??null)} / 25 · Conclusion {formatPoints(result.assessmentComponents?.finalConclusionComponent??null)} / 15</p>}
    {modern && <p className="mt-1 text-xs text-ink-muted">Training Completion (non-scored): {result.trainingCompletion??"Not recorded"}</p>}
  </div>;
}
