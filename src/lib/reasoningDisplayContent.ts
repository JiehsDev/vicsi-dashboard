// Authored Last Drink checkpoint text, content version 1.0.0. No scoring weights.
export const REASONING_DISPLAY_CONTENT: Record<string, {prompt:string;category:string;responses:Record<string,string>}> = {
  "RC-01-PETER": {
    "prompt": "Based on what you know so far, what do you make of Peter leaving the house looking nervous?",
    "category": "EVIDENCE_CAUTION",
    "responses": {
      "RC-01-PETER-A": "Peter probably did it. Leaving nervously after being with John is enough to make him the main suspect.",
      "RC-01-PETER-B": "Peter could be involved. His behavior makes him worth looking into, but I need more information.",
      "RC-01-PETER-C": "I would not treat nervous behavior as proof of guilt. It gives me a reason to ask questions, not a reason to accuse him.",
      "RC-01-PETER-D": "I don't think Peter matters to the investigation."
    }
  },
  "RC-02-SCENE": {
    "prompt": "What can you reasonably conclude from the scene at this point?",
    "category": "SCENE_INTERPRETATION",
    "responses": {
      "RC-02-SCENE-A": "The knife near John must be the murder weapon.",
      "RC-02-SCENE-B": "The knife and blood are important, but they still need proper examination before I can say what happened.",
      "RC-02-SCENE-C": "There isn't enough here to justify further forensic examination.",
      "RC-02-SCENE-D": "The scene suggests a violent incident, but I still need the physical evidence to understand it."
    }
  },
  "RC-03-FINGERPRINT": {
    "prompt": "Paul's fingerprint was recovered from the knife. What does that tell you?",
    "category": "LIMITATION_RECOGNITION",
    "responses": {
      "RC-03-FINGERPRINT-A": "Paul must have used the knife to attack John.",
      "RC-03-FINGERPRINT-B": "It makes Paul more suspicious, but I still need other evidence before deciding what the print means in this case.",
      "RC-03-FINGERPRINT-C": "It shows Paul handled the knife at some point, but the print alone doesn't tell me when he touched it or what he did with it.",
      "RC-03-FINGERPRINT-D": "The fingerprint doesn't matter because Paul knew John."
    }
  },
  "RC-04-KNIFE-WOUND": {
    "prompt": "The knife is consistent with John's wound. How should that finding be interpreted?",
    "category": "RELATIONSHIP_REASONING",
    "responses": {
      "RC-04-KNIFE-WOUND-A": "This proves the knife was used to kill John.",
      "RC-04-KNIFE-WOUND-B": "The knife could be the weapon because its characteristics are consistent with the wound, but that relationship alone does not prove who used it.",
      "RC-04-KNIFE-WOUND-C": "The knife is probably involved, but I would still want the other findings before relying on it.",
      "RC-04-KNIFE-WOUND-D": "If the knife fits the wound, whoever touched it must be the attacker."
    }
  },
  "RC-05-TIMELINE": {
    "prompt": "The vendor says he saw Paul near John's house around three in the morning. How does that affect Paul's account?",
    "category": "TIMELINE_REASONING",
    "responses": {
      "RC-05-TIMELINE-A": "It proves Paul came back and killed John.",
      "RC-05-TIMELINE-B": "It makes Paul's story questionable because the vendor's observation conflicts with his claim that he never returned.",
      "RC-05-TIMELINE-C": "It makes Paul more suspicious, but the vendor still did not see him enter the house or attack John.",
      "RC-05-TIMELINE-D": "It doesn't matter because the vendor didn't witness the attack."
    }
  },
  "RC-06-BLOODSTAIN": {
    "prompt": "What does the bloodstain finding contribute to the case?",
    "category": "EVIDENCE_INTEGRATION",
    "responses": {
      "RC-06-BLOODSTAIN-A": "It identifies Paul as the attacker.",
      "RC-06-BLOODSTAIN-B": "It helps establish where the attack occurred, but it does not identify the attacker by itself.",
      "RC-06-BLOODSTAIN-C": "It supports the physical reconstruction of what happened near John, but it still needs to be considered with the other evidence.",
      "RC-06-BLOODSTAIN-D": "The blood only confirms that John was injured, so it adds nothing else."
    }
  }
};
