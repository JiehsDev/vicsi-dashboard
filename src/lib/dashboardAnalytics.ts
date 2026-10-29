import type { ResultDetail, ResultSummary, InstructorResultRow } from "./results.ts";
import { assessedScore } from "./assessmentPresentation.ts";
import { trainingAnalytics } from "./trainingAnalytics.ts";

export const viewNames:Record<string,string>={overview:"Overview",students:"Students",sessions:"Sessions",reasoning:"Reasoning Development",relationships:"Evidence Relationships",training:"Training Analytics"};
export function selectedView(raw?:string){return raw && Object.hasOwn(viewNames,raw)?raw:"overview";}
export function scoreSummary(rows:ResultSummary[]) {
  const versions=new Set(rows.map(r=>r.scoringVersion??"Unknown"));
  const assessed=rows.map(assessedScore).filter((x):x is number=>x!==null && x>=0 && x<=100);
  return {versions:[...versions],average:versions.size===1&&assessed.length?assessed.reduce((a,b)=>a+b,0)/assessed.length:null,assessed:assessed.length,
    bins:["0–39","40–59","60–79","80–100"].map((label,i)=>({id:String(i),label,value:assessed.filter(x=>i===0?x<40:i===1?x>=40&&x<60:i===2?x>=60&&x<80:x>=80).length}))};
}
export function latestStudents(rows:InstructorResultRow[]) {
  const groups=new Map<string,{latest:InstructorResultRow;attempts:number}>();
  for(const row of rows){const key=`${row.studentId}:${row.classId}`,old=groups.get(key);if(!old)groups.set(key,{latest:row,attempts:1});else{old.attempts++;if(row.serverReceivedAtUtc>old.latest.serverReceivedAtUtc)old.latest=row;}}
  return [...groups.values()].sort((a,b)=>a.latest.studentDisplayName.localeCompare(b.latest.studentDisplayName));
}
export function assessmentAnalysis(details:ResultDetail[]) {
  const blockedNames:Record<string,string>={EvidenceTransitionBlocked:"Evidence processing prerequisite",EvidenceDepositBlocked:"Evidence custody prerequisite",MarkerReclaimBlocked:"Marker retrieval prerequisite",EvidenceMarkerRejected:"Evidence marker placement",BodyRemovalBlocked:"Body removal prerequisite",EvidencePairMeasurementRejected:"Evidence pair measurement"};
  const checkpoints=new Map<string,{id:string;label:string;value:number;maximum:number;weak:Map<string,number>}>();
  const relationships=new Map<string,{id:string;label:string;value:number;maximum:number;weak:Map<string,number>}>();
  const blocked=new Map<string,number>(),guidance=new Map<string,number>(),steps=new Map<string,{label:string;recorded:number;missing:number}>();
  let eligibleSessions=0;
  for(const detail of details){
    const view=detail.assessment;
    if(view?.finalized){eligibleSessions++;
      for(const c of view.checkpoints){if(c.strength===undefined)continue;const item=checkpoints.get(c.id)??{id:c.id,label:c.dimension,value:0,maximum:0,weak:new Map()};item.maximum++;if(c.strength>=3)item.value++;else item.weak.set(c.response,(item.weak.get(c.response)??0)+1);checkpoints.set(c.id,item);}
      for(const r of view.relationships){if(!["Supported","Unsupported"].includes(r.support))continue;const item=relationships.get(r.id)??{id:r.id,label:r.label,value:0,maximum:0,weak:new Map()};item.maximum++;if(r.support==="Supported")item.value++;else{const label=r.interpretation??"Historical connection — interpretation unavailable";item.weak.set(label,(item.weak.get(label)??0)+1);}relationships.set(r.id,item);}
    }
    const t=trainingAnalytics(detail);
    for(const e of t.timeline){if(e.label==="Premature action blocked"){const label=e.eventType;blocked.set(label,(blocked.get(label)??0)+1);}if(e.eventType==="SketchPlacementHintShown"||e.eventType==="ProcedureOutOfOrder")guidance.set(e.label,(guidance.get(e.label)??0)+1);}
    for(const step of t.steps){const item=steps.get(step.eventType)??{label:step.label,recorded:0,missing:0};if(step.status==="Completed")item.recorded++;else item.missing++;steps.set(step.eventType,item);}
  }
  const ranked=(items:typeof checkpoints)=>[...items.values()].sort((a,b)=>a.value/a.maximum-b.value/b.maximum).map(i=>({...i,detail:[...i.weak].sort((a,b)=>b[1]-a[1]).slice(0,2).map(([text,n])=>`${n} response${n===1?"":"s"}: ${text}`).join(" · ")}));
  return {eligibleSessions,checkpoints:ranked(checkpoints),relationships:ranked(relationships),blocked:[...blocked].sort((a,b)=>b[1]-a[1]).map(([id,value])=>({id,label:blockedNames[id]??id,value})),guidance:[...guidance].map(([label,value])=>({id:label,label,value})),steps:[...steps].map(([id,s])=>({id,label:s.label,value:s.recorded,maximum:s.recorded+s.missing,detail:`${s.missing} attempts without a recorded completion; absence may reflect limited logging.`}))};
}
