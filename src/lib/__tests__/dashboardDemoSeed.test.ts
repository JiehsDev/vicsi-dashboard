import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildDemoSession,DEMO_SOURCE,DEMO_STUDENTS} from '../../../supabase/seed/dashboard-demo-data';
import {validateQuestionRecords,procedureTimeline} from '../sessionRecord';
import {canonicalPayloadHash} from '../assessmentCrypto';

test('perfect demo earns all three deduction components and 24/24 documentation from current rules',()=>{
 const r=buildDemoSession('demo-student','demo-class','DEMO-CHECK',0,4);
 assert.equal(r.score.overallScore,1);assert.equal(r.score.categories.reasoningCheckpointComponent,60);assert.equal(r.score.categories.deductionRelationshipComponent,25);assert.equal(r.score.categories.finalConclusionComponent,15);assert.equal(r.documentation.points,24);
 const q=validateQuestionRecords(r.payload.orderedEvents,r.payload.scenarioId,r.payload.groundTruthVersion,r.payload.scoringRulesVersion)!;
 assert.equal(q.length,13);assert.ok(q.every(q=>q.selectedAnswerId));
});
test('examples span distinct verified performances and consistent chronological records',()=>{
 const scores=[1,2,3,4].map(level=>{
  const r=buildDemoSession('demo-student','demo-class','DEMO-CHECK',0,level);
  assert.equal(r.score.status,'complete');assert.deepEqual(r.score.reviewReasons,[]);
  assert.ok(r.payload.orderedEvents.every((e,i,all)=>e.sequenceNumber===i+1&&e.timestampMs<=r.payload.durationSeconds*1000&&(!i||e.timestampMs>=all[i-1].timestampMs)));
  assert.ok(procedureTimeline(r.payload.orderedEvents).length>35);
  return r.score.overallScore!;
 });
 assert.ok(scores.every((score,i)=>!i||score>scores[i-1]));
});
test('seed identities and payload hashes are deterministic; synthetic records are always flagged',()=>{
 const a=buildDemoSession('student','class','DEMO-CHECK',2,4),b=buildDemoSession('student','class','DEMO-CHECK',2,4);
 assert.equal(a.payload.sessionId,b.payload.sessionId);assert.equal(canonicalPayloadHash(a.payload),canonicalPayloadHash(b.payload));
 assert.equal(a.payload.isTestSession,true);assert.equal(a.payload.clientVersion,DEMO_SOURCE);
 assert.ok(DEMO_STUDENTS.every(s=>s.code.startsWith('DEMO-')&&s.name.endsWith('(Demo)')));
 assert.notEqual(a.payload.sessionId,buildDemoSession('student','class','DEMO-CHECK',1,4).payload.sessionId);
});
