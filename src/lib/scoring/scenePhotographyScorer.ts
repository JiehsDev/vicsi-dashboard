// src/lib/scoring/scenePhotographyScorer.ts
import "server-only";
import { payloadValue, type ScenePhotographyScoringRules, type ScoringSessionEvent } from "./types.ts";

/** Scene (location) photography, scored purely from the session's own
 *  ScenePhoto* events - never from the client's reported percentages. Same
 *  formula as Unity's ScenePhotographyScoring (client display only):
 *
 *    coverage = distinct required points completed / requiredPointCount
 *    sequence = in-order completions / (completions + wrong-order attempts)
 *    accuracy = well-placed / (well-placed + wrong-position + wrong-angle),
 *               well-placed = completions + wrong-order attempts
 *    score    = weighted mean of the three (weights normalized by their sum)
 *
 *  Every component is a bounded ratio, so one stray shutter press costs a
 *  fraction of one component. Undefined (not 0) when the session has no
 *  ScenePhotographyStarted event: an older client or a scenario without a
 *  route must not be scored as "0% scene photography". */

export const DEFAULT_SCENE_PHOTOGRAPHY_RULES: ScenePhotographyScoringRules = {
  coverageWeight: 0.5,
  sequenceWeight: 0.3,
  accuracyWeight: 0.2,
};

export interface ScenePhotographyScoreOutput {
  scenePhotography?: number;
  scenePhotographyCoverage?: number;
  scenePhotographySequence?: number;
  scenePhotographyAccuracy?: number;
  counts: {
    requiredPointCount: number;
    completedRequiredCount: number;
    completedTotalCount: number;
    correctSequenceCount: number;
    wrongOrderAttempts: number;
    wrongPositionAttempts: number;
    wrongAngleAttempts: number;
    totalAttempts: number;
    completionSeconds?: number;
  };
}

const round4 = (v: number) => Math.round(v * 10000) / 10000;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function scoreScenePhotography(
  events: ScoringSessionEvent[],
  rules: ScenePhotographyScoringRules | undefined,
): ScenePhotographyScoreOutput {
  const started = events.find((e) => e.eventType === "ScenePhotographyStarted");
  const requiredPointCount = started ? Number(payloadValue(started, "requiredPointCount") ?? "0") || 0 : 0;

  const completedIds = new Set<string>();
  const completedRequiredIds = new Set<string>();
  const inOrderIds = new Set<string>();
  let wrongOrderAttempts = 0;
  let wrongPositionAttempts = 0;
  let wrongAngleAttempts = 0;
  let completedAt: ScoringSessionEvent | undefined;

  for (const e of events) {
    switch (e.eventType) {
      case "ScenePhotoCompleted": {
        const id = e.targetId ?? "";
        if (!id || completedIds.has(id)) break;
        completedIds.add(id);
        if (payloadValue(e, "required") !== "False") completedRequiredIds.add(id);
        if (payloadValue(e, "inOrder") === "True") inOrderIds.add(id);
        break;
      }
      case "ScenePhotoOutOfSequence":
        wrongOrderAttempts++;
        break;
      case "ScenePhotoWrongPosition":
        wrongPositionAttempts++;
        break;
      case "ScenePhotoWrongAngle":
        wrongAngleAttempts++;
        break;
      case "ScenePhotographyCompleted":
        completedAt ??= e;
        break;
    }
  }

  const completedTotalCount = completedIds.size;
  const completedRequiredCount = completedRequiredIds.size;
  const correctSequenceCount = inOrderIds.size;
  const counts = {
    requiredPointCount,
    completedRequiredCount,
    completedTotalCount,
    correctSequenceCount,
    wrongOrderAttempts,
    wrongPositionAttempts,
    wrongAngleAttempts,
    totalAttempts: completedTotalCount + wrongOrderAttempts + wrongPositionAttempts + wrongAngleAttempts,
    completionSeconds:
      started && completedAt ? Math.round((completedAt.timestampMs - started.timestampMs) / 100) / 10 : undefined,
  };

  if (!started || requiredPointCount <= 0) {
    return { counts };
  }

  const coverage = clamp01(completedRequiredCount / requiredPointCount);
  const sequenceDenominator = completedTotalCount + wrongOrderAttempts;
  const sequence = sequenceDenominator > 0 ? clamp01(correctSequenceCount / sequenceDenominator) : 0;
  const wellPlaced = completedTotalCount + wrongOrderAttempts;
  const accuracyDenominator = wellPlaced + wrongPositionAttempts + wrongAngleAttempts;
  const accuracy = accuracyDenominator > 0 ? clamp01(wellPlaced / accuracyDenominator) : 0;

  let { coverageWeight: wc, sequenceWeight: ws, accuracyWeight: wa } = rules ?? DEFAULT_SCENE_PHOTOGRAPHY_RULES;
  wc = Math.max(0, wc);
  ws = Math.max(0, ws);
  wa = Math.max(0, wa);
  if (wc + ws + wa <= 0) {
    ({ coverageWeight: wc, sequenceWeight: ws, accuracyWeight: wa } = DEFAULT_SCENE_PHOTOGRAPHY_RULES);
  }

  const score = clamp01((coverage * wc + sequence * ws + accuracy * wa) / (wc + ws + wa));

  return {
    scenePhotography: round4(score),
    scenePhotographyCoverage: round4(coverage),
    scenePhotographySequence: round4(sequence),
    scenePhotographyAccuracy: round4(accuracy),
    counts,
  };
}
