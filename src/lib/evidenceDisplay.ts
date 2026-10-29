import definition from "./data/evidenceDisplay.v1.json" with {type:"json"};
import {questionLabel,questionText} from "./questionDisplay.ts";

// Presentation only. Stable IDs, historical payloads and grading inputs stay intact.
export const EVIDENCE_DISPLAY = definition.entries;
const ids = /(?<![A-Za-z0-9])(?:fingerprint-sample:|blood-sample:)?(?:EVD-\d+|BODY-A)(?![A-Za-z0-9])/g;
export function evidenceLabel(id:string,fallback?:string):string {
  if(!id)return fallback??"Evidence";
  if(/^(?:HYP|RC|REL)-/.test(id))return questionLabel(id);
  for(const [prefix,label] of [["fingerprint-sample:","Fingerprint Sample"],["blood-sample:","Blood Sample"]])
    if(id.startsWith(prefix))return `${label} – ${evidenceLabel(id.slice(prefix.length))}`;
  const entry=[...definition.entries,...definition.legacyEntries].find(e=>e.id===id);
  if(entry)return entry.label;
  if(/^EVD-\d+$/.test(id)&&(!fallback||fallback===id))return "Unrecognized evidence";
  return evidenceText(fallback??id);
}
export function evidenceText(text:string):string {
  return questionText(text.replace(ids,id=>evidenceLabel(id)));
}
