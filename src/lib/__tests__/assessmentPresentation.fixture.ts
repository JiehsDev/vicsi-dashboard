import { resolveSessionScoring } from '../scoring/registry.ts';
import { scoreDeductionEvents } from '../scoring/deductionAssessmentScorer.ts';
import { buildAssessmentPresentation } from '../assessmentPresentation.ts';
import type {ResultDetail} from '../results.ts';
import type {DeductionAssessmentInput,ScoringSessionEvent} from '../scoring/types.ts';
export const rules=resolveSessionScoring('CSI-ENVIRONMENT-001','1.2.0','1.7.0').scoringRules!.deduction!;
export function snapshot():DeductionAssessmentInput {
  return {scoringRulesVersion:'1.7.0',contentVersion:'1.0.0',selectedConclusionId:rules.supportedConclusionId,resolvedEndingId:rules.supportedEndingId,
    atConclusion:true,requiresSceneRelease:true,checkpointSystemReady:true,form1Received:true,victimObserved:true,sceneSecurityAcknowledged:true,
    iocObservationIds:['ioc-possible-weapon','ioc-bloodstain-area'],confirmedFindingIds:[...rules.supportedFindingIds],discoveredStatementIds:[rules.supportedStatementId],observedEvidenceIds:['BODY-A','EVD-014','EVD-015','EVD-018'],
    checkpoints:rules.checkpoints.map((c,i)=>({checkpointId:c.id,responseId:c.responses.find(r=>r.weight===4)!.id,wasEligible:true,responseOrder:i+1,eligibleSeconds:10+i*10,answeredSeconds:15+i*10})),
    completedRelationshipIds:rules.relationships.map(r=>r.id),boardConnections:rules.relationships.map(r=>({sourceId:r.sourceId,targetId:r.targetId}))};
}
export function eventsFor(input:DeductionAssessmentInput):ScoringSessionEvent[] {
  const events:ScoringSessionEvent[]=[];
  const add=(eventType:string,targetId:string|null,values:Record<string,string>={},timestampMs=(events.length+1)*1000)=>events.push({sequenceNumber:events.length+1,timestampMs,eventType,targetId,payload:Object.entries(values).map(([key,value])=>({key,value}))});
  for(const c of input.checkpoints) {
    if(c.wasEligible)add('ReasoningCheckpointEligible',c.checkpointId,{contentVersion:'1.0.0'});
    if(c.responseId)add('ReasoningCheckpointSubmitted',c.checkpointId,{responseId:c.responseId,weight:'999',maximumWeight:'999',responseOrder:String(c.responseOrder),eligibleSeconds:String(c.eligibleSeconds),answeredSeconds:String(c.answeredSeconds),contentVersion:'1.0.0'},c.answeredSeconds*1000);
  }
  for(const a of input.relationshipResponses??[])add('RelationshipInterpretationSubmitted',a.relationshipId,
    {responseId:a.responseId,responseOrder:String(a.responseOrder),answeredSeconds:String(a.answeredSeconds),reviewVersion:'1'});
  add('DeductionAssessmentSnapshot',input.selectedConclusionId,{assessment:JSON.stringify(input)});
  add('InvestigationCompleted',null);add('SessionEnded',null);return events;
}
export function resultFor(input=snapshot()):ResultDetail {
  const events=eventsFor(input);
  const score=scoreDeductionEvents(events,{sessionId:'fixture',scenarioId:rules.scenarioId,selectedConclusionId:input.selectedConclusionId,resolvedEndingId:input.resolvedEndingId},'2026-10-12T01:00:00Z',rules);
  const result:ResultDetail={sessionId:'fixture',receiptId:'fixture-receipt',studentId:'fixture-student',classId:'fixture-class',scenarioId:rules.scenarioId,scenarioDisplayName:'The Last Drink',scenarioVersion:'1.1.0',groundTruthVersion:'1.2.0',scoringVersion:'1.7.0',startedAtUtc:'2026-10-12T00:00:00Z',completedAtUtc:'2026-10-12T01:00:00Z',durationSeconds:3600,selectedConclusionId:input.selectedConclusionId,resolvedEndingId:input.resolvedEndingId,verificationStatus:score.status==='complete'?'verified':'requires_review',verifiedScore:score.overallScore??null,serverReceivedAtUtc:'2026-10-12T01:01:00Z',verificationMessage:null,verifiedAtUtc:'2026-10-12T01:01:00Z',clientReported:{hasScores:false,relationshipsCorrect:null,relationshipsIncorrect:null,objectivesCompleted:null,objectivesFailed:null,proceduralViolationCount:null},categories:score.categories as Record<string,number>,assessmentComponents:score.categories as Record<string,number>,procedureViolations:[],missedEvidence:[],relationships:input.completedRelationshipIds.map(relationshipId=>({relationshipId,state:'Completed',wasEverSelected:true})),events,evidenceResults:[],hypotheses:[],confirmedFindingIds:input.confirmedFindingIds,unlockedInsightIds:[]};
  result.assessment=buildAssessmentPresentation(result);return result;
}
