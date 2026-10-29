import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {renderToStaticMarkup} from "react-dom/server";
import catalogV1 from "../data/recorderDocumentation.v1.json" with {type:"json"};
import catalog from "../data/recorderDocumentation.v2.json" with {type:"json"};
import {buildRecorderDocumentation,validateRecorderDocumentation,type RecorderSubjectSnapshot} from "../recorderDocumentation.ts";
import {buildEducationalRecord,procedureTimeline} from "../sessionRecord.ts";
import {SessionRecord} from "../../components/SessionRecord.tsx";
import {currentInput} from "./sessionRecord.fixture.ts";
import {resultFor,eventsFor,rules} from "./assessmentPresentation.fixture.ts";
import {POST} from "../../app/api/v1/assessment-sessions/route.ts";
import {resetFixture} from "../../../Tools/testing/session-api-fixture.ts";
import {getResultDetail} from "../results.ts";
import type {ScoringSessionEvent} from "../scoring/types.ts";

function report(index:number,supported=3,answerKey=catalog):ScoringSessionEvent {
 const subject=answerKey.subjects[index];
 const selected=[...subject.statements.filter(s=>s.weight===2).slice(0,supported),...subject.statements.filter(s=>s.weight===0).slice(0,3-supported)].map(s=>s.id);
 const statements=subject.statements.map(s=>({...s,selected:selected.includes(s.id),earnedPoints:selected.includes(s.id)?s.weight:0}));
 const data={version:answerKey.version,subjectId:subject.id,subjectLabel:subject.label,statements,earnedPoints:statements.reduce((n,s)=>n+s.earnedPoints,0),maximumPossiblePoints:6};
 return {sequenceNumber:1000+index,timestampMs:110000+index,eventType:"ReportLinesSelected",targetId:subject.id,payload:[
  {key:"lineIds",value:selected.join(",")},{key:"lineCount",value:"3"},{key:"documentationVersion",value:String(answerKey.version)},{key:"documentation",value:JSON.stringify(data)}]};
}
test("catalog has only four active subjects, six choices each, three 2-point and three 0-point statements",()=>{
 assert.deepEqual(catalog.subjects.map(s=>s.id),["BODY-A","EVD-014","EVD-015","EVD-018"]);
 assert.equal(catalog.requiredSelections,3);assert.equal(catalog.maximumPerSubject,6);assert.equal(catalog.maximumTotal,24);
 for(const subject of catalog.subjects){assert.equal(subject.statements.length,6);assert.equal(new Set(subject.statements.map(s=>s.id)).size,6);
  assert.equal(subject.statements.filter(s=>s.weight===2).length,3);assert.equal(subject.statements.filter(s=>s.weight===0).length,3);}
 if(process.env.VICSI_UNITY_PROJECT)for(const key of [catalogV1,catalog])assert.deepEqual(key,JSON.parse(readFileSync(`${process.env.VICSI_UNITY_PROJECT}/Assets/Resources/RecorderDocumentation_v${key.version}.json`,"utf8")));
});

