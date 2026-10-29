import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {mergeAssessmentEvents} from '../scoring/assessmentEventEnvelope.ts';
import {scoreDeductionEvents} from '../scoring/deductionAssessmentScorer.ts';
import {buildAssessmentPresentation} from '../assessmentPresentation.ts';
import {trainingAnalytics} from '../trainingAnalytics.ts';
import {resultFor,rules} from './assessmentPresentation.fixture.ts';
import type {ScoringSessionEvent} from '../scoring/types.ts';
const project=process.env.VICSI_UNITY_PROJECT;
test('current completed Unity relationship review produces identical dashboard component points',{skip:!project},()=>{
 const wire=JSON.parse(readFileSync(path.join(project!,'docs/evidence/relationship-review/completed-upload-wire.json'),'utf8'));
 const events=mergeAssessmentEvents(wire).orderedEvents as ScoringSessionEvent[];
 const score=scoreDeductionEvents(events,{sessionId:wire.sessionId,scenarioId:wire.scenarioId,selectedConclusionId:wire.selectedConclusionId,resolvedEndingId:wire.resolvedEndingId},wire.completedAtUtc,rules);
 assert.equal(score.status,'complete');const r=resultFor();Object.assign(r,{events,categories:score.categories,selectedConclusionId:wire.selectedConclusionId,resolvedEndingId:wire.resolvedEndingId,completedAtUtc:wire.completedAtUtc});
 const view=buildAssessmentPresentation(r)!;assert.ok(Math.abs(view.total!-wire.deductionAssessment.totalScore)<.001);assert.deepEqual(view.components.map(c=>c.maximum),[60,25,15]);
 for(const row of wire.relationshipResults.filter((r:{interpretationLocked:boolean})=>r.interpretationLocked)){const displayed=view.relationships.find(r=>r.id===row.relationshipId)!;assert.equal(displayed.responseOrder,row.interpretationOrder);assert.equal(displayed.interpretation,rules.relationships.find(q=>q.id===row.relationshipId)!.interpretations!.find(a=>a.id===row.selectedInterpretationId)!.text);}
});
test('actual current Unity custody pass appears as six transfers and one completion',{skip:!project},()=>{
 const wire=JSON.parse(readFileSync(path.join(project!,'docs/evidence/custody-pass/upload-wire.json'),'utf8'));const r=resultFor();r.events=mergeAssessmentEvents(wire).orderedEvents as ScoringSessionEvent[];const t=trainingAnalytics(r);
 assert.equal(t.custody,true);assert.equal(t.timeline.filter(e=>e.eventType==='EvidenceDeposited').length,6);assert.equal(t.timeline.filter(e=>e.eventType==='CustodyPassCompleted').length,1);assert.equal(r.assessment!.total,100);
});
