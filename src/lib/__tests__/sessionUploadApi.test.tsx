import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {renderToStaticMarkup} from 'react-dom/server';
import {POST} from '../../app/api/v1/assessment-sessions/route.ts';
import {resetFixture,fixture} from '../../../Tools/testing/session-api-fixture.ts';
import {getResultDetail,getMyResultSummaries,getInstructorResultSummaries} from '../results.ts';
import {SessionRecord} from '../../components/SessionRecord.tsx';
import StudentPage from '../../app/results/page.tsx';
import InstructorPage from '../../app/(dashboard)/class-results/page.tsx';
import StudentSessionPage from '../../app/results/[sessionId]/page.tsx';
import InstructorSessionPage from '../../app/(dashboard)/class-results/[sessionId]/page.tsx';
import StudentHistoryPage from '../../app/(dashboard)/class-results/students/[studentId]/page.tsx';
import {currentInput} from './sessionRecord.fixture.ts';
import {buildEducationalRecord} from '../sessionRecord.ts';
import {evidenceText} from '../evidenceDisplay.ts';
import {eventsFor,rules} from './assessmentPresentation.fixture.ts';
import type {ScoringSessionEvent} from '../scoring/types.ts';

const project=process.env.VICSI_UNITY_PROJECT;
function payload():Record<string,unknown> {
 if(project)return JSON.parse(readFileSync(join(project,'docs/evidence/session-simplification/current-unity-upload.json'),'utf8'));
 const input=currentInput();return {payloadVersion:1,sessionId:'fixture-session',studentId:'forged-student',classId:'forged-class',scenarioId:rules.scenarioId,scenarioVersion:rules.scenarioVersion,
 scoringRulesVersion:rules.scoringRulesVersion,groundTruthVersion:rules.groundTruthVersion,startedAtUtc:'2026-10-18T00:00:00Z',completedAtUtc:'2026-10-18T01:00:00Z',durationSeconds:3600,
 selectedConclusionId:input.selectedConclusionId,resolvedEndingId:input.resolvedEndingId,orderedEvents:eventsFor(input)};
}
const request=(body:Record<string,unknown>,token:string|null='fixture-token')=>new Request('http://localhost/api/v1/assessment-sessions',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});
test('actual upload handler accepts current Unity payload and stores only verified deduction categories',async()=>{
 const s=resetFixture(),body=payload();const response=await POST(request(body));const envelope=await response.json();
 assert.equal(response.status,200,JSON.stringify(envelope));assert.equal(envelope.data.uploadStatus,'accepted');assert.equal(envelope.data.verificationStatus,'verified');
 assert.equal(s.sessions[0].student_id,'fixture-student');assert.equal(s.sessions[0].class_id,'fixture-class');
 assert.equal(s.sessions[0].verified_score,1);assert.ok(s.categories.some(c=>c.category_key==='deductionTotalScore'&&c.category_value===100));
 assert.ok(s.categories.every(c=>!['measurement','precision','proceduralCompliance','scenePhotography','reasoningAccuracy'].includes(String(c.category_key))));
 const original=body.orderedEvents as ScoringSessionEvent[];assert.deepEqual(s.events.map(e=>[e.sequence_number,e.timestamp_ms]),original.map(e=>[e.sequenceNumber,e.timestampMs]));
 const detail=await getResultDetail(String(body.sessionId));assert.ok(detail);const html=renderToStaticMarkup(<SessionRecord result={detail}/>);assert.match(html,/100%/);assert.equal((html.match(/class="assessment-question"/g)??[]).length,13);
});
test('student list/detail and instructor class/student detail use the same stored record',async()=>{
 const s=resetFixture(),body=payload();await POST(request(body));
 assert.equal((await getMyResultSummaries()).length,1);assert.match(renderToStaticMarkup(await StudentPage({searchParams:Promise.resolve({includeTests:'true'})})),/My Sessions/);
 const own=renderToStaticMarkup(await StudentSessionPage({params:Promise.resolve({sessionId:String(body.sessionId)})}));assert.match(own,/Student answer/);
 s.role='instructor';s.profile={role:'instructor',fullName:'Fixture professor'};s.caller='fixture-professor';
 assert.equal((await getInstructorResultSummaries()).length,1);const list=renderToStaticMarkup(await InstructorPage({searchParams:Promise.resolve({})}));assert.match(list,/Class Results/);assert.match(list,/View/);
 const instructor=renderToStaticMarkup(await InstructorSessionPage({params:Promise.resolve({sessionId:String(body.sessionId)})}));assert.equal((instructor.match(/class="assessment-question"/g)??[]).length,13);assert.match(instructor,/100%/);
 const history=renderToStaticMarkup(await StudentHistoryPage({params:Promise.resolve({studentId:'fixture-student'})}));assert.match(history,/Sessions/);assert.match(history,/View/);
});

