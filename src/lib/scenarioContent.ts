// src/lib/scenarioContent.ts
//
// CENTRALIZED, ISOLATED ID -> DISPLAY-NAME RESOLVER for the ViCSI reasoning
// layer (Findings, Insights, Case Conclusions, Endings, Relationships,
// Evidence). This is the ONE place any of those five id spaces gets turned
// into player/instructor-facing text anywhere in this app — no component or
// route should ever inline a per-id string comparison itself (the exact
// anti-pattern the Reasoning Dashboard Integration task explicitly warns
// against). Every resolver here degrades to a safe, readable fallback for an
// id it doesn't recognize (never throws, never renders a raw enum-looking
// string as-is where a fallback can read better) — see resolveUnknown below.
//
// TEMPORARY HAND-TRANSCRIBED MAPPING, clearly isolated to this one file, per
// that task's own explicit allowance ("a temporary centralized mapping file
// is acceptable if necessary, but it must be isolated and clearly
// documented"). Source of truth is the Unity project's own authored assets —
// every string below was copied verbatim from:
//   Assets/_Project/Data/Findings/*.asset            (FindingDefinition)
//   Assets/_Project/Data/Insights/*.asset             (InsightDefinition)
//   Assets/_Project/Data/Conclusions/*.asset          (ConclusionDefinition)
//   Assets/_Project/Data/Ending/Endings_CSI_Environment.asset (EndingDefinition)
//   Assets/_Project/Data/Relationships/CSI_Environment/*.asset (RelationshipDefinition)
//   Assets/_Project/Data/Evidence/*.asset             (EvidenceDefinition)
// in the sibling Unity repository (not this one) — this repo has no live
// connection to Unity's own asset database, so nothing here can be generated
// automatically today. If a scenario's authored content ever changes on the
// Unity side, this file goes stale silently (no build-time check catches
// it) — whoever edits those assets next should update the matching entry
// here in the same change. A future improvement would export this content
// from Unity (mirroring how csiEnvironment.v1.ts's own header already
// documents doing this by hand for ground-truth data) rather than hand-sync
// two repos indefinitely; out of scope for this pass.
//
// Scoped to CSI-ENVIRONMENT-001 only, same as csiEnvironment.v1.ts's own
// ground truth — if a second scenario is ever added, key every map below by
// scenarioId first (or split into a per-scenario file the same way
// src/lib/scoring/data/ already does), rather than assuming id-namespace
// collisions can never happen across scenarios.

export interface FindingContent {
  displayName: string;
}

export interface InsightContent {
  displayName: string;
  description: string;
  suggestedAction?: string;
}

export interface ConclusionContent {
  displayName: string;
  description: string;
  level: "Factual" | "Interpretive" | "Case";
}

export interface EndingContent {
  title: string;
}

const FINDINGS: Record<string, FindingContent> = {
  "FIND-BODY-SHARP-WOUND": { displayName: "Sharp-Edged Wound Identified" },
  "FIND-KNIFE-WOUND-CONSISTENT": { displayName: "Knife Consistent with Victim's Wound" },
  "FIND-KNIFE-PRINT-BROTHER": { displayName: "Brother's Fingerprint Identified on Knife" },
  "FIND-KNIFE-BLOOD-SAMPLED": { displayName: "Blade Residue Sample Collected" },
  "FIND-SPATTER-RECONSTRUCTION": { displayName: "Blood Pattern Supports Scene Reconstruction" },
  "FIND-PHONE-AFFAIR": { displayName: "Affair-Related Messages Found" },
  "FIND-GLOVES-BLOOD-VICTIM": { displayName: "Victim's Blood Identified on Gloves" },
  "FIND-GLOVES-HIDDEN": { displayName: "Gloves Were Concealed" },
  "FIND-GLOVES-PRINT-WIFE": { displayName: "Wife's Fingerprint Identified Inside Gloves" },
  // Internal dev/smoke-test fixture only (FindingStateManager.sceneFindingDefinitions) —
  // never real case content. Resolved here so it renders as something readable
  // if it ever leaks into a session instead of a raw id, but callers that
  // build "confirmed findings" lists for display should filter it out first,
  // matching CompletionScreenUI.TestOnlyFindingId's own exclusion on the Unity side.
  "FIND-TEST-HARMLESS": { displayName: "Test Finding (Foundation Validation Only)" },
};

