import {test} from 'node:test';
import assert from 'node:assert/strict';
import {snapshot,eventsFor,resultFor,rules} from '../../__tests__/assessmentPresentation.fixture.ts';
import {scoreDeductionAssessment,scoreDeductionEvents} from '../deductionAssessmentScorer.ts';
import {mergeAssessmentEvents} from '../assessmentEventEnvelope.ts';
import {buildAssessmentPresentation} from '../../assessmentPresentation.ts';
import type {ScoringSessionEvent} from '../types.ts';

function review() {
  const i=snapshot();i.relationshipReviewVersion=1;i.completedRelationshipIds=[];i.boardConnections=[];
  i.relationshipResponses=rules.relationships.map((r,n)=>({relationshipId:r.id,responseId:r.correctInterpretationId!,responseOrder:n+1,answeredSeconds:100+n}));
  return i;
}
const near=(a:number|undefined,b:number)=>assert.ok(a!==undefined&&Math.abs(a-b)<.0001,`${a} != ${b}`);
test('review keeps existing six IDs/weights and four plausible choices per question',()=>{
  assert.equal(rules.relationships.length,6);
  for(const r of rules.relationships) {
    assert.equal(r.interpretations?.length,4);assert.equal(new Set(r.interpretations!.map(c=>c.id)).size,4);
    assert.ok(r.interpretations!.some(c=>c.id===r.correctInterpretationId));assert.ok(r.reviewPrompt);
  }
  const timeline=rules.relationships.find(r=>r.id==='REL-paul-timeline-contradiction')!;
  assert.equal(timeline.targetId,'statement_vendor_paul_3am');
});
test('review earns exact 60/25/15 without a single board connection',()=>{
  const r=scoreDeductionAssessment(review(),true,rules);
  assert.equal(r.status,'complete');near(r.totalScore,100);
  near(r.categories.reasoningCheckpointComponent,60);near(r.categories.deductionRelationshipComponent,25);near(r.categories.finalConclusionComponent,15);
});
test('wrong interpretation uses existing weight/penalty and cannot manufacture a supported conclusion',()=>{
  const i=review(),rule=rules.relationships.find(r=>r.id==='REL-paul-timeline-contradiction')!;
  i.relationshipResponses!.find(a=>a.relationshipId===rule.id)!.responseId=rule.interpretations!.find(c=>c.id!==rule.correctInterpretationId)!.id;
  i.resolvedEndingId=rules.prematureEndingId;
  const r=scoreDeductionAssessment(i,true,rules);assert.equal(r.status,'complete');near(r.categories.deductionRelationshipComponent,25*4/6);
  near(r.categories.reasoningCheckpointComponent,60);near(r.categories.finalConclusionComponent,3.75);
  i.completedRelationshipIds=rules.relationships.map(r=>r.id);near(scoreDeductionAssessment(i,true,rules).categories.deductionRelationshipComponent,25*4/6);
});
test('undiscovered vendor statement cannot earn timeline credit',()=>{
  const i=review();i.discoveredStatementIds=[];
  assert.equal(scoreDeductionAssessment(i,true,rules).status,'requires_review');
});
test('duplicate, unknown, nonfinite and unsupported response records fail closed',()=>{
  for(const mutate of [
    (i:ReturnType<typeof review>)=>i.relationshipResponses!.push(i.relationshipResponses![0]),
    (i:ReturnType<typeof review>)=>{i.relationshipResponses![0].responseId='unknown';},
    (i:ReturnType<typeof review>)=>{i.relationshipResponses![0].answeredSeconds=NaN;},
    (i:ReturnType<typeof review>)=>{i.relationshipResponses![0].responseOrder=0;},
    (i:ReturnType<typeof review>)=>{i.relationshipReviewVersion=999;},
  ]) {const i=review();mutate(i);assert.equal(scoreDeductionAssessment(i,true,rules).status,'requires_review');}
});
test('essential event envelope stores every locked choice without raw logs',()=>{
  const i=review(),events=eventsFor(i);
  const payload=mergeAssessmentEvents({scoringRulesVersion:'1.7.0',orderedEvents:[],deductionAssessmentEvents:events});
  const merged=payload.orderedEvents as ScoringSessionEvent[];
  assert.equal(merged.filter(e=>e.eventType==='RelationshipInterpretationSubmitted').length,6);
  near(scoreDeductionEvents(merged,{sessionId:'fixture',scenarioId:rules.scenarioId,selectedConclusionId:i.selectedConclusionId,resolvedEndingId:i.resolvedEndingId},'date',rules).totalScore,100);
});
test('snapshot/locked-event mismatches suppress grades',()=>{
  const i=review(),events=eventsFor(i),lock=events.find(e=>e.eventType==='RelationshipInterpretationSubmitted')!;
  lock.payload.find(p=>p.key==='responseId')!.value='substituted';
  const score=scoreDeductionEvents(events,{sessionId:'fixture',scenarioId:rules.scenarioId,selectedConclusionId:i.selectedConclusionId,resolvedEndingId:i.resolvedEndingId},'date',rules);
  assert.equal(score.status,'requires_review');assert.equal(score.totalScore,undefined);
});
test('student and instructor presentation retains Evidence Relationships and selected interpretations',()=>{
  const result=resultFor(review());const view=buildAssessmentPresentation(result)!;
  assert.equal(view.finalized,true);assert.equal(view.relationships.length,6);
  assert.equal(view.components.find(c=>c.label==='Evidence Relationships')!.maximum,25);
  assert.ok(view.relationships.every(r=>r.interpretation&&r.support==='Supported'&&r.responseOrder));
});
test('all 4096 review combinations remain bounded and cannot affect reasoning weights',()=>{
  for(let n=0;n<4096;n++) {
    const i=review();i.selectedConclusionId=rules.peterConclusionId;i.resolvedEndingId=rules.peterEndingId;
    i.relationshipResponses!.forEach((a,k)=>{a.responseId=rules.relationships[k].interpretations![(n>>(k*2))&3].id;});
    const r=scoreDeductionAssessment(i,true,rules);assert.equal(r.status,'complete');near(r.categories.reasoningCheckpointComponent,60);
    near(r.categories.finalConclusionComponent,0);assert.ok(r.categories.deductionRelationshipComponent!>=0&&r.categories.deductionRelationshipComponent!<=25);
  }
});
test('historical board snapshot still scores identically',()=>{near(scoreDeductionAssessment(snapshot(),true,rules).totalScore,100);});
test('final grade requires all available review questions but does not require an undiscovered statement',()=>{
  const i=review();i.relationshipResponses=[];
  assert.equal(scoreDeductionAssessment(i,true,rules).status,'requires_review');
  const partial=review();partial.discoveredStatementIds=[];partial.resolvedEndingId=rules.prematureEndingId;
  partial.relationshipResponses=partial.relationshipResponses!.filter(a=>a.relationshipId!=='REL-paul-timeline-contradiction');
  const checkpoint=partial.checkpoints.find(c=>c.checkpointId==='RC-05-TIMELINE')!;
  checkpoint.responseId='';checkpoint.responseOrder=0;checkpoint.wasEligible=false;
  assert.equal(scoreDeductionAssessment(partial,true,rules).status,'complete');
});
