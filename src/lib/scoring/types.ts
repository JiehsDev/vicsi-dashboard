// src/lib/scoring/types.ts
import "server-only";

/** One ordered session event, as stored in session_events / replayed from
 *  Unity's own log — mirrors Tools/EvidenceScorer/Program.cs's SessionEvent
 *  exactly (camelCase names match the DB's own snake_case columns 1:1 after
 *  the row-mapper in verify.ts). `payload` is Unity's own [{key,value}, ...]
 *  shape (see AssessmentSessionUploadDto.cs's UploadSessionEventDto), stored
 *  verbatim in the jsonb column — never flattened. */
export interface ScoringSessionEvent {
  sequenceNumber: number;
  timestampMs: number;
  eventType: string;
  targetId: string | null;
  payload: Array<{ key: string; value: string }>;
}

export function payloadValue(event: ScoringSessionEvent, key: string): string | undefined {
  return event.payload.find((p) => p.key === key)?.value;
}

export interface ScoringSessionRelationship {
  relationshipId: string;
  state: string;
  wasEverSelected: boolean;
}

export interface ScoringSessionProcedureViolation {
  eventType: string;
}

/** Everything about one session the scorer needs beyond its event log —
 *  read once from assessment_sessions, never re-derived from client-supplied
 *  fields (see submit_assessment_session's own identity-from-token rule;
 *  by the time verify.ts runs, these are already the server-resolved values
 *  a real submission stored). */
export interface ScoringSessionContext {
  sessionId: string;
  scenarioId: string;
  selectedConclusionId: string | null;
  resolvedEndingId: string | null;
}

// ---------------------------------------------------------------------------
// Ground truth — the answer key. NEVER sent to a client, NEVER exposed
// through any Route Handler or Server Action. Only imported by
// src/lib/scoring/**, which is itself only ever invoked from server-only
// code (Route Handlers, never Client Components).
// ---------------------------------------------------------------------------

export type EvidenceRelevance = "Critical" | "Relevant" | "Distractor" | "Neutral";

export interface GroundTruthEvidenceItem {
  evidenceId: string;
  relevance: EvidenceRelevance;
}

export interface GroundTruthReasoningOption {
  id: string;
  isCorrect: boolean;
}

export interface GroundTruthHypothesisCheckpoint {
  id: string;
  reasoningOptions: GroundTruthReasoningOption[];
}

export interface GroundTruthReportLineOption {
  id: string;
  isAccurate: boolean;
}

export interface GroundTruthEvidenceReportLines {
  evidenceId: string;
  reportLineOptions: GroundTruthReportLineOption[];
}

/** A relationship this scenario's board considers correct, with its scoring
 *  weight — mirrors RelationshipDefinition.isCorrect/scoreWeight in Unity
 *  (Assets/_Project/Data/Relationships/**). There is no "required" flag in
 *  the source Unity assets today; every relationship a scenario defines is
 *  treated as required for full relationshipAccuracy credit (see
 *  relationshipScorer.ts's own comment). */
export interface GroundTruthRelationship {
  relationshipId: string;
  scoreWeight: number;
}

/** The one conclusion/ending pair this scenario's narrative treats as
 *  correct — mirrors the highest-priority non-premature ending in
 *  Assets/_Project/Data/Ending/Endings_CSI_Environment.asset. */
export interface GroundTruthConclusion {
  correctConclusionId: string;
  correctEndingId: string;
}

/** The full versioned answer key for one scenario. `scenarioVersion` and
 *  `groundTruthVersion` are independent — the scenario's Unity content can
 *  version separately from when its answer key was last regenerated. */
export interface GroundTruth {
  scenarioId: string;
  scenarioVersion: string;
  groundTruthVersion: string;
  generatedAt: string;

  /** The game's canonical evidence lifecycle order (EvidenceStateManager
   *  .RequiredSequence, exported) — every recall metric is defined against
   *  "reached Marked or later" in this order. No hardcoded copy anywhere
   *  else in this module; see evidenceScorer.ts. */
  lifecycleSequence: string[];

  evidence: GroundTruthEvidenceItem[];
  hypothesisCheckpoints: GroundTruthHypothesisCheckpoint[];
  evidenceReportLines: GroundTruthEvidenceReportLines[];
  relationships: GroundTruthRelationship[];
  conclusion: GroundTruthConclusion;
}

// ---------------------------------------------------------------------------
// Scoring rules — HOW categories combine into an overall score, and how
// procedural violations are weighted. Versioned separately from ground truth
// so re-weighting categories doesn't require re-authoring the answer key.
// ---------------------------------------------------------------------------

export interface ProceduralScoringRules {
  /** event_type -> penalty weight for one occurrence (see
   *  session_procedure_violations.event_type: EvidenceTransitionBlocked,
   *  NonEvidenceMarked, MarkerReclaimBlocked, EvidenceMarkerRejected).
   *  An event_type absent from this map contributes 0 — never silently
   *  ignored, always an explicit modeling choice recorded in the rules file. */
  violationWeights: Record<string, number>;
  /** Total weighted violations at/above which proceduralCompliance floors
   *  at 0. Below this, compliance degrades linearly with weighted count. */
  violationBudget: number;
}

/** Weights used to combine every category into `overallScore`. These are
 *  NOT a validated pedagogical formula — see overallScore.ts's own class
 *  comment — they are an explicit, versioned, instructor-tunable
 *  configuration, exactly what this feature asked for ("keep category
 *  weights editable through versioned server configuration"). Weights need
 *  not sum to 1; overallScore.ts normalizes by their sum so a scenario
 *  missing a category (e.g. no distractors, so distractorFallRate is NaN
 *  and excluded) still produces a 0-1 score from the remaining weights. */
export interface CategoryWeights {
  criticalRecall: number;
  relevantRecall: number;
  precision: number;
  distractorFallRate: number; // applied to (1 - distractorFallRate) — lower fall-rate is better
  reasoningAccuracy: number;
  documentationAccuracy: number;
  relationshipAccuracy: number;
  proceduralCompliance: number;
  finalConclusionAccuracy: number;
}

export interface ScoringRules {
  scoringRulesVersion: string;
  procedural: ProceduralScoringRules;
  categoryWeights: CategoryWeights;
}

/** Every category this module can produce. A category is omitted (not 0)
 *  when its denominator is undefined — see each scorer's own comment,
 *  mirroring Ratio()'s NaN-not-zero rule in the .NET reference. */
export interface ScoreCategories {
  criticalRecall?: number;
  relevantRecall?: number;
  precision?: number;
  distractorFallRate?: number;
  reasoningAccuracy?: number;
  documentationAccuracy?: number;
  relationshipAccuracy?: number;
  proceduralCompliance?: number;
  finalConclusionAccuracy?: number;
  overallScore?: number;
}

/** Supporting counts alongside each ratio, so a result can be audited
 *  without re-parsing the event log — same "ratio + counts" shape
 *  ScoreReport uses in the .NET reference. */
export interface ScoreCounts {
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
  relationshipsCompleted: number;
  relationshipsTotal: number;
  weightedProceduralViolations: number;
}

export interface ScoreResult {
  categories: ScoreCategories;
  counts: ScoreCounts;
  /** Non-fatal data-quality warnings (unclassified marks/reasoning/report
   *  lines > 0) — surfaced to the caller so verify.ts can decide between
   *  'verified' and 'requires_review', never silently swallowed. */
  warnings: string[];
}
