// src/lib/scoring/proceduralScorer.ts
import "server-only";
import type { ProceduralScoringRules, ScoringSessionProcedureViolation } from "./types.ts";

/** NEW category — the .NET reference reports NonEvidenceMarkCount/
 *  ReclaimCount/ReclaimBlockedCount but explicitly does NOT turn them into a
 *  score ("[reported, not scored]" in Program.cs's own console output).
 *  This is a deliberate extension, not a port: procedural compliance
 *  degrades LINEARLY from 1.0 to 0.0 as the scenario's configured
 *  violationBudget (see ScoringRules) is consumed by weighted violations,
 *  floored at 0 rather than going negative. Always defined (never
 *  undefined/NaN) — a session with zero violations has 100% compliance by
 *  construction, unlike the evidence-recall ratios above, which are
 *  genuinely undefined with a zero denominator. */
export interface ProceduralScoreOutput {
  proceduralCompliance: number;
  weightedProceduralViolations: number;
}

export function scoreProcedural(
  violations: ScoringSessionProcedureViolation[],
  rules: ProceduralScoringRules,
): ProceduralScoreOutput {
  let weighted = 0;
  for (const v of violations) {
    weighted += rules.violationWeights[v.eventType] ?? 0;
  }

  const compliance = rules.violationBudget <= 0 ? (weighted > 0 ? 0 : 1) : Math.max(0, 1 - weighted / rules.violationBudget);

  return {
    proceduralCompliance: Math.round(compliance * 10000) / 10000,
    weightedProceduralViolations: weighted,
  };
}
