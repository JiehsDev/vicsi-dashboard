import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {renderToStaticMarkup} from 'react-dom/server';
import {currentInput,currentResult} from './sessionRecord.fixture.ts';
import {resultFor,eventsFor,rules} from './assessmentPresentation.fixture.ts';
import {buildEducationalRecord,procedureTimeline,validateQuestionRecords} from '../sessionRecord.ts';
import {SessionRecord} from '../../components/SessionRecord.tsx';
import {SessionTable} from '../../components/SessionTable.tsx';
import {ResultFilters} from '../../components/ResultFilters.tsx';
import {mergeAssessmentEvents} from '../scoring/assessmentEventEnvelope.ts';
import {scoreDeductionEvents,scoreDeductionAssessment} from '../scoring/deductionAssessmentScorer.ts';
import type {ScoringSessionEvent} from '../scoring/types.ts';

test('student and instructor can discover hidden test runs without losing their filters',()=>{
 const row={...currentResult(),isTestSession:true};
 for(const instructor of [false,true]) {
  const hidden=renderToStaticMarkup(<ResultFilters rows={[row]} query={{dateFrom:'2026-10-01'}} instructor={instructor}/>);
  assert.match(hidden,/1 test session is hidden/);assert.match(hidden,/Show test sessions/);
  assert.ok(hidden.includes(`${instructor?'/class-results':'/results'}?dateFrom=2026-10-01&amp;includeTests=true`));
  const visible=renderToStaticMarkup(<ResultFilters rows={[row]} query={{includeTests:'true'}} instructor={instructor}/>);
  assert.doesNotMatch(visible,/test session is hidden|Show test sessions/);
 }
});

test('all 13 scored questions preserve every option, selected weight and maximum',()=>{
 const r=currentResult(),view=buildEducationalRecord(r);assert.equal(view.questions.length,13);assert.equal(view.questions.filter(q=>q.options.length===4).length,12);
 assert.equal(view.questions.filter(q=>q.category==='Reasoning').length,6);assert.equal(view.questions.filter(q=>q.category==='Evidence Relationships').length,6);
 assert.deepEqual(view.components.map(c=>c.points),[60,25,15]);assert.equal(view.score,100);
 for(const q of view.questions){assert.equal(q.selectedAnswerWeight,q.options.find(a=>a.id===q.selectedAnswerId)!.weight);assert.ok(q.maximumWeight>0);}
});
test('relationship penalty remains a signed answer weight and affects only its original component',()=>{
 const view=buildEducationalRecord(currentResult(true)),q=view.questions.find(q=>q.id==='REL-peter-departure-supported')!;
 assert.equal(q.selectedAnswerWeight,-1);assert.ok(Math.abs(view.components[1].points!-25*4/6)<1e-9);assert.equal(view.components[0].points,60);assert.equal(view.components[2].points,15);
});
test('student and instructor detail expose all weights and selections with no analytics',()=>{
 for(const instructor of [false,true]){const html=renderToStaticMarkup(<SessionRecord result={currentResult()} instructor={instructor}/>);
 for(const text of ['Session information','Procedure timeline','Deduction questions','Final Deduction Score','100%','Weight -1','Received:','Student answer'])assert.ok(html.includes(text),text);
 assert.equal((html.match(/class="assessment-question"/g)??[]).length,13);assert.equal((html.match(/class="student-answer"/g)??[]).length,13);
 assert.doesNotMatch(html,/Training Analytics|Reasoning Development|Common errors|Score distribution|benchmark|remediation|insight card/i);}
});
test('procedure timeline keeps session clock order, completed activities and distinct repeated work',()=>{
 const events:ScoringSessionEvent[]=[
 {sequenceNumber:8,timestampMs:10002,eventType:'EvidenceStatusChanged',targetId:'BODY-A',payload:[{key:'status',value:'Marked'},{key:'tentLetter',value:'A'}]},
 {sequenceNumber:2,timestampMs:501,eventType:'SceneTurnoverCompleted',targetId:'turnover',payload:[]},
 {sequenceNumber:3,timestampMs:600,eventType:'HypothesisSubmitted',targetId:'HYP-01',payload:[]},
 {sequenceNumber:9,timestampMs:10002,eventType:'EvidenceAddedToInventory',targetId:'fingerprint:EVD-014',payload:[{key:'sampleType',value:'Fingerprint'},{key:'sourceEvidenceId',value:'EVD-014'}]},
 ...['ToolEquipped','SketchOpened','EvidenceTransitionBlocked','ReasoningCheckpointEligible','NarrativeEventTriggered','EvidenceDepositAttempted','ScenePhotoWrongAngle'].map((eventType,i)=>({sequenceNumber:20+i,timestampMs:20000+i,eventType,targetId:null,payload:[]}))];
 const rows=procedureTimeline([...events,events[0]]);assert.deepEqual(rows.map(e=>e.timestampMs),[501,600,10002,10002]);assert.equal(rows.length,4);assert.match(rows[1].description,/checkpoint Reasoning Question 1/);assert.match(rows[2].description,/marker A/);assert.match(rows[3].description,/lifted fingerprint sample from Evidence 1 – Kitchen Knife/);
});
test('missing options, forged weights, duplicate questions and changed locked choices are rejected',()=>{
 for(const mutate of [(i:ReturnType<typeof currentInput>)=>{i.questionRecords![0].options.pop();},(i:ReturnType<typeof currentInput>)=>{i.questionRecords![0].options[0].weight=999;},(i:ReturnType<typeof currentInput>)=>{i.questionRecords![0].selectedAnswerId='forged';},(i:ReturnType<typeof currentInput>)=>{i.questionRecords![1]=i.questionRecords![0];}]) {
  const input=currentInput();mutate(input);assert.throws(()=>validateQuestionRecords(eventsFor(input),rules.scenarioId,'1.2.0','1.7.0'));
 }
});