test("original and revised wording retain separate answer keys and frozen historical text",()=>{
 for(const key of [catalogV1,catalog]){
  const events=key.subjects.map((_,i)=>report(i,3,key));
  const records=validateRecorderDocumentation(events);
  assert.equal(buildRecorderDocumentation(events).points,24);
  assert.ok(records.every(r=>r.version===key.version));
  assert.equal(records[0].statements[0].text,key.subjects[0].statements[0].text);
 }
 assert.equal(buildRecorderDocumentation([report(0,3,catalogV1),report(1),report(2),report(3)]).points,24);
 const changedVersion=report(0,3,catalogV1);
 changedVersion.payload.find(p=>p.key==="documentationVersion")!.value="2";
 assert.throws(()=>validateRecorderDocumentation([changedVersion]));
 const wrongWording=report(0);
 const field=wrongWording.payload.find(p=>p.key==="documentation")!;
 const data=JSON.parse(field.value);data.statements[0].text=catalogV1.subjects[0].statements[0].text;field.value=JSON.stringify(data);
 assert.throws(()=>validateRecorderDocumentation([wrongWording]));
});
test("separate total covers perfect, unsupported and mixed selections without changing deduction",()=>{
 assert.equal(buildRecorderDocumentation(catalog.subjects.map((_,i)=>report(i))).points,24);
 assert.equal(buildRecorderDocumentation(catalog.subjects.map((_,i)=>report(i,0))).points,0);
 const events=[report(0,2),report(1,3),report(2,1),report(3,3)];const result=resultFor(currentInput());
 const before=buildEducationalRecord(result);result.events.push(...events);const after=buildEducationalRecord(result);
 assert.equal(after.recorder.points,18);assert.equal(after.recorder.maximum,24);assert.deepEqual(after.components,before.components);assert.equal(after.score,before.score);
 assert.deepEqual(after.recorder.subjects.map(s=>s.points),[4,6,2,6]);
});
test("server rejects changed weights, text, totals, cross-subject IDs, repeated confirmations and invalid selections",()=>{
 for(const mutate of [
  (d:RecorderSubjectSnapshot)=>{d.statements[0].weight=99;},(d:RecorderSubjectSnapshot)=>{d.earnedPoints=24;},(d:RecorderSubjectSnapshot)=>{d.statements[0].text="Forged";},
  (d:RecorderSubjectSnapshot)=>{d.maximumPossiblePoints=24;},(d:RecorderSubjectSnapshot)=>{d.statements[0].id="witness-statement";},
  (d:RecorderSubjectSnapshot)=>{d.statements[0].selected=!d.statements[0].selected;},(d:RecorderSubjectSnapshot)=>{d.subjectId="EVD-019";}
 ]){const e=report(0);const field=e.payload.find(p=>p.key==="documentation")!;const data=JSON.parse(field.value);mutate(data);field.value=JSON.stringify(data);assert.throws(()=>validateRecorderDocumentation([e]));}
 assert.throws(()=>validateRecorderDocumentation([report(0),{...report(0),sequenceNumber:1004}]));
 const e=report(0);e.targetId="witness";assert.throws(()=>validateRecorderDocumentation([e]));
 const duplicate=report(0);duplicate.payload.push({...duplicate.payload[0]});assert.throws(()=>validateRecorderDocumentation([duplicate]));
});
test("student and professor render the same compact Recorder section and separate deduction score",()=>{
 const result=resultFor(currentInput());result.events.push(report(0,2),report(1),report(2,1),report(3));
 for(const instructor of [false,true]){const html=renderToStaticMarkup(<SessionRecord result={result} instructor={instructor}/>);
  assert.match(html,/Recorder Documentation Score/);assert.match(html,/18 \/ 24/);assert.match(html,/Deduction score/);assert.match(html,/100%/);
  const section=html.slice(html.indexOf("Recorder Documentation"),html.indexOf("Deduction questions"));
  assert.equal((section.match(/Subtotal:/g)??[]).length,4);assert.equal((section.match(/points<\/span>/g)??[]).length,12);
  assert.doesNotMatch(section,/rec-body-|rec-knife-|rec-spatter-|rec-bottle-/);}
});
test("one Recorder timeline row per subject, historical text retained without manufactured points",()=>{
 assert.equal(procedureTimeline(catalog.subjects.map((_,i)=>report(i))).length,4);
 const old:ScoringSessionEvent={sequenceNumber:1,timestampMs:100,eventType:"ReportLinesSelected",targetId:"BODY-A",payload:[{key:"lineIds",value:"body-a-location,body-a-position,body-a-wound-sharp-object"}]};
 const view=buildRecorderDocumentation([old]);assert.equal(view.points,null);assert.equal(view.subjects[0].selected.length,3);
 assert.match(view.subjects[0].selected[0].text,/kitchen floor/);assert.ok(view.subjects[0].selected.every(s=>s.points===null));
 assert.equal(buildRecorderDocumentation([]).points,null);
 const original=buildRecorderDocumentation([],[{subjectId:"BODY-A",statementId:"body-a-location"}]);
 assert.equal(original.points,null);assert.match(original.subjects[0].selected[0].text,/kitchen floor/);assert.equal(original.subjects[0].selected[0].points,null);
 const corrupt=report(0);corrupt.payload.find(p=>p.key==="documentation")!.value="{bad";
 assert.equal(buildRecorderDocumentation([corrupt]).points,null);
});
test("actual upload stores Recorder snapshots, both detail views read them, deduction categories stay unchanged",async()=>{
 const store=resetFixture(),input=currentInput();const body={payloadVersion:1,sessionId:"recorder-fixture",scenarioId:rules.scenarioId,
  scenarioVersion:rules.scenarioVersion,groundTruthVersion:rules.groundTruthVersion,scoringRulesVersion:rules.scoringRulesVersion,
  startedAtUtc:"2026-10-21T00:00:00Z",completedAtUtc:"2026-10-21T01:00:00Z",durationSeconds:3600,
  selectedConclusionId:input.selectedConclusionId,resolvedEndingId:input.resolvedEndingId,orderedEvents:[...eventsFor(input),report(0,2),report(1),report(2,1),report(3)]};
 const response=await POST(new Request("http://localhost/api/v1/assessment-sessions",{method:"POST",headers:{Authorization:"Bearer fixture-token","Content-Type":"application/json"},body:JSON.stringify(body)}));
 assert.equal(response.status,200,await response.text());assert.ok(store.categories.some(c=>c.category_key==="deductionTotalScore"&&c.category_value===100));
 const detail=await getResultDetail(body.sessionId);assert.ok(detail);assert.equal(buildEducationalRecord(detail).recorder.points,18);
 assert.equal(store.events.filter(e=>e.event_type==="ReportLinesSelected").length,4);
 for(const instructor of [false,true])assert.match(renderToStaticMarkup(<SessionRecord result={detail} instructor={instructor}/>),/18 \/ 24/);
});

