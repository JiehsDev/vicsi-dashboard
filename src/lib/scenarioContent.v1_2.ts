// Public display content only; no scoring answer key. Historical maps remain in scenarioContent.ts.
import type { FindingContent, InsightContent, ConclusionContent, EndingContent } from "./scenarioContent.ts";
export const LAST_DRINK_CONTENT: {findings:Record<string,FindingContent>;insights:Record<string,InsightContent>;conclusions:Record<string,ConclusionContent>;endings:Record<string,EndingContent>;relationships:Record<string,string>} = {
  "findings": {
    "FIND-BODY-SHARP-WOUND": {
      "displayName": "Sharp-Edged Wound Documented"
    },
    "FIND-KNIFE-BLOOD-SAMPLED": {
      "displayName": "Blade Residue Sample Collected"
    },
    "FIND-KNIFE-PRINT-BROTHER": {
      "displayName": "Paul's Fingerprint Identified on Knife"
    },
    "FIND-KNIFE-WOUND-CONSISTENT": {
      "displayName": "Knife Consistent with Victim's Wound"
    },
    "FIND-SPATTER-RECONSTRUCTION": {
      "displayName": "Blood Pattern Supports Attack-Area Reconstruction"
    }
  },
  "insights": {
    "INSIGHT-KNIFE-BODY": {
      "displayName": "Knife May Be Relevant to the Injury",
      "description": "The victim's wound is consistent with the documented characteristics of the knife. The knife may have been involved in the attack, but this alone does not establish who used it.",
      "suggestedAction": "Compare the knife with handling evidence and the scene reconstruction."
    },
    "INSIGHT-KNIFE-PRINT-BROTHER": {
      "displayName": "Paul Handled the Knife",
      "description": "Paul's fingerprint was identified on the knife. It shows that he handled the object at some point, but does not establish when or why.",
    },
    "INSIGHT-SPATTER-BODY": {
      "displayName": "Attack Sequence Can Be Reconstructed",
      "description": "The blood pattern and the victim's wound can be considered together to reconstruct the likely movement and sequence of the attack.",
    },
    "INSIGHT-SPATTER-KNIFE": {
      "displayName": "Knife Can Be Compared with Scene Reconstruction",
      "description": "The blood-pattern reconstruction is compatible with an attack involving a sharp-edged object. The knife can now be evaluated alongside the reconstructed sequence.",
    }
  },
  "conclusions": {
    "CONCLUSION-BROTHER-HANDLED-KNIFE": {
      "displayName": "Paul Handled the Knife",
      "description": "The recovered fingerprint establishes that Paul handled the knife at some point. This does not establish when he handled it or whether he used it during the attack.",
      "level": "Factual"
    },
    "CONCLUSION-BROTHER-HANDLED-POSSIBLE-WEAPON": {
      "displayName": "Paul Handled a Knife Consistent with John's Injury",
      "description": "Paul's fingerprint was recovered from a knife whose characteristics are consistent with the victim's wound. This strengthens the knife's relevance but still does not establish that Paul carried out the attack.",
      "level": "Interpretive"
    },
    "conclusion-brother": {
      "displayName": "Paul",
      "description": "Paul is a reasonable person of interest, but an accusation must rest on the combined physical evidence rather than his fingerprint alone.",
      "level": "Case"
    },
    "CONCLUSION-INCONCLUSIVE": {
      "displayName": "Inconclusive",
      "description": "The current findings do not provide enough consistent evidence to identify the responsible person with confidence. Leaving the case unresolved is more defensible than making an unsupported accusation.",
      "level": "Case"
    },
    "CONCLUSION-KNIFE-CONSISTENT-WEAPON": {
      "displayName": "The Knife Is Consistent with the Victim's Injury",
      "description": "The documented knife characteristics are consistent with the sharp-edged wound observed on the victim. This supports the knife as a possible weapon but does not identify who used it.",
      "level": "Factual"
    },
    "conclusion-peter": {
      "displayName": "Peter",
      "description": "Peter's late departure and uneasy appearance justify further investigation, but an accusation still requires evidence connecting him to the attack.",
      "level": "Case"
    }
  },
  "endings": {
    "ending-brother-accused": {
      "title": "Paul — Supported Accusation"
    },
    "ending-inconclusive": {
      "title": "Inconclusive"
    },
    "ending-peter-unsupported": {
      "title": "Peter — Unsupported Accusation"
    },
    "ending-premature-submission": {
      "title": "Paul — Insufficiently Supported Accusation"
    }
  },
  "relationships": {
    "REL-paul-timeline-contradiction": "Paul’s Account Contradicts the Vendor’s 3AM Observation",
    "REL-bottle-supports-brother": "Bottle Corroborates Paul's Earlier Presence",
    "REL-knife-consistent-wound": "Knife Consistent with Victim's Wound",
    "REL-paul-print-handled-knife": "Paul's Print Shows Prior Knife Handling",
    "REL-peter-departure-supported": "Vendor Observation Supports Peter's Departure Account",
    "REL-spatter-consistent-reconstruction": "Bloodstain Pattern Supports Attack Location"
  }
};