test('current procedure completions show readable sources while attempts remain omitted',()=>{
 const types=['SceneLogSigned','PPEEquipped','UsedGlovesDisposed','FreshGlovesEquipped','FreshSwabLoaded','PhotographicScaleCaptured','SampleDryingCompleted','SamplePackaged','FingerprintPracticeCompleted'];
 const events:ScoringSessionEvent[]=types.map((eventType,i)=>({sequenceNumber:i,timestampMs:i*1000,eventType,targetId:'EVD-015',payload:[]}));
 events.push({sequenceNumber:9,timestampMs:9000,eventType:'SamplePackaged',targetId:'EVD-014',payload:[]},
  {sequenceNumber:10,timestampMs:10000,eventType:'SampleDryingStarted',targetId:'EVD-014',payload:[]});
 const rows=procedureTimeline([...events,events[0]]);
 assert.equal(rows.length,10);assert.match(rows[0].description,/check-in/);assert.match(rows[4].description,/fresh swab/);
 assert.match(rows[5].description,/Evidence 2 – Blood Spatter.*photographic scale/);
 assert.match(rows[6].description,/simulated drying.*Evidence 2 – Blood Spatter/);
 assert.match(rows[7].description,/Evidence 2 – Blood Spatter.*paper/);
 assert.match(rows[8].description,/optional fingerprint comparison.*unscored/);
 assert.match(rows[9].description,/Evidence 1 – Kitchen Knife.*paper/);
 assert.ok(rows.every(row=>!row.description.includes('EVD-')));assert.deepEqual(procedureTimeline([]),[]);
});

test('release authorization never claims completed release without the completion event',()=>{
 const authorized:ScoringSessionEvent={sequenceNumber:1,timestampMs:1000,eventType:'SceneReleaseConfirmed',targetId:'soco-closeout',payload:[]};
 const pending=procedureTimeline([authorized]);assert.equal(pending.length,1);
 assert.equal(pending[0].description,'IOC report accepted; scene release authorized');
 assert.doesNotMatch(pending[0].description,/released crime scene/i);
 const complete=procedureTimeline([authorized,{...authorized,sequenceNumber:2,timestampMs:2000,eventType:'InvestigationCompleted'}]);
 assert.equal(complete.length,2);assert.equal(complete[1].description,'Completed investigation and released crime scene');
});
test('historical and corrupt optional snapshots render only recorded facts without invented options',()=>{
 for(const r of [resultFor(),{...resultFor(),scoringVersion:'1.0.0'},{...resultFor(),events:[]}]){const view=buildEducationalRecord(r);assert.equal(view.questions.length,0);assert.equal(view.historical,true);assert.doesNotThrow(()=>renderToStaticMarkup(<SessionRecord result={r}/>));}
 const r=currentResult();r.events.find(e=>e.eventType==='DeductionAssessmentSnapshot')!.payload=[{key:'assessment',value:'{bad'}];assert.equal(buildEducationalRecord(r).questions.length,0);
});
test('display uses stored authoritative totals and never silently recalculates a replacement',()=>{
 const r=currentResult();Object.assign(r.categories,{deductionTotalScore:87.5,reasoningCheckpointComponent:47.5});
 const view=buildEducationalRecord(r);assert.equal(view.score,87.5);assert.equal(view.components[0].points,47.5);
 r.verificationStatus='requires_review';assert.equal(buildEducationalRecord(r).score,null);
});

