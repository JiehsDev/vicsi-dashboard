// src/lib/scoring/evidenceScorer.ts
import "server-only";
import type { GroundTruth, ScoringSessionEvent } from "./types.ts";
import { payloadValue } from "./types.ts";

/** Direct 1:1 port of Tools/EvidenceScorer/Program.cs's Score() method.
 *  Deliberately NOT redesigned or "improved" — every branch, every ratio,
 *  every NaN-for-zero-denominator rule below mirrors the .NET reference
 *  exactly, so this module's output can be checked against it fixture by
 *  fixture (see src/lib/scoring/__tests__/parity.test.ts). If the .NET
 *  scorer's behavior ever changes, this file must change to match — never
 *  the other way around, and never independently. */

function rank(sequence: readonly string[], status: string | null | undefined): number {
  if (!status) return -1;
  return sequence.indexOf(status);
}

/** A ratio with no denominator is `undefined` (this module's equivalent of
 *  the .NET reference's `double.NaN`) — never 0. A scenario with no
 *  Distractor items has an undefined fall-rate; reporting 0 would read as
 *  "nobody fell for it," a claim the data cannot support. Rounded to 4
 *  decimal places, matching Program.cs's own `Math.Round(x, 4)`. */
function ratio(numerator: number, denominator: number): number | undefined {
  if (denominator === 0) return undefined;
  return Math.round((numerator / denominator) * 10000) / 10000;
}

export interface EvidenceScoreOutput {
  criticalRecall?: number;
  relevantRecall?: number;
  precision?: number;
  distractorFallRate?: number;
  reasoningAccuracy?: number;
  documentationAccuracy?: number;

  criticalTotal: number;
  criticalRecalled: number;
  relevantTotal: number;
  relevantRecalled: number;
  distractorTotal: number;
  distractorEverMarked: number;
  truePositiveMarks: number;
  falsePositiveMarks: number;
  unclassifiedMarks: number;
  reasoningCorrect: number;
  reasoningTotal: number;
  reasoningUnclassified: number;
  documentationTruePositives: number;
  documentationFalsePositives: number;
  documentationUnclassified: number;
  nonEvidenceMarkCount: number;
  reclaimCount: number;
  reclaimBlockedCount: number;

  warnings: string[];
}