test('new procedure records survive upload and both detail routes without changing deduction points',async()=>{
 const baseline=resetFixture();assert.equal((await POST(request(payload()))).status,200);
 const categories=baseline.categories.map(c=>[c.category_key,c.category_value,c.source]);
 const state=resetFixture(),body=payload(),events=body.orderedEvents as ScoringSessionEvent[];
 const types=['SceneLogSigned','PPEEquipped','UsedGlovesDisposed','FreshGlovesEquipped','FreshSwabLoaded','PhotographicScaleCaptured','SampleDryingCompleted','SamplePackaged','FingerprintPracticeCompleted'];
 // Unity fixture tests the real minimal-upload filter. Without a local Unity checkout,
 // the same contract remains covered by explicit source-specific records.
 const recorded:ScoringSessionEvent[]=project
  ?JSON.parse(readFileSync(join(project,'docs/evidence/dashboard-workflow-refresh-2026-10-20/procedure-events-wire.json'),'utf8')).orderedEvents
  :types.map((eventType,i)=>({sequenceNumber:i,timestampMs:i*1000,eventType,targetId:'EVD-015',payload:[]}));
 const next=Math.max(...events.map(e=>e.sequenceNumber))+1;
 events.push(...recorded.map((e,i)=>({...e,sequenceNumber:next+i})));
 assert.equal((await POST(request(body))).status,200);
 assert.deepEqual(state.categories.map(c=>[c.category_key,c.category_value,c.source]),categories);
 const detail=await getResultDetail(String(body.sessionId));assert.ok(detail);
 for(const type of types)assert.ok(detail.events.some(e=>e.eventType===type),type);
 for(const instructor of [false,true]){
  if(instructor){state.role='instructor';state.profile={role:'instructor',fullName:'Fixture professor'};state.caller='fixture-professor';}
  const page=instructor?await InstructorSessionPage({params:Promise.resolve({sessionId:String(body.sessionId)})}):await StudentSessionPage({params:Promise.resolve({sessionId:String(body.sessionId)})});
  const html=renderToStaticMarkup(page);
  for(const text of ['check-in','fresh swab','photographic scale','simulated drying','in paper','optional fingerprint comparison','unscored'])assert.ok(html.includes(text),text);
  assert.match(html,/100%/);assert.doesNotMatch(html,/EVD-\d+/);
 }
});
test('authorization, rate limiting, ownership and session token bindings remain enforced',async()=>{
 const body=payload();resetFixture();assert.equal((await POST(request(body,null))).status,401);
 assert.equal((await POST(request(body,'invalid-token'))).status,401);
 fixture().rateAllowed=false;assert.equal((await POST(request(body))).status,429);
 resetFixture().bindingSession='another-session';assert.equal((await POST(request(body))).status,401);
 const s=resetFixture();body.studentId='forged-other-user';body.classId='forged-other-class';await POST(request(body));assert.equal(s.sessions[0].student_id,s.tokenStudent);
 s.caller='other-student';assert.equal(await getResultDetail(String(body.sessionId)),null);assert.equal((await getMyResultSummaries()).length,0);
 s.role='instructor';s.sessions[0].class_id='someone-elses-class';assert.equal(await getResultDetail(String(body.sessionId)),null);
});
test('unchanged retries are idempotent and changed submissions conflict',async()=>{
 const s=resetFixture(),body=payload();await POST(request(body));const response=await POST(request(body));assert.equal((await response.json()).data.duplicate,true);assert.equal(s.sessions.length,1);
 body.durationSeconds=100000;assert.equal((await POST(request(body))).status,409);assert.equal(s.sessions.length,1);
});
test('forged question weights or missing answer choices cannot be accepted by the API',async()=>{
 for(const remove of [false,true]){resetFixture();const body=payload(),events=body.orderedEvents as ScoringSessionEvent[];
 const snapshot=events.find(e=>e.eventType==='DeductionAssessmentSnapshot')!,entry=snapshot.payload.find(p=>p.key==='assessment')!,input=JSON.parse(entry.value);
 if(remove)input.questionRecords[0].options.pop();else input.questionRecords[0].selectedAnswerWeight=999;
 entry.value=JSON.stringify(input);const response=await POST(request(body));assert.equal(response.status,400);assert.equal(fixture().sessions.length,0);}
});
test('historical payload without question snapshots still uploads without fabricated details',async()=>{
 resetFixture();const body=payload(),events=body.orderedEvents as ScoringSessionEvent[];
 const snapshot=events.find(e=>e.eventType==='DeductionAssessmentSnapshot')!,entry=snapshot.payload.find(p=>p.key==='assessment')!,input=JSON.parse(entry.value);
 delete input.questionRecords;delete input.questionRecordVersion;entry.value=JSON.stringify(input);assert.equal((await POST(request(body))).status,200);
 const detail=await getResultDetail(String(body.sessionId));assert.ok(detail);const html=renderToStaticMarkup(<SessionRecord result={detail}/>);assert.match(html,/historical session/);assert.doesNotMatch(html,/class="assessment-question"/);
});

