import "server-only";
import catalogV1 from "./data/recorderDocumentation.v1.json" with {type:"json"};
import catalog from "./data/recorderDocumentation.v2.json" with {type:"json"};
import legacy from "./data/recorderLegacyStatements.v0.json" with {type:"json"};
import {payloadValue,type ScoringSessionEvent} from "./scoring/types.ts";

export interface RecorderStatement {id:string;text:string;selected:boolean;weight:number;earnedPoints:number}
export interface RecorderSubjectSnapshot {version:number;subjectId:string;subjectLabel:string;statements:RecorderStatement[];earnedPoints:number;maximumPossiblePoints:number}
export interface RecorderDocumentationRecord {
 subjects:Array<{id:string;label:string;selected:Array<{id:string;text:string;points:number|null}>;points:number|null;maximum:number|null}>;
 points:number|null;maximum:number|null;note:string|null;
}
const fail=():never=>{throw new Error("Invalid Recorder Documentation snapshot.");};
const catalogs:Record<string,typeof catalog>={"1":catalogV1,"2":catalog};

/** Check the frozen version's answer key; submitted sums are never trusted. */
export function validateRecorderDocumentation(events:ScoringSessionEvent[]):RecorderSubjectSnapshot[] {
 const records:RecorderSubjectSnapshot[]=[];const seen=new Set<string>();
 for(const event of events){
  const raw=payloadValue(event,"documentation"),version=payloadValue(event,"documentationVersion");
  if(raw===undefined&&version===undefined)continue;
  const answerKey=version!==undefined&&Object.hasOwn(catalogs,version)?catalogs[version]:undefined;
  if(event.eventType!=="ReportLinesSelected"||!event.targetId||!answerKey||!raw)return fail();
  if(["lineIds","lineCount","documentationVersion","documentation"].some(key=>event.payload.filter(p=>p.key===key).length!==1))return fail();
  const subject=answerKey.subjects.find(s=>s.id===event.targetId);if(!subject||seen.has(subject.id))return fail();
  let record:RecorderSubjectSnapshot;try{record=JSON.parse(raw) as RecorderSubjectSnapshot;}catch{return fail();}
  if(!record||record.version!==answerKey.version||record.subjectId!==subject.id||record.subjectLabel!==subject.label
   ||record.maximumPossiblePoints!==6||!Array.isArray(record.statements)||record.statements.length!==6)return fail();
  if(new Set(record.statements.map(s=>s?.id)).size!==6)return fail();
  let points=0;const selected:string[]=[];
  for(const statement of record.statements){
   const expected=subject.statements.find(s=>s.id===statement?.id);
   if(!expected||statement.text!==expected.text||typeof statement.selected!=="boolean"||statement.weight!==expected.weight
    ||statement.earnedPoints!==(statement.selected?expected.weight:0))return fail();
   if(statement.selected)selected.push(statement.id);points+=statement.earnedPoints;
  }
  const ids=(payloadValue(event,"lineIds")??"").split(",");
  if(selected.length!==3||ids.length!==3||new Set(ids).size!==3||ids.some(id=>!selected.includes(id))
   ||payloadValue(event,"lineCount")!=="3"||record.earnedPoints!==points)return fail();
  records.push(record);seen.add(subject.id);
 }
 return records;
}

/** Optional Recorder section: no new weights are assigned to historical entries. */
export function buildRecorderDocumentation(events:ScoringSessionEvent[],originalRows:Array<{subjectId:string;statementId:string}>=[]):RecorderDocumentationRecord {
 let snapshots:RecorderSubjectSnapshot[]=[];let invalid=false;
 try{snapshots=validateRecorderDocumentation(events);}catch{invalid=true;}
 const reports=events.filter(e=>e.eventType==="ReportLinesSelected"&&catalog.subjects.some(s=>s.id===e.targetId));
 const hasLegacy=reports.some(e=>!Object.hasOwn(catalogs,payloadValue(e,"documentationVersion")??""))
  ||originalRows.some(row=>catalog.subjects.some(s=>s.id===row.subjectId)&&!snapshots.some(s=>s.subjectId===row.subjectId));
 const current=snapshots.length>0&&!invalid;
 const subjects:RecorderDocumentationRecord["subjects"]=[];
 for(const subject of catalog.subjects){
  const snapshot=snapshots.find(s=>s.subjectId===subject.id);
  const report=reports.find(e=>e.targetId===subject.id);
  if(snapshot){subjects.push({id:subject.id,label:subject.label,selected:snapshot.statements.filter(s=>s.selected)
    .map(s=>({id:s.id,text:s.text,points:s.earnedPoints})),points:snapshot.earnedPoints,maximum:6});continue;}
  const original=originalRows.filter(row=>row.subjectId===subject.id);
  if(report||original.length){
   const ids=report?(payloadValue(report,"lineIds")??"").split(",").filter(Boolean):[...new Set(original.map(row=>row.statementId))];
   const old=legacy.subjects.find(s=>s.id===subject.id);
   subjects.push({id:subject.id,label:subject.label,selected:ids.map(id=>({id,text:old?.statements.find(s=>s.id===id)?.text??id,points:null})),points:null,maximum:null});
  }else if(current&&!hasLegacy)subjects.push({id:subject.id,label:subject.label,selected:[],points:0,maximum:6});
 }
 const scored=current&&!hasLegacy;
 return {subjects,points:scored?snapshots.reduce((sum,s)=>sum+s.earnedPoints,0):null,maximum:scored?24:null,
  note:invalid?"Recorder Documentation score unavailable: the saved scoring data could not be verified."
   :hasLegacy?"Recorder Documentation score unavailable: this session contains original entries without scoring data. Legacy wording is shown for known statement IDs; original wording was not captured."
   :!current?"Recorder Documentation score unavailable: statement scoring data was not captured.":null};
}