export function scoreEvidence(events: ScoringSessionEvent[], groundTruth: GroundTruth): EvidenceScoreOutput {
  const sequence = groundTruth.lifecycleSequence;
  const markedRank = rank(sequence, "Marked");
  if (markedRank < 0) {
    throw new Error("VERIFICATION_ERROR: ground truth lifecycleSequence contains no 'Marked' status");
  }

  const relevanceById = new Map(groundTruth.evidence.map((e) => [e.evidenceId, e.relevance] as const));

  const reasoningCorrectByCheckpoint = new Map<string, Map<string, boolean>>();
  for (const checkpoint of groundTruth.hypothesisCheckpoints) {
    reasoningCorrectByCheckpoint.set(checkpoint.id, new Map(checkpoint.reasoningOptions.map((o) => [o.id, o.isCorrect] as const)));
  }

  const accurateByEvidence = new Map<string, Map<string, boolean>>();
  for (const item of groundTruth.evidenceReportLines) {
    accurateByEvidence.set(item.evidenceId, new Map(item.reportLineOptions.map((o) => [o.id, o.isAccurate] as const)));
  }

  const finalStatus = new Map<string, string>();
  const everMarked = new Set<string>();

  let truePositiveMarks = 0;
  let falsePositiveMarks = 0;
  let unclassifiedMarks = 0;
  let nonEvidenceMarkCount = 0;
  let reclaimCount = 0;
  let reclaimBlockedCount = 0;
  let reasoningCorrect = 0;
  let reasoningTotal = 0;
  let reasoningUnclassified = 0;
  let documentationTruePositives = 0;
  let documentationFalsePositives = 0;
  let documentationUnclassified = 0;

  // Replay in recorded order regardless of arrival order — same as
  // Program.cs's ReadEvents sorting by sequenceNumber before Score() runs.
  const ordered = [...events].sort((a, b) => a.sequenceNumber - b.sequenceNumber);

  for (const ev of ordered) {
    switch (ev.eventType) {
      case "EvidenceStatusChanged": {
        const id = ev.targetId;
        const status = payloadValue(ev, "status");
        if (!id || !status) break;

        // Straight ordered replay gives the TRUE final state, including
        // reversions (a reclaim emits its own EvidenceStatusChanged back to
        // Found) — walked back here, not interpreted separately.
        finalStatus.set(id, status);

        if (status === "Marked") {
          everMarked.add(id);
          const relevance = relevanceById.get(id);
          if (relevance === undefined) {
            unclassifiedMarks++;
          } else if (relevance === "Critical" || relevance === "Relevant") {
            truePositiveMarks++;
          } else if (relevance === "Distractor") {
            falsePositiveMarks++;
          }
          // Neutral: collectible but non-discriminating — neither TP nor FP.
        }
        break;
      }

      case "NonEvidenceMarked":
        nonEvidenceMarkCount++;
        falsePositiveMarks++;
        break;

      case "MarkerReclaimed":
        reclaimCount++;
        break;

      case "MarkerReclaimBlocked":
        reclaimBlockedCount++;
        break;

      case "HypothesisSubmitted": {
        const checkpointId = ev.targetId;
        const reasoningOptionId = payloadValue(ev, "reasoningOptionId");
        // No reasoningOptionId means this checkpoint had no reasoning step
        // (requiresReasoning false) — excluded from both halves of the ratio.
        if (!checkpointId || !reasoningOptionId) break;

        const options = reasoningCorrectByCheckpoint.get(checkpointId);
        const isCorrect = options?.get(reasoningOptionId);
        if (options && isCorrect !== undefined) {
          reasoningTotal++;
          if (isCorrect) reasoningCorrect++;
        } else {
          reasoningUnclassified++;
        }
        break;
      }

      case "ReportLinesSelected": {
        const evidenceId = ev.targetId;
        const lineIdsRaw = payloadValue(ev, "lineIds");
        if (!evidenceId || !lineIdsRaw) break;

        const lineAccuracy = accurateByEvidence.get(evidenceId);
        for (const lineId of lineIdsRaw.split(",").filter((s) => s.length > 0)) {
          const isAccurate = lineAccuracy?.get(lineId);
          if (lineAccuracy && isAccurate !== undefined) {
            if (isAccurate) documentationTruePositives++;
            else documentationFalsePositives++;
          } else {
            documentationUnclassified++;
          }
        }
        break;
      }

      default:
        break;
    }
  }

  let criticalTotal = 0;
  let criticalRecalled = 0;
  let relevantTotal = 0;
  let relevantRecalled = 0;
  let distractorTotal = 0;
  let distractorEverMarked = 0;

  for (const item of groundTruth.evidence) {
    const status = finalStatus.get(item.evidenceId);
    const reachedMarked = rank(sequence, status) >= markedRank;

    switch (item.relevance) {
      case "Critical":
        criticalTotal++;
        if (reachedMarked) criticalRecalled++;
        break;
      case "Relevant":
        relevantTotal++;
        if (reachedMarked) relevantRecalled++;
        break;
      case "Distractor":
        distractorTotal++;
        // Fall-rate is "ever marked", NOT final state.
        if (everMarked.has(item.evidenceId)) distractorEverMarked++;
        break;
      default:
        break;
    }
  }

  const precisionDenominator = truePositiveMarks + falsePositiveMarks;
  const documentationDenominator = documentationTruePositives + documentationFalsePositives;

  const warnings: string[] = [];
  if (unclassifiedMarks > 0) {
    warnings.push(`${unclassifiedMarks} marking event(s) referenced evidence ids absent from the ground truth.`);
  }
  if (reasoningUnclassified > 0) {
    warnings.push(`${reasoningUnclassified} HypothesisSubmitted event(s) referenced a checkpoint/option id absent from the ground truth.`);
  }
  if (documentationUnclassified > 0) {
    warnings.push(`${documentationUnclassified} selected report line(s) referenced an evidenceId/line id absent from the ground truth.`);
  }

  return {
    criticalRecall: ratio(criticalRecalled, criticalTotal),
    relevantRecall: ratio(relevantRecalled, relevantTotal),
    precision: ratio(truePositiveMarks, precisionDenominator),
    distractorFallRate: ratio(distractorEverMarked, distractorTotal),
    reasoningAccuracy: ratio(reasoningCorrect, reasoningTotal),
    documentationAccuracy: ratio(documentationTruePositives, documentationDenominator),

    criticalTotal,
    criticalRecalled,
    relevantTotal,
    relevantRecalled,
    distractorTotal,
    distractorEverMarked,
    truePositiveMarks,
    falsePositiveMarks,
    unclassifiedMarks,
    reasoningCorrect,
    reasoningTotal,
    reasoningUnclassified,
    documentationTruePositives,
    documentationFalsePositives,
    documentationUnclassified,
    nonEvidenceMarkCount,
    reclaimCount,
    reclaimBlockedCount,

    warnings,
  };
}
