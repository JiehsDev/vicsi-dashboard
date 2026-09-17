// src/lib/scoring/data/csiEnvironment.v1.ts
import "server-only";
import type { GroundTruth, ScoringRules } from "../types.ts";

/** groundTruthVersion "1" answer key for CSI-ENVIRONMENT-001.
 *
 *  evidence / hypothesisCheckpoints / evidenceReportLines / lifecycleSequence
 *  are transcribed from Assets/_Project/Data/Scenarios/GroundTruth_CSI_Environment.json
 *  (generated 2026-09-11 via Unity menu Tools/VICSI/Export Scenario Ground
 *  Truth) - values only, never redesigned. NOTE: that export's own
 *  `scenarioId` field reads "CSI_Environment" (underscore, no version
 *  suffix), which is NOT the id this project actually stores anywhere else
 *  (assessment_assignments.scenario_id, ScenarioDefinition.scenarioId, and
 *  every DB row all use "CSI-ENVIRONMENT-001"). This file uses the real id;
 *  the exporter's own output should be regenerated to match the next time
 *  someone touches that tool, but nothing here depends on the export's
 *  internal id string, only on its evidence/hypothesis/report-line VALUES.
 *
 *  relationships / conclusion have NO exporter and NO .NET reference at all
 *  (see relationshipScorer.ts / conclusionScorer.ts's own comments) -
 *  transcribed by hand from the actual Unity source assets:
 *    Assets/_Project/Data/Relationships/CSI_Environment/*.asset (isCorrect/scoreWeight)
 *    Assets/_Project/Data/Ending/Endings_CSI_Environment.asset (conclusionId/endingId/priority)
 */
