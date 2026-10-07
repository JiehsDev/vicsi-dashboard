// src/lib/scoring/procedureOrderScorer.ts
import "server-only";
import { payloadValue, type ProcedureOrderScoringRules, type ScoringSessionEvent } from "./types.ts";

/** Procedure order compliance (scoring rules 1.3.0+): warning-level
 *  out-of-order actions - Warn stepRequirements the game allowed but logged as
 *  ProcedureOutOfOrder. Blocked actions stay in proceduralCompliance and are
 *  never read here.
 *
 *    score = max(0, 1 - penaltyPerWarning x unique countable warnings)
 *
 *  Only procedureIds on the rules' allowlist count, each at most once per
 *  evidence item (evidenceId|procedureId - the client already logs each rule
 *  once per item; this re-deduplicates so repeats can never multiply). A
 *  warning is dropped when another category already penalizes the same
 *  mistake (`excludeWhen`):
 *
 *   - "sceneAttemptSamePress": an evidence photo before the overall scene
 *     photography is excluded when that same shutter press also produced a
 *     ScenePhotoWrongAngle / ScenePhotoOutOfSequence / ScenePhotoWrongPosition
 *     event (logged in the same frame, just before the warning) - Scene
 *     Photography's accuracy/sequence already counted that press.
 *   - "measurementNotCompletedOnTime": a final evidence photo before
 *     measuring is excluded unless the item's measurement was eventually
 *     completed (MeasurementCompleted) with no side taken after disturbance -
 *     otherwise Measurement's completion/accuracy/timing already penalizes it.
 *     What remains is the pure ordering slip: measured correctly, but after
 *     the final photo.
 *
 *  Undefined when the rules version has no procedureOrder section (before
 *  1.3.0), so those sessions keep exactly their original scores. */

export interface ProcedureOrderWarning {
  procedureId: string;
  evidenceId: string;
  sequenceNumber: number;
  counted: boolean;
  excludedBecause?: string;
}

export interface ProcedureOrderScoreOutput {
  procedureOrderCompliance?: number;
  procedureOrderWarningCount?: number;
  warnings: ProcedureOrderWarning[];
}

const SCENE_ATTEMPT_EVENTS = new Set(["ScenePhotoWrongAngle", "ScenePhotoOutOfSequence", "ScenePhotoWrongPosition"]);

const round4 = (v: number) => Math.round(v * 10000) / 10000;

export function scoreProcedureOrder(
  events: ScoringSessionEvent[],
  rules: ProcedureOrderScoringRules | undefined,
): ProcedureOrderScoreOutput {
  if (!rules) {
    return { warnings: [] };
  }

  const countable = new Map(rules.countable.map((c) => [c.procedureId, c]));
  // Stored events aren't guaranteed to arrive in log order; the same-press check needs it.
  events = [...events].sort((a, b) => a.sequenceNumber - b.sequenceNumber);

  // Measurement facts per requirement, for "measurementNotCompletedOnTime".
  const measurementCompleted = new Set<string>();
  const measurementLate = new Set<string>();
  for (const e of events) {
    const requirementId = payloadValue(e, "requirementId");
    if (!requirementId) continue;
    if (e.eventType === "MeasurementCompleted") measurementCompleted.add(requirementId);
    if (e.eventType === "MeasurementTaken" && payloadValue(e, "afterDisturbance") === "True") measurementLate.add(requirementId);
  }

  const seen = new Set<string>();
  const warnings: ProcedureOrderWarning[] = [];

  events.forEach((e, index) => {
    if (e.eventType !== "ProcedureOutOfOrder") return;
    const procedureId = payloadValue(e, "procedureId") ?? "";
    const evidenceId = payloadValue(e, "evidenceId") || e.targetId || "";
    const rule = countable.get(procedureId);
    if (!rule) return; // not on the allowlist - never scored
    const key = `${evidenceId}|${procedureId}`;
    if (seen.has(key)) return;
    seen.add(key);

    let excludedBecause: string | undefined;
    if (rule.excludeWhen === "sceneAttemptSamePress") {
      const window = rules.samePressWindowMs;
      for (let i = index - 1; i >= 0; i--) {
        const prior = events[i];
        if (e.timestampMs - prior.timestampMs > window) break;
        if (SCENE_ATTEMPT_EVENTS.has(prior.eventType)) {
          excludedBecause = `already scored by scene photography (${prior.eventType}, same shutter press)`;
          break;
        }
      }
    } else if (rule.excludeWhen === "measurementNotCompletedOnTime") {
      const prerequisite = payloadValue(e, "expectedPrerequisite") ?? "";
      const requirementId = prerequisite.startsWith("measurement:") ? prerequisite.slice("measurement:".length) : "";
      if (!requirementId || !measurementCompleted.has(requirementId)) {
        excludedBecause = "already scored by measurement (never completed)";
      } else if (measurementLate.has(requirementId)) {
        excludedBecause = "already scored by measurement timing (taken after disturbance)";
      }
    }

    warnings.push({ procedureId, evidenceId, sequenceNumber: e.sequenceNumber, counted: !excludedBecause, excludedBecause });
  });

  const count = warnings.filter((w) => w.counted).length;
  const penalty = Math.max(0, rules.penaltyPerWarning);
  return {
    procedureOrderCompliance: round4(Math.max(0, 1 - penalty * count)),
    procedureOrderWarningCount: count,
    warnings,
  };
}
