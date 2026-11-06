import {test} from "node:test";
import assert from "node:assert/strict";
import {renderToStaticMarkup} from "react-dom/server";
import {instructorOverview} from "../instructorOverview.ts";
import {InstructorOverview} from "../../components/InstructorOverview.tsx";
import {currentResult} from "./sessionRecord.fixture.ts";
import type {InstructorResultRow} from "../results.ts";
const row=(overrides:Partial<InstructorResultRow>={}):InstructorResultRow=>({...currentResult(),studentDisplayName:"Ana Reyes",studentIdCode:"2026-001",classDisplayName:"Section A",...overrides});

test("empty and test-only views do not invent students, averages or review flags",()=>{
 for(const rows of [[],[row({isTestSession:true})]]){
  const model=instructorOverview(rows);assert.equal(model.review.length,0);assert.equal(model.cohorts.length,0);assert.equal(model.studentCount,0);
  const html=renderToStaticMarkup(<InstructorOverview rows={rows} query={{}}/>);
  assert.match(html,/No completed, verified student results/);assert.doesNotMatch(html,/Average deduction score|>0<small>%/);
 }
});
test("each student contributes only their latest completed verified attempt, using played time",()=>{
 const old=row({sessionId:"old",startedAtUtc:"2026-10-01T00:00:00Z",serverReceivedAtUtc:"2026-10-30T00:00:00Z",assessmentComponents:{deductionAssessmentComplete:1,deductionTotalScore:10}});
 const recent=row({sessionId:"recent",startedAtUtc:"2026-10-20T00:00:00Z"});
 const duplicate=row({sessionId:"duplicate",classId:"other-class",startedAtUtc:"2026-10-10T00:00:00Z"});
 const pending=row({sessionId:"pending",startedAtUtc:"2026-10-29T00:00:00Z",verificationStatus:"requires_review"});
 const input=[old,recent,duplicate,pending],model=instructorOverview(input);
 assert.equal(model.cohorts[0].students,1);assert.equal(model.cohorts[0].average,100);
 assert.equal(model.review.length,1);assert.equal(model.review[0].row.sessionId,"pending");
 assert.deepEqual(input,[old,recent,duplicate,pending]);
});
test("scenario, scenario version, scoring version and ground-truth versions stay separate",()=>{
 const base=row();
 const groups=instructorOverview([base,row({sessionId:"scenario",scenarioId:"other"}),row({sessionId:"content",scenarioVersion:"2"}),row({sessionId:"rules",scoringVersion:"1.5.0",verifiedScore:.7}),row({sessionId:"ground",groundTruthVersion:"2"})]).cohorts;
 assert.equal(groups.length,5);assert.ok(groups.every(group=>group.students===1));
 const historical=groups.find(group=>group.scoringVersion==="1.5.0")!;assert.equal(historical.average,70);assert.ok(historical.components.every(c=>c.average===null));
});
test("component averages count recorded zero, exclude missing/invalid values, and use fixed maxima",()=>{
 const model=instructorOverview([row(),row({studentId:"second",sessionId:"second",assessmentComponents:{deductionAssessmentComplete:1,deductionTotalScore:15,reasoningCheckpointComponent:0,deductionRelationshipComponent:Infinity}})]);
 const components=model.cohorts[0].components;
 assert.equal(model.cohorts[0].students,2);assert.equal(model.cohorts[0].average,57.5);
 assert.deepEqual(components.map(c=>[c.maximum,c.average,c.count]),[[60,30,2],[25,25,1],[15,15,1]]);
 assert.match(model.review[0].reasons.join(" "),/Reasoning: 0 \/ 60/);assert.doesNotMatch(model.review[0].reasons.join(" "),/Infinity|Final conclusion/);
});
test("review flags are actionable, prioritize verification and never classify the 50-percent boundary as low",()=>{
 const low=row({studentId:"low",sessionId:"low",assessmentComponents:{deductionAssessmentComplete:1,deductionTotalScore:45,reasoningCheckpointComponent:30,deductionRelationshipComponent:0,finalConclusionComponent:15}});
 const incomplete=row({studentId:"unfinished",sessionId:"unfinished",completedAtUtc:null});
 const pending=row({studentId:"pending",sessionId:"pending",verificationStatus:"pending_verification"});
 const review=row({studentId:"review",sessionId:"review",verificationStatus:"requires_review"});
 const items=instructorOverview([low,incomplete,pending,review]).review;
 assert.deepEqual(items.map(i=>i.row.sessionId),["review","unfinished","pending","low"]);
 assert.deepEqual(items[3].reasons,["Evidence relationships: 0 / 25"]);assert.match(items[3].href,/#deduction-score$/);
 assert.match(items[0].href,/#session-information$/);
});
test("overview keeps the chosen version and filters, and makes all queue entries accessible",()=>{
 const rows=Array.from({length:7},(_,i)=>row({studentId:`student-${i}`,sessionId:`session-${i}`,verificationStatus:"requires_review"}));
 const all=[...rows,row(),row({sessionId:"legacy",studentId:"legacy",scoringVersion:"1.5.0",verifiedScore:.7})];
 const group=instructorOverview(all).cohorts.find(g=>g.scoringVersion==="1.5.0")!.key;
 const html=renderToStaticMarkup(<InstructorOverview rows={all} query={{q:"Ana",classId:"class-a",performanceGroup:group,page:"2"}}/>);
 assert.match(html,/Show 2 more flagged sessions/);assert.match(html,/session-6#session-information/);
 assert.match(html,/name="q" value="Ana"/);assert.match(html,/name="classId" value="class-a"/);assert.doesNotMatch(html,/name="page"/);
 assert.match(html,/70<small>%/);assert.match(html,/Not recorded/);assert.match(html,/not pass\/fail grades/);
});