test("current Unity upload retains all four Recorder entries with the same versioned catalog",()=>{
 if(!process.env.VICSI_UNITY_PROJECT)return;
 const wire=JSON.parse(readFileSync(`${process.env.VICSI_UNITY_PROJECT}/docs/evidence/recorder-documentation-2026-10-21/current-unity-upload.json`,"utf8"));
 const records=validateRecorderDocumentation(wire.orderedEvents);assert.equal(records.length,4);
 assert.equal(records.reduce((sum,s)=>sum+s.earnedPoints,0),18);assert.ok(records.every(s=>s.statements.filter(a=>a.selected).length===3));
});

test("historical table-only Recorder entries remain readable through both scoped session reads without new points",async()=>{
 const store=resetFixture();store.sessions.push({session_id:"history-recorder",student_id:"fixture-student",class_id:"fixture-class",
  scenario_id:rules.scenarioId,scenario_version:rules.scenarioVersion,scoring_rules_version:"1.0.0",verification_status:"verified"});
 store.reportLines.push({session_id:"history-recorder",evidence_id:"BODY-A",line_id:"body-a-location"});
 for(const role of ["student","instructor"] as const){store.role=role;const result=await getResultDetail("history-recorder",{educationalOnly:true});
  assert.ok(result);const view=buildEducationalRecord(result);assert.equal(view.recorder.points,null);assert.equal(view.recorder.subjects[0].selected.length,1);
  assert.match(renderToStaticMarkup(<SessionRecord result={result} instructor={role==="instructor"}/>),/kitchen floor/);}
 store.role="student";store.caller="other-student";assert.equal(await getResultDetail("history-recorder",{educationalOnly:true}),null);
});
