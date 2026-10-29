import definition from "./data/questionDisplay.v1.json" with {type:"json"};

// Display only: source IDs and frozen scoring inputs are never rewritten.
export function questionLabel(id:string, currentOrder:readonly string[]=definition.current):string {
  if(id==="FINAL-CONCLUSION")return "Final Conclusion";
  let index=currentOrder.indexOf(id);
  if(index<0)index=definition.legacy.indexOf(id);
  if(index>=0)return `Reasoning Question ${index+1}`;
  const source=currentOrder.find(idPrefix=>id.startsWith(`${idPrefix}-`));
  if(source)return `${questionLabel(source,currentOrder)} – Answer ${id.slice(source.length+1).replaceAll("-"," ")}`;
  const relationship=definition.relationships.find(r=>r.id===id);
  if(relationship)return relationship.label;
  if(id.startsWith("REL-"))return `Evidence Relationship: ${id.slice(4).replaceAll("-"," ")}`;
  const number=/^(?:HYP|RC)-(\d+)(?:-|$)/.exec(id);
  return number&&Number(number[1])>0?`Reasoning Question ${Number(number[1])}`:"Reasoning Checkpoint";
}

export function questionText(text:string):string {
  return text.replace(/(?<![A-Za-z0-9_])(?:HYP-[A-Za-z0-9-]+|RC-[A-Za-z0-9-]+|REL-[A-Za-z0-9-]+)(?![A-Za-z0-9_])/g,id=>questionLabel(id))
    .replaceAll("Hypothesis Checkpoint","Reasoning Checkpoint")
    .replaceAll("Submit Hypothesis & Reasoning","Confirm Answer");
}