const INSIGHTS: Record<string, InsightContent> = {
  "INSIGHT-KNIFE-BODY": {
    displayName: "Knife May Be Relevant to the Injury",
    description:
      "The victim's wound is consistent with the documented characteristics of the knife. The knife may have been involved in the attack, but this alone does not establish who used it.",
    suggestedAction: "Compare the knife with handling evidence and the scene reconstruction.",
  },
  "INSIGHT-KNIFE-PRINT-BROTHER": {
    displayName: "Brother Handled the Knife",
    description:
      "The brother's fingerprint was identified on the knife. This confirms contact with the object, but does not establish when or why he handled it.",
  },
  "INSIGHT-GLOVES-BLOOD": {
    displayName: "Blood-Bearing Gloves Require Further Examination",
    description:
      "The victim's blood was identified on the outside of the gloves. Determining who handled or wore them may help explain their role in the incident.",
    suggestedAction: "Examine the inside of the gloves for handling traces.",
  },
  "INSIGHT-GLOVES-BLOOD-KNIFE-PRINT": {
    displayName: "Handling Evidence Requires Comparison",
    description:
      "The victim's blood was identified on the gloves, while the brother's fingerprint was recovered from the knife. The fingerprint on the knife may not fully explain who used it during the incident. Examining who wore the gloves may clarify the handling evidence.",
    suggestedAction: "Examine the inside of the gloves for fingerprints.",
  },
  "INSIGHT-GLOVES-WIFE-PRINT": {
    displayName: "Wife Associated with Gloves",
    description:
      "A fingerprint associated with the wife was recovered from inside the gloves. This suggests that she handled or wore them, but does not by itself establish her role in the attack.",
  },
  "INSIGHT-GLOVES-BLOOD-WIFE-PRINT": {
    displayName: "Wife Associated with Blood-Bearing Gloves",
    description:
      "The victim's blood is present on the outside of the gloves, while a fingerprint associated with the wife was recovered from inside. Together, these findings create a stronger connection between the wife, the gloves, and the victim.",
  },
  "INSIGHT-GLOVES-HIDDEN-WIFE-PRINT": {
    displayName: "Concealed Gloves Connected to Wife",
    description:
      "The concealed gloves contain a fingerprint associated with the wife. Their hidden location may be relevant when evaluating her account of events.",
    suggestedAction: "Compare this finding with the wife's statement.",
  },
  "INSIGHT-KNIFE-PRINT-GLOVES-WIFE": {
    displayName: "Handling Evidence Points to Different Individuals",
    description:
      "The brother's fingerprint was recovered from the knife, while the wife's fingerprint was recovered from inside the gloves. The evidence connects different individuals to different objects, so object handling should not be treated as direct proof of who committed the attack.",
  },
  "INSIGHT-PHONE-AFFAIR": {
    displayName: "Possible Motive Context",
    description:
      "The phone records indicate a personal relationship outside the marriage. This may provide motive context, but motive alone does not establish responsibility.",
  },
  "INSIGHT-PHONE-AFFAIR-GLOVES-WIFE": {
    displayName: "Motive Context and Physical Evidence",
    description:
      "The phone records provide possible motive context, while the gloves provide a separate physical connection to the wife. These findings should be evaluated independently before drawing a case conclusion.",
  },
  "INSIGHT-SPATTER-BODY": {
    displayName: "Attack Sequence Can Be Reconstructed",
    description:
      "The blood pattern and the victim's wound can be considered together to reconstruct the likely movement and sequence of the attack.",
  },
  "INSIGHT-SPATTER-KNIFE": {
    displayName: "Knife Can Be Compared with Scene Reconstruction",
    description:
      "The blood-pattern reconstruction is compatible with an attack involving a sharp-edged object. The knife can now be evaluated alongside the reconstructed sequence.",
  },
};

const CONCLUSIONS: Record<string, ConclusionContent> = {
  "CONCLUSION-BROTHER-HANDLED-KNIFE": {
    displayName: "The Brother Handled the Knife",
    description:
      "The recovered fingerprint establishes that the brother handled the knife at some point. This does not establish when he handled it or whether he used it during the attack.",
    level: "Factual",
  },
  "CONCLUSION-KNIFE-CONSISTENT-WEAPON": {
    displayName: "The Knife Is Consistent with the Victim's Injury",
    description:
      "The documented knife characteristics are consistent with the sharp-edged wound observed on the victim. This supports the knife as a possible weapon but does not identify who used it.",
    level: "Factual",
  },
  "CONCLUSION-WIFE-HANDLED-GLOVES": {
    displayName: "The Wife Handled or Wore the Gloves",
    description:
      "The fingerprint recovered from inside the gloves associates the wife with the gloves, but does not by itself establish her role in the attack.",
    level: "Factual",
  },
  "CONCLUSION-GLOVES-CONTACTED-VICTIM-BLOOD": {
    displayName: "The Gloves Came into Contact with the Victim's Blood",
    description: "Analysis of the outer glove surface identified blood consistent with the victim.",
    level: "Factual",
  },
  "CONCLUSION-BROTHER-HANDLED-POSSIBLE-WEAPON": {
    displayName: "The Brother Handled a Knife Consistent with the Victim's Injury",
    description:
      "The brother's fingerprint was recovered from a knife whose characteristics are consistent with the victim's wound. This strengthens the knife's relevance but still does not establish that the brother carried out the attack.",
    level: "Interpretive",
  },
  "CONCLUSION-WIFE-WORE-BLOOD-BEARING-GLOVES": {
    displayName: "The Wife Is Associated with the Blood-Bearing Gloves",
    description:
      "The wife's fingerprint was identified inside gloves that carried blood consistent with the victim. This creates a stronger physical association, but should still be considered with the rest of the scene evidence.",
    level: "Interpretive",
  },
  "CONCLUSION-HANDLING-EVIDENCE-COMPETING": {
    displayName: "The Handling Evidence Supports Multiple Possible Interpretations",
    description:
      "The brother is associated with the knife while the wife is associated with the gloves. Object handling alone does not identify who carried out the attack.",
    level: "Interpretive",
  },
  "CONCLUSION-WIFE-INVOLVEMENT": {
    displayName: "The Evidence Supports the Wife's Involvement",
    description:
      "Multiple independent findings and completed deductions connect the wife to the blood-bearing gloves and conflict with her account of events.",
    level: "Case",
  },
  "CONCLUSION-INCONCLUSIVE": {
    displayName: "The Available Evidence Is Inconclusive",
    description:
      "The current findings do not provide enough consistent evidence to identify the responsible person with confidence.",
    level: "Case",
  },
};

