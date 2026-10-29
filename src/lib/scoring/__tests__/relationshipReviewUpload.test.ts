import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {mergeAssessmentEvents} from '../assessmentEventEnvelope.ts';
import {scoreDeductionEvents} from '../deductionAssessmentScorer.ts';
import {resolveSessionScoring} from '../registry.ts';
import type {ScoringSessionEvent} from '../types.ts';

test('actual Unity review upload retains locked answers through the existing session-event envelope',
  {skip:!process.env.VICSI_UNITY_PROJECT},()=>{
    const wire=JSON.parse(readFileSync(join(process.env.VICSI_UNITY_PROJECT!, 'docs/evidence/relationship-review/upload-wire.json'),'utf8'));
    assert.equal(wire.includesRawEventLog,false);
    // Current simplified uploads carry essential events in orderedEvents;
    // raw logging remains disabled and the legacy transport copy stays empty.
    assert.equal(wire.orderedEvents.filter((e:ScoringSessionEvent)=>e.eventType==='RelationshipInterpretationSubmitted').length,5);
    assert.equal(wire.deductionAssessmentEvents.length,0);
    const merged=mergeAssessmentEvents(wire);
    const events=(merged.orderedEvents as ScoringSessionEvent[]).filter(e=>e.eventType==='RelationshipInterpretationSubmitted');
    const original=(wire.orderedEvents as ScoringSessionEvent[]).filter(e=>e.eventType==='RelationshipInterpretationSubmitted');
    assert.equal(events.length,5);assert.deepEqual(events,original);
    const rules=resolveSessionScoring('CSI-ENVIRONMENT-001','1.2.0','1.7.0').scoringRules!.deduction!;
    for(const [index,event] of events.entries()) {
      const definition=rules.relationships.find(r=>r.id===event.targetId)!;
      assert.ok(definition);
      assert.ok(definition.interpretations!.some(option=>option.id===event.payload.find(p=>p.key==='responseId')!.value));
      assert.equal(Number(event.payload.find(p=>p.key==='responseOrder')!.value),index+1);
    }
  });

test('completed Unity review snapshot has identical client and server grading',
  {skip:!process.env.VICSI_UNITY_PROJECT},()=>{
    const wire=JSON.parse(readFileSync(join(process.env.VICSI_UNITY_PROJECT!, 'docs/evidence/relationship-review/completed-upload-wire.json'),'utf8'));
    const merged=mergeAssessmentEvents(wire);
    const rules=resolveSessionScoring('CSI-ENVIRONMENT-001','1.2.0','1.7.0').scoringRules!.deduction!;
    const events=merged.orderedEvents as ScoringSessionEvent[];
    const input=JSON.parse(events.find(e=>e.eventType==='DeductionAssessmentSnapshot')!.payload.find(p=>p.key==='assessment')!.value);
    assert.equal(input.relationshipReviewVersion,1);assert.ok(input.relationshipResponses.length>0);
    const score=scoreDeductionEvents(events,{sessionId:wire.sessionId,scenarioId:wire.scenarioId,
      selectedConclusionId:wire.selectedConclusionId,resolvedEndingId:wire.resolvedEndingId},wire.completedAtUtc,rules);
    assert.equal(score.status,'complete',score.reviewReasons.join('; '));
    assert.ok(Math.abs(score.totalScore!-wire.deductionAssessment.totalScore)<.001);
    assert.ok(Math.abs(score.categories.deductionRelationshipComponent!-wire.deductionAssessment.relationshipComponent)<.001);
  });
