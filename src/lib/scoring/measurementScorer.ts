// src/lib/scoring/measurementScorer.ts
import "server-only";
import { payloadValue, type MeasurementScoringRules, type ScoringSessionEvent } from "./types.ts";

/** Evidence-position measurement, scored from the session's own
 *  MeasurementTaken events against the expected distances and tolerance held
 *  HERE (scoring rules 1.2.0+) - never from the client's withinTolerance
 *  flags, item scores or totals (the upload's `measurement` section is
 *  analytics only). Same formula as Unity's MeasurementScoring (client
 *  display only). Per required item:
 *
 *    completion = both references measured 1, one 0.5, none 0
 *    accuracy   = (A within tolerance + B within tolerance) / 2, each side
 *                 judged on its LAST measurement (re-measuring replaces it,
 *                 as in MeasurementStateManager); an unmeasured side is 0
 *    timing     = 1 when something was measured and no side was taken after
 *                 the item was disturbed (afterDisturbance), else 0
 *    item       = weighted mean of the three (weights normalized by their sum)
 *
 *  measurement = equal-weight mean over the rules' required items, so an item
 *  never measured scores 0 rather than dropping out. Undefined (not 0) only
 *  when the rules version has no measurement section (1.0.0/1.1.0): those
 *  sessions keep exactly the score they had. ProcedureOutOfOrder (e.g. "final
 *  photo before measuring") is never read here - it is a Warn-level hint, and
 *  scoring it as well would penalize the same lapse twice. */

export const DEFAULT_MEASUREMENT_COMPONENT_WEIGHTS = {
  completionWeight: 0.3,
  accuracyWeight: 0.5,
  timingWeight: 0.2,
};

/** Distances arrive formatted to the millimetre ("0.000"); this absorbs the
 *  float noise of |measured - expected| at exactly the tolerance. */
const TOLERANCE_EPSILON = 1e-6;

export interface MeasurementItemScore {
  requirementId: string;
  evidenceId: string;
  measuredA: boolean;
  measuredB: boolean;
  withinToleranceA: boolean;
  withinToleranceB: boolean;
  late: boolean;
  completion: number;
  accuracy: number;
  timing: number;
  score: number;
}

export interface MeasurementScoreOutput {
  measurement?: number;
  measurementCompletion?: number;
  measurementAccuracy?: number;
  measurementTiming?: number;
  items: MeasurementItemScore[];
}

const round4 = (v: number) => Math.round(v * 10000) / 10000;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function scoreMeasurement(
  events: ScoringSessionEvent[],
  rules: MeasurementScoringRules | undefined,
): MeasurementScoreOutput {
  // Geometry selection is explicit and independent of the deduction formula.
  // Never use client-provided expected distances or silently reinterpret old sessions.
  const layouts = new Set(events.filter(e => e.eventType === "MeasurementTaken")
    .map(e => payloadValue(e, "layoutId") ?? ""));
  if (layouts.size > 1) return { items: [] }; // mixed/incomplete geometry declarations
  const layoutId = layouts.values().next().value as string | undefined;
  const registered = layoutId ? rules?.layoutProfiles?.[layoutId] : rules?.requirements;
  if (layoutId && !registered) return { items: [] }; // unavailable, never judged against another house
  const requirements = (registered ?? []).filter((r) => r.required !== false);
  if (requirements.length === 0) {
    return { items: [] };
  }

  // Last measurement per requirement + side; any late side marks the item late.
  const lastA = new Map<string, number>();
  const lastB = new Map<string, number>();
  const late = new Set<string>();
  const byId = new Map(requirements.map((r) => [r.requirementId, r]));

  for (const e of events) {
    if (e.eventType !== "MeasurementTaken") continue;
    const requirement = byId.get(payloadValue(e, "requirementId") ?? "");
    if (!requirement) continue;
    const distance = Number(payloadValue(e, "measuredDistance"));
    if (!Number.isFinite(distance) || distance < 0) continue;

    const referenceId = payloadValue(e, "referenceId");
    if (referenceId === requirement.referenceAId) lastA.set(requirement.requirementId, distance);
    else if (referenceId === requirement.referenceBId) lastB.set(requirement.requirementId, distance);
    else continue; // not one of this requirement's references - the client refuses these anyway

    if (payloadValue(e, "afterDisturbance") === "True") late.add(requirement.requirementId);
  }

  let { completionWeight: wc, accuracyWeight: wa, timingWeight: wt } = rules ?? DEFAULT_MEASUREMENT_COMPONENT_WEIGHTS;
  wc = Math.max(0, wc);
  wa = Math.max(0, wa);
  wt = Math.max(0, wt);
  if (wc + wa + wt <= 0) {
    ({ completionWeight: wc, accuracyWeight: wa, timingWeight: wt } = DEFAULT_MEASUREMENT_COMPONENT_WEIGHTS);
  }

  const items: MeasurementItemScore[] = requirements.map((r) => {
    const a = lastA.get(r.requirementId);
    const b = lastB.get(r.requirementId);
    const measuredA = a !== undefined;
    const measuredB = b !== undefined;
    const withinToleranceA = measuredA && Math.abs(a - r.expectedDistanceA) <= r.tolerance + TOLERANCE_EPSILON;
    const withinToleranceB = measuredB && Math.abs(b - r.expectedDistanceB) <= r.tolerance + TOLERANCE_EPSILON;
    const isLate = late.has(r.requirementId);

    const completion = measuredA && measuredB ? 1 : measuredA || measuredB ? 0.5 : 0;
    const accuracy = ((withinToleranceA ? 1 : 0) + (withinToleranceB ? 1 : 0)) / 2;
    const timing = (measuredA || measuredB) && !isLate ? 1 : 0;
    const score = clamp01((completion * wc + accuracy * wa + timing * wt) / (wc + wa + wt));

    return {
      requirementId: r.requirementId,
      evidenceId: r.evidenceId,
      measuredA,
      measuredB,
      withinToleranceA,
      withinToleranceB,
      late: isLate,
      completion,
      accuracy,
      timing,
      score: round4(score),
    };
  });

  const mean = (pick: (i: MeasurementItemScore) => number) => items.reduce((sum, i) => sum + pick(i), 0) / items.length;
  const completion = mean((i) => i.completion);
  const accuracy = mean((i) => i.accuracy);
  const timing = mean((i) => i.timing);

  return {
    measurement: round4(clamp01((completion * wc + accuracy * wa + timing * wt) / (wc + wa + wt))),
    measurementCompletion: round4(completion),
    measurementAccuracy: round4(accuracy),
    measurementTiming: round4(timing),
    items,
  };
}
