import type {InstructorResultRow} from "./results.ts";
import {assessedScore} from "./assessmentPresentation.ts";

export const PERFORMANCE_COMPONENTS=[
 {key:"reasoningCheckpointComponent",label:"Reasoning",maximum:60},
 {key:"deductionRelationshipComponent",label:"Evidence relationships",maximum:25},
 {key:"finalConclusionComponent",label:"Final conclusion",maximum:15},
] as const;
const date=(value:string|null|undefined)=>value&&Number.isFinite(Date.parse(value))?Date.parse(value):0;
const played=(row:InstructorResultRow)=>date(row.startedAtUtc)||date(row.completedAtUtc)||date(row.serverReceivedAtUtc);
const newest=(a:InstructorResultRow,b:InstructorResultRow)=>played(b)-played(a)||date(b.serverReceivedAtUtc)-date(a.serverReceivedAtUtc)||a.sessionId.localeCompare(b.sessionId);
function latestPerStudent(rows:InstructorResultRow[]) {
 const seen=new Set<string>();
 return [...rows].sort(newest).filter(row=>{if(seen.has(row.studentId))return false;seen.add(row.studentId);return true;});
}
function componentValue(row:InstructorResultRow,key:string,maximum:number):number|null {
 const value=row.assessmentComponents?.[key];
 return typeof value==="number"&&Number.isFinite(value)&&value>=0&&value<=maximum?value:null;
}
export function instructorOverview(rows:InstructorResultRow[]) {
 const real=rows.filter(row=>!row.isTestSession);
 const attempts=new Map<string,InstructorResultRow[]>();
 for(const row of real){const key=JSON.stringify([row.studentId,row.scenarioId]);const group=attempts.get(key);if(group)group.push(row);else attempts.set(key,[row]);}
 const review=[...attempts.values()].map(group=>[...group].sort(newest)[0]).map(row=>{
  const reasons:string[]=[];let priority=3;
  if(!row.completedAtUtc){reasons.push("Received record is incomplete");priority=1;}
  if(row.verificationStatus==="requires_review"){reasons.push("Score requires verification review");priority=0;}
  else if(row.completedAtUtc&&assessedScore(row)===null){reasons.push("Final score is not verified");priority=Math.min(priority,2);}
  if(row.completedAtUtc&&assessedScore(row)!==null&&row.scoringVersion==="1.7.0")
   for(const component of PERFORMANCE_COMPONENTS){const value=componentValue(row,component.key,component.maximum);
    if(value!==null&&value/component.maximum<.5)reasons.push(`${component.label}: ${Number(value.toFixed(2))} / ${component.maximum}`);}
  return {row,reasons,priority,href:`/class-results/${encodeURIComponent(row.sessionId)}#${priority===3?"deduction-score":"session-information"}`};
 }).filter(item=>item.reasons.length).sort((a,b)=>a.priority-b.priority||newest(a.row,b.row));
 const groups=new Map<string,InstructorResultRow[]>();
 for(const row of real){if(!row.completedAtUtc||assessedScore(row)===null)continue;
  const key=JSON.stringify([row.scenarioId,row.scenarioVersion,row.scoringVersion??"unknown",row.groundTruthVersion??"unknown"]);
  const group=groups.get(key);if(group)group.push(row);else groups.set(key,[row]);
 }
 const cohorts=[...groups].map(([key,group])=>{
  const students=latestPerStudent(group),sample=students[0];
  const components=PERFORMANCE_COMPONENTS.map(component=>{
   const values=sample.scoringVersion==="1.7.0"?students.map(row=>componentValue(row,component.key,component.maximum)).filter((n):n is number=>n!==null):[];
   return {...component,count:values.length,average:values.length?values.reduce((sum,n)=>sum+n,0)/values.length:null};
  });
  return {key,scenario:sample.scenarioDisplayName,scenarioVersion:sample.scenarioVersion,scoringVersion:sample.scoringVersion??"Unknown",groundTruthVersion:sample.groundTruthVersion??"Unknown",
   students:students.length,average:students.reduce((sum,row)=>sum+assessedScore(row)!,0)/students.length,components,newest:played(sample)};
 }).sort((a,b)=>b.newest-a.newest||a.key.localeCompare(b.key));
 return {review,cohorts,studentCount:new Set(real.map(row=>row.studentId)).size};
}