export const CSI_ENVIRONMENT_GROUND_TRUTH_V1: GroundTruth = {
  scenarioId: "CSI-ENVIRONMENT-001",
  scenarioVersion: "1.0.0",
  groundTruthVersion: "1.0.0",
  generatedAt: "2026-09-11T04:54:39Z",

  lifecycleSequence: [
    "NotFound", "Found", "PhotographedRaw", "ChalkMarked", "Marked", "PhotographedFinal",
    "Logged", "ReadyForCollection", "Collected", "Sealed", "Processed",
  ],

  evidence: [
    { evidenceId: "EVD-014", relevance: "Critical" }, // Kitchen knife
    { evidenceId: "EVD-015", relevance: "Critical" }, // Blood spatter pattern
    { evidenceId: "EVD-017", relevance: "Relevant" }, // Victim's mobile phone
    { evidenceId: "EVD-018", relevance: "Distractor" }, // Empty liquor bottle
    { evidenceId: "EVD-019", relevance: "Critical" }, // Disposable gloves
  ],

  hypothesisCheckpoints: [
    {
      id: "HYP-02",
      reasoningOptions: [
        { id: "hyp02-blood-spatter-impact", isCorrect: true },
        { id: "hyp02-bottle-intoxication", isCorrect: false },
        { id: "hyp02-knife-routine-use", isCorrect: false },
        { id: "hyp02-print-ambiguous", isCorrect: false },
      ],
    },
    {
      id: "HYP-03",
      reasoningOptions: [
        { id: "hyp03-knife-print-implicates-brother", isCorrect: false },
        { id: "hyp03-phone-overclaim", isCorrect: false },
        { id: "hyp03-bottle-premature-closure", isCorrect: false },
        { id: "hyp03-gloves-wife-match", isCorrect: true },
        { id: "hyp03-no-contradicting-evidence", isCorrect: false },
      ],
    },
  ],

  evidenceReportLines: [
    {
      evidenceId: "EVD-014",
      reportLineOptions: [
        { id: "knife-blade-length", isAccurate: true },
        { id: "knife-blood-trace", isAccurate: true },
        { id: "knife-location", isAccurate: true },
        { id: "knife-print-on-handle", isAccurate: true },
        { id: "knife-owner-speculation", isAccurate: false },
        { id: "knife-conclusion-weapon", isAccurate: false },
        { id: "knife-wound-match", isAccurate: true },
      ],
    },
    {
      evidenceId: "EVD-015",
      reportLineOptions: [
        { id: "blood-spatter-location", isAccurate: true },
        { id: "blood-spatter-droplet-pattern", isAccurate: true },
        { id: "blood-spatter-swab-collection", isAccurate: true },
        { id: "blood-spatter-mechanism-only", isAccurate: true },
        { id: "blood-spatter-fall-confirmed", isAccurate: false },
        { id: "blood-spatter-identity-assumed", isAccurate: false },
      ],
    },
    {
      evidenceId: "EVD-017",
      reportLineOptions: [
        { id: "phone-screen-down-position", isAccurate: true },
        { id: "phone-ownership-established", isAccurate: true },
        { id: "phone-call-history-potential", isAccurate: true },
        { id: "phone-fingerprint-pending", isAccurate: true },
        { id: "phone-history-overclaim", isAccurate: false },
        { id: "phone-drop-struggle-assumed", isAccurate: false },
      ],
    },
    {
      evidenceId: "EVD-018",
      reportLineOptions: [
        { id: "bottle-location", isAccurate: true },
        { id: "bottle-first-encountered", isAccurate: true },
        { id: "bottle-standard-procedure", isAccurate: true },
        { id: "bottle-fingerprint-pending", isAccurate: true },
        { id: "bottle-intoxication-explains-fall", isAccurate: false },
        { id: "bottle-recent-drinking-assumed", isAccurate: false },
      ],
    },
    {
      evidenceId: "EVD-019",
      reportLineOptions: [
        { id: "glove-outside-blood", isAccurate: true },
        { id: "glove-hidden-location", isAccurate: true },
        { id: "glove-inside-print", isAccurate: true },
        { id: "glove-fingerprint-confirms-wearer", isAccurate: true },
        { id: "glove-owner-speculation", isAccurate: false },
        { id: "glove-conclusion-premature", isAccurate: false },
      ],
    },
  ],

  // scoreWeight: 1 for every relationship, matching every .asset's own
  // authored value (Assets/_Project/Data/Relationships/CSI_Environment/*.asset).
  relationships: [
    { relationshipId: "REL-physical-contradicts-wife", scoreWeight: 1 },
    { relationshipId: "REL-gloves-blood-matches-victim", scoreWeight: 1 },
    { relationshipId: "REL-gloves-fingerprint-identifies-wife", scoreWeight: 1 },
    { relationshipId: "REL-hidden-gloves-contradicts-wife", scoreWeight: 1 },
    { relationshipId: "REL-knife-consistent-wound", scoreWeight: 1 },
    { relationshipId: "REL-bottle-supports-brother", scoreWeight: 1 },
    { relationshipId: "REL-spatter-consistent-reconstruction", scoreWeight: 1 },
  ],

  // ending-wife-convicted has the highest priority (100) among the
  // non-premature endings in Endings_CSI_Environment.asset - the narrative's
  // one intended resolution.
  conclusion: {
    correctConclusionId: "conclusion-wife",
    correctEndingId: "ending-wife-convicted",
  },
};

/** scoringRulesVersion "1" for CSI-ENVIRONMENT-001. Weights are a starting
 *  point, not a validated grading policy - see overallScore.ts's own class
 *  comment. Every value here is what an instructor/designer would actually
 *  tune; nothing is hardcoded into the scorer modules themselves. */
export const CSI_ENVIRONMENT_SCORING_RULES_V1: ScoringRules = {
  scoringRulesVersion: "1.0.0",
  procedural: {
    violationWeights: {
      EvidenceTransitionBlocked: 1,
      NonEvidenceMarked: 1,
      MarkerReclaimBlocked: 0.5,
      EvidenceMarkerRejected: 1,
    },
    // 10 weighted violations (e.g. 10 blocked transitions, or a mix) drives
    // proceduralCompliance to 0. Chosen as a round, easily-explained number,
    // not derived from any data - retune via a new scoringRulesVersion.
    violationBudget: 10,
  },
  categoryWeights: {
    criticalRecall: 2,
    relevantRecall: 1,
    precision: 1,
    distractorFallRate: 1,
    reasoningAccuracy: 1.5,
    documentationAccuracy: 1,
    relationshipAccuracy: 1.5,
    proceduralCompliance: 1,
    finalConclusionAccuracy: 2,
  },
};