const ENDINGS: Record<string, EndingContent> = {
  "ending-wife-convicted": { title: "Wife Convicted" },
  "ending-wife-suspected-insufficient": { title: "Wife Suspected, Insufficient Evidence" },
  "ending-brother-accused": { title: "Brother Accused" },
  "ending-inconclusive": { title: "Inconclusive" },
  "ending-premature-submission": { title: "Premature Submission" },

  // Pre-migration legacy ids (see AssessmentSessionUploadDto/EndingManager's
  // own "conclusion-wife" -> "CONCLUSION-WIFE-INVOLVEMENT" migration on the
  // Unity side) — a session uploaded before that migration may still carry
  // these. Mapped to the SAME titles as their modern equivalents so an old
  // session renders identically to a new one, never as an unknown id.
  "conclusion-wife": { title: "Wife Convicted" },
  "conclusion-brother": { title: "Brother Accused" },
  "conclusion-inconclusive": { title: "Inconclusive" },
};

const RELATIONSHIPS: Record<string, string> = {
  "REL-knife-consistent-wound": "Knife Consistent with Victim's Wound",
  "REL-spatter-consistent-reconstruction": "Blood Spatter Supports Scene Reconstruction",
  "REL-physical-contradicts-wife": "Scene Reconstruction Contradicts Wife's Account",
  "REL-gloves-blood-matches-victim": "Gloves Blood Matches Victim",
  "REL-gloves-fingerprint-identifies-wife": "Gloves Fingerprint Identifies Wife",
  "REL-hidden-gloves-contradicts-wife": "Hidden Gloves Contradict Wife's Account",
  // No displayName authored on the Unity asset (RelationshipDefinition.displayName
  // is blank) — not referenced by any Case-level conclusion, so it never appears
  // in a "supporting evidence" section, only in the full relationship list.
  "REL-bottle-supports-brother": "Bottle Supports Brother's Account",
};

const EVIDENCE: Record<string, string> = {
  "EVD-014": "Kitchen knife",
  "EVD-015": "Blood spatter pattern",
  "EVD-017": "Victim's mobile phone",
  "EVD-018": "Empty liquor bottle",
  "EVD-019": "Disposable gloves",
  "BODY-A": "Victim's body",
};

/** Turns an unrecognized id into a readable-enough fallback instead of
 *  showing the raw string verbatim or crashing — e.g. "CONCLUSION-FOO-BAR"
 *  becomes "Foo Bar". Used by every resolver below for a miss. Never throws
 *  on a malformed/empty id. */
function resolveUnknown(id: string, stripPrefix?: RegExp): string {
  if (!id) return "Unknown";
  const withoutPrefix = stripPrefix ? id.replace(stripPrefix, "") : id;
  return withoutPrefix
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function resolveFindingName(id: string): string {
  return FINDINGS[id]?.displayName ?? resolveUnknown(id, /^FIND-/);
}

export function resolveInsight(id: string): InsightContent {
  return INSIGHTS[id] ?? { displayName: resolveUnknown(id, /^INSIGHT-/), description: "" };
}

export function resolveConclusion(id: string): ConclusionContent {
  return CONCLUSIONS[id] ?? { displayName: resolveUnknown(id, /^CONCLUSION-/), description: "", level: "Case" };
}

export function resolveEndingTitle(id: string): string {
  return ENDINGS[id]?.title ?? resolveUnknown(id, /^ending-/i);
}

export function resolveRelationshipName(id: string): string {
  return RELATIONSHIPS[id] ?? resolveUnknown(id, /^REL-/);
}

export function resolveEvidenceName(id: string): string {
  return EVIDENCE[id] ?? resolveUnknown(id);
}

/** True for the internal dev/smoke-test finding — see FINDINGS' own comment.
 *  Callers building a player/instructor-facing "confirmed findings" list
 *  should filter this out first. */
export function isTestOnlyFinding(findingId: string): boolean {
  return findingId === "FIND-TEST-HARMLESS";
}