test('unavailable and unanswered questions do not display a fabricated received zero',()=>{
 for(const wasAvailable of [false,true]){
  const input=currentInput(),checkpoint=input.checkpoints[1],question=input.questionRecords![1];
  // This checkpoint depends on the victim observation; keep eligibility consistent
  // with the authored trigger so the snapshot remains valid in both cases.
  input.victimObserved=wasAvailable;
  Object.assign(checkpoint,{wasEligible:wasAvailable,responseId:'',answeredSeconds:0});
  Object.assign(question,{wasAvailable,selectedAnswerId:'',selectedAnswerWeight:0,answeredSeconds:-1});
  const result=resultFor(input),expectedScore=result.categories.deductionTotalScore;
  assert.equal(buildEducationalRecord(result).questions.length,13);
  for(const instructor of [false,true]){
   const html=renderToStaticMarkup(<SessionRecord result={result} instructor={instructor}/>);
   // Unanswered questions sort after recorded answers.
   const article:string=(html.match(/<article class="assessment-question"[\s\S]*?<\/article>/g)??[]).at(-1)!;
   assert.ok(article.includes(wasAvailable?'No answer recorded':'Not available during this investigation'));
   assert.doesNotMatch(article,/Received:|received-weight/);
   assert.equal(buildEducationalRecord(result).score,expectedScore);
  }
 }
});
test('historical child-table answers and top-level conclusion survive absent event logs without invented times',()=>{
 const r=resultFor();r.scoringVersion='1.5.0';r.events=[];r.hypotheses=[{checkpointId:'HYP-01',selectedOptionId:'recorded-option',reasoningOptionId:'recorded-reason'}];
 const view=buildEducationalRecord(r);assert.equal(view.questions.length,0);assert.equal(view.recordedAnswers.length,2);assert.ok(view.recordedAnswers.every(a=>a.timestampMs===null&&a.weight===null));
 const html=renderToStaticMarkup(<SessionRecord result={r}/>);assert.match(html,/recorded-option/);assert.match(html,/conclusion-brother/);assert.match(html,/Time not recorded/);
});
test('session lists expose exactly the requested compact columns and explicit View links',()=>{
 const r={...currentResult(),studentDisplayName:'John Doe',studentIdCode:'2099-00099',classDisplayName:'Class Z'};
 for(const instructor of [false,true]){const html=renderToStaticMarkup(<SessionTable rows={[r]} instructor={instructor}/>);assert.equal((html.match(/<th(?: |>|\n)/g)??[]).length,instructor?6:5);assert.match(html,/Duration/);assert.match(html,/Deduction Score/);assert.match(html,/View →/);assert.doesNotMatch(html,/Reasoning \/|Verification|Closeout|Attempts<\/th>/);}
});
const project=process.env.VICSI_UNITY_PROJECT;
test('fresh Unity upload has exact authoritative score, all choices and opaque internal analytics',{skip:!project},()=>{
 const wire=JSON.parse(readFileSync(join(project!,'docs/evidence/session-simplification/current-unity-upload.json'),'utf8'));
 const merged=mergeAssessmentEvents(wire),events=merged.orderedEvents as ScoringSessionEvent[];
 const qs=validateQuestionRecords(events,wire.scenarioId,wire.groundTruthVersion,wire.scoringRulesVersion)!;assert.equal(qs.length,13);
 assert.deepEqual(JSON.parse(readFileSync(join(project!,'Assets/Resources/ProcedureTimeline_1.json'),'utf8')),JSON.parse(readFileSync('src/lib/scoring/data/procedureTimeline.v1.json','utf8')));
 const audit=JSON.parse(readFileSync(join(project!,'docs/evidence/session-simplification/current-code-audit.json'),'utf8'));
 for(const original of audit.questions){const q=qs.find(q=>q.id===original.id)!;assert.ok(q.question.endsWith(original.prompt));assert.deepEqual(q.options.map(a=>({id:a.id,text:a.text,weight:a.weight})),original.options);}
 const score=scoreDeductionEvents(events,{sessionId:wire.sessionId,scenarioId:wire.scenarioId,selectedConclusionId:wire.selectedConclusionId,resolvedEndingId:wire.resolvedEndingId},wire.completedAtUtc,rules);
 assert.equal(score.status,'complete',score.reviewReasons.join('; '));assert.equal(score.totalScore,wire.deductionAssessment.totalScore);
 assert.equal(score.categories.reasoningCheckpointComponent,wire.deductionAssessment.reasoningComponent);assert.equal(score.categories.deductionRelationshipComponent,wire.deductionAssessment.relationshipComponent);assert.equal(score.categories.finalConclusionComponent,wire.deductionAssessment.conclusionComponent);
 assert.equal(wire.deductionAssessmentEvents,undefined);assert.equal(wire.evidenceResults,undefined);assert.equal(wire.measurement,undefined);
 assert.ok(events.some(e=>e.eventType==='EvidenceFingerprintProcessed'));assert.ok(procedureTimeline(events).length>15);
});
test('576 Unity fractional scores, penalties and contextual conclusions display exactly the same',{skip:!project},()=>{
 const data=JSON.parse(readFileSync(join(project!,'docs/evidence/session-simplification/unity-parity-cases.json'),'utf8'));
 assert.equal(data.cases.length,576);
 for(const c of data.cases){const result=scoreDeductionAssessment(c.input,true,rules);assert.equal(result.status,'complete',result.reviewReasons.join('; '));
   const format=(v:number)=>String(Math.round(v*100)/100);
   assert.equal(format(result.categories.reasoningCheckpointComponent!),c.reasoning);assert.equal(format(result.categories.deductionRelationshipComponent!),c.relationships);
   assert.equal(format(result.categories.finalConclusionComponent!),c.conclusion);assert.equal(format(result.totalScore!),c.total);
   assert.ok(Math.abs(result.totalScore!-c.result.totalScore)<.00002);
 }
});