test('uploaded legacy HYP event retains its technical identity while both roles display readable terminology',async()=>{
 resetFixture();const body=payload(),events=body.orderedEvents as ScoringSessionEvent[];
 events.push({sequenceNumber:Math.max(...events.map(e=>e.sequenceNumber))+1,timestampMs:Math.max(...events.map(e=>e.timestampMs)),eventType:'HypothesisSubmitted',targetId:'HYP-03',payload:[{key:'selectedOptionId',value:'theory-homicide'}]});
 body.includesRawEventLog=true;
 assert.equal((await POST(request(body))).status,200);
 const detail=await getResultDetail(String(body.sessionId));assert.ok(detail);
 assert.ok(detail.events.some(e=>e.eventType==='HypothesisSubmitted'&&e.targetId==='HYP-03'));
 for(const instructor of [false,true]){
  const html=renderToStaticMarkup(<SessionRecord result={detail} instructor={instructor}/>);
  assert.doesNotMatch(html,/HYP-/);assert.match(html,/Reasoning Question 3/);assert.match(html,/100%/);
 }
});

test('current Unity capture round-trips through upload and both actual detail routes with every educational field',async()=>{
 const state=resetFixture(),body=payload();assert.equal((await POST(request(body))).status,200);
 const detail=await getResultDetail(String(body.sessionId));assert.ok(detail);
 const record=buildEducationalRecord(detail);
 assert.equal(record.questions.length,13);assert.deepEqual(record.components.map(c=>c.points),[60,25,15]);assert.equal(record.score,100);
 assert.ok(record.timeline.every((row,i)=>i===0||row.timestampMs>=record.timeline[i-1].timestampMs));
 const escaped=(text:string)=>renderToStaticMarkup(<span>{evidenceText(text)}</span>).slice(6,-7);
 const number=(value:number)=>String(Math.round(value*100)/100);
 for(const instructor of [false,true]){
  if(instructor){state.role='instructor';state.profile={role:'instructor',fullName:'Fixture professor'};state.caller='fixture-professor';}
  const page=instructor?await InstructorSessionPage({params:Promise.resolve({sessionId:String(body.sessionId)})}):await StudentSessionPage({params:Promise.resolve({sessionId:String(body.sessionId)})});
  const html=renderToStaticMarkup(page),articles=html.match(/<article class="assessment-question"[\s\S]*?<\/article>/g)??[];
  assert.equal(articles.length,record.questions.length);
  for(const [index,q] of record.questions.entries()){
   const article:string=articles[index];assert.ok(article.includes(escaped(q.question)),q.id);
   const options:string[]=article.match(/<li\b[^>]*>[\s\S]*?<\/li>/g)??[];
   assert.equal(options.length,q.options.length);
   for(const [answerIndex,answer] of q.options.entries()){
    const option=options[answerIndex];assert.ok(option.includes(escaped(answer.text)),answer.id);assert.ok(option.includes(`Weight ${number(answer.weight)}`),answer.id);
    assert.equal(option.includes('class="student-answer"'),answer.id===q.selectedAnswerId,answer.id);
   }
   assert.equal((article.match(/class="student-answer"/g)??[]).length,q.selectedAnswerId?1:0);
   assert.ok(article.includes(`${number(q.selectedAnswerWeight)} / ${number(q.maximumWeight)}`),q.id);
  }
  for(const row of record.timeline)assert.ok(html.includes(escaped(row.description)),row.description);
  assert.doesNotMatch(html,/EVD-\d+|HYP-[A-Za-z0-9-]+|REL-[a-z][a-z-]+|RC-\d+-[A-Z-]+|Training Analytics|benchmark|procedural compliance|recharts-wrapper/i);
  assert.match(html,/Final Deduction Score/);assert.match(html,/100%/);
 }
});
