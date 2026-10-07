// src/lib/scoring/data/csiEnvironment.groundTruth.v1_1.ts
import "server-only";
import type { GroundTruth } from "../types.ts";
import { CSI_ENVIRONMENT_GROUND_TRUTH_V1 } from "./csiEnvironment.v1.ts";

/** groundTruthVersion "1.1.0" for CSI-ENVIRONMENT-001: the single-path
 *  scenario where the brother is the only supported culprit (BODY-A, EVD-014
 *  knife, EVD-015 spatter, EVD-018 bottle). Mirrors the Unity content:
 *
 *    - EVD-017 (phone) and EVD-019 (gloves) are retired - absent from the
 *      roster and report-line key, so they never enter a recall denominator.
 *    - EVD-018 is supporting context ("Relevant"), no longer a Distractor: its
 *      print places the brother in the house drinking that night.
 *    - HYP-02 tests "a print shows handling, not guilt - the wound and blood
 *      pattern are what connect it to an attack"; HYP-03 tests combining the
 *      print, the weapon match and the reconstruction. Exactly one correct
 *      option each.
 *    - Only the three remaining relationships are in the key.
 *    - The supported case outcome is conclusion-brother -> ending-brother-accused
 *      (Unity's ConclusionDefinition "conclusion-brother", available only via
 *      REQ_BrotherCaseSupported). Inconclusive remains a selectable outcome but
 *      is not the supported one once the evidence is gathered.
 *
 *  1.0.0 stays registered and unchanged, so sessions stamped 1.0.0 (including
 *  any that reference EVD-017/EVD-019 or the wife conclusion) are still scored
 *  and explained against exactly that answer key. */
const RETIRED_EVIDENCE = new Set(["EVD-017", "EVD-019"]);
const REMAINING_RELATIONSHIPS = new Set([
  "REL-knife-consistent-wound",
  "REL-spatter-consistent-reconstruction",
  "REL-bottle-supports-brother",
]);

export const CSI_ENVIRONMENT_GROUND_TRUTH_V1_1: GroundTruth = {
  ...CSI_ENVIRONMENT_GROUND_TRUTH_V1,
  groundTruthVersion: "1.1.0",
  generatedAt: "2026-10-02T00:00:00Z",

  evidence: [
    { evidenceId: "EVD-014", relevance: "Critical" }, // Kitchen knife
    { evidenceId: "EVD-015", relevance: "Critical" }, // Blood spatter pattern
    { evidenceId: "EVD-018", relevance: "Relevant" }, // Empty liquor bottle - supporting context
  ],

  hypothesisCheckpoints: [
    {
      id: "HYP-02",
      reasoningOptions: [
        { id: "hyp02-print-needs-reconstruction", isCorrect: true },
        { id: "hyp02-print-proves-attacker", isCorrect: false },
        { id: "hyp02-bottle-intoxication", isCorrect: false },
        { id: "hyp02-knife-routine-use", isCorrect: false },
      ],
    },
    {
      id: "HYP-03",
      reasoningOptions: [
        { id: "hyp03-combined-physical-evidence", isCorrect: true },
        { id: "hyp03-knife-print-implicates-brother", isCorrect: false },
        { id: "hyp03-wound-alone", isCorrect: false },
        { id: "hyp03-bottle-premature-closure", isCorrect: false },
        { id: "hyp03-no-contradicting-evidence", isCorrect: false },
      ],
    },
  ],

  evidenceReportLines: CSI_ENVIRONMENT_GROUND_TRUTH_V1.evidenceReportLines.filter((r) => !RETIRED_EVIDENCE.has(r.evidenceId)),
  relationships: CSI_ENVIRONMENT_GROUND_TRUTH_V1.relationships.filter((r) => REMAINING_RELATIONSHIPS.has(r.relationshipId)),

  conclusion: {
    correctConclusionId: "conclusion-brother",
    correctEndingId: "ending-brother-accused",
  },
};
