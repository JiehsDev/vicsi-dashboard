import {createHash} from 'node:crypto';
import {resolveSessionScoring} from '../../src/lib/scoring/registry';
import {scoreDeductionAssessment,scoreDeductionEvents} from '../../src/lib/scoring/deductionAssessmentScorer';
import {REASONING_DISPLAY_CONTENT} from '../../src/lib/reasoningDisplayContent';
import {mergeAssessmentEvents} from '../../src/lib/scoring/assessmentEventEnvelope';
import {buildRecorderDocumentation} from '../../src/lib/recorderDocumentation';
import catalog from '../../src/lib/data/recorderDocumentation.v2.json' with {type:'json'};
import type {DeductionAssessmentInput,ScoringSessionEvent} from '../../src/lib/scoring/types';
import type {QuestionRecord} from '../../src/lib/sessionRecord';

export const DEMO_SOURCE='vicsi-dashboard-demo-v1';
export const DEMO_CLASS='ViCSI Demonstration — Evidence & Deduction';
export const DEMO_STUDENTS=[
  {code:'DEMO-26001',name:'Ana Reyes (Demo)',levels:[2,3,4]},
  {code:'DEMO-26002',name:'Miguel Santos (Demo)',levels:[1,2,3]},
  {code:'DEMO-26003',name:'Sofia Cruz (Demo)',levels:[3,4,4]},
  {code:'DEMO-26004',name:'Carlo Mendoza (Demo)',levels:[1,1,2]},
  {code:'DEMO-26005',name:'Bea Villanueva (Demo)',levels:[2,3,4]},
  {code:'DEMO-26006',name:'Diego Ramos (Demo)',levels:[2,2,3]},
];
export const demoUuid=(key:string)=>{
  const hex=createHash('sha256').update(`${DEMO_SOURCE}:${key}`).digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
};
export function buildDemoSession(studentId:string,classId:string,code:string,attempt:number,level:number){
  const rules=resolveSessionScoring('CSI-ENVIRONMENT-001','1.2.0','1.7.0').scoringRules!.deduction!;
  const duration=2400-level*180+attempt*75;
  const started=new Date(Date.UTC(2026,9,28+attempt*3,1+level,attempt*7));
  const completed=new Date(started.getTime()+duration*1000).toISOString();
  const wrongRelationships=level===4?0:level===3?1:level===2?2:3;
  const input:DeductionAssessmentInput={
    scoringRulesVersion:rules.scoringRulesVersion,contentVersion:rules.contentVersion,
    atConclusion:true,requiresSceneRelease:true,checkpointSystemReady:true,form1Received:true,victimObserved:true,sceneSecurityAcknowledged:true,
    iocObservationIds:['ioc-possible-weapon','ioc-bloodstain-area'],confirmedFindingIds:[...rules.supportedFindingIds],
    discoveredStatementIds:[rules.supportedStatementId],observedEvidenceIds:['BODY-A','EVD-014','EVD-015','EVD-018'],
    checkpoints:rules.checkpoints.map((c,i)=>{
      const sorted=[...c.responses].sort((a,b)=>b.weight-a.weight);
      const response=level===4?sorted[0]:sorted[Math.min(level===3?(i%3===0?1:0):level===2?1:sorted.length-1,sorted.length-1)];
      const eligible=c.trigger===0?45:c.trigger===1?95:1100+(i-2)*80;
      return {checkpointId:c.id,responseId:response.id,wasEligible:true,responseOrder:i+1,eligibleSeconds:eligible,answeredSeconds:eligible+25};
    }),
    completedRelationshipIds:[],boardConnections:[],relationshipReviewVersion:1,
    relationshipResponses:rules.relationships.map((r,i)=>({relationshipId:r.id,responseId:i<wrongRelationships?r.interpretations!.find(a=>a.id!==r.correctInterpretationId)!.id:r.correctInterpretationId!,responseOrder:i+1,answeredSeconds:duration-240+i*12})),
    selectedConclusionId:level===1?rules.peterConclusionId:rules.supportedConclusionId,
    resolvedEndingId:level===1?rules.peterEndingId:wrongRelationships?rules.prematureEndingId:rules.supportedEndingId,
    questionRecordVersion:1,
  };
  const correctIds=new Set(input.relationshipResponses!.filter(a=>rules.relationships.find(r=>r.id===a.relationshipId)?.correctInterpretationId===a.responseId).map(a=>a.relationshipId));
  const fullChain=rules.supportedRelationshipIds.every(id=>correctIds.has(id));
  if(level!==1)input.resolvedEndingId=fullChain?rules.supportedEndingId:rules.prematureEndingId;
  const questions:QuestionRecord[]=rules.checkpoints.map(r=>{
    const s=input.checkpoints.find(c=>c.checkpointId===r.id)!,text=REASONING_DISPLAY_CONTENT[r.id];
    return {id:r.id,category:'Reasoning',dimension:r.category,question:text.prompt,wasAvailable:true,selectedAnswerId:s.responseId,answeredSeconds:s.answeredSeconds,maximumWeight:4,selectedAnswerWeight:r.responses.find(a=>a.id===s.responseId)!.weight,options:r.responses.map(a=>({...a,text:text.responses[a.id]}))};
  });
  questions.push(...rules.relationships.map(r=>{
    const s=input.relationshipResponses!.find(a=>a.relationshipId===r.id)!;
    return {id:r.id,category:'Evidence Relationships',dimension:'',question:r.reviewPrompt!,wasAvailable:true,selectedAnswerId:s.responseId,answeredSeconds:s.answeredSeconds,maximumWeight:r.weight,selectedAnswerWeight:s.responseId===r.correctInterpretationId?r.weight:-rules.unsupportedRelationshipPenalty,options:r.interpretations!.map(a=>({...a,weight:a.id===r.correctInterpretationId?r.weight:-rules.unsupportedRelationshipPenalty}))};
  }));
  const conclusionOptions=[
    {id:rules.supportedConclusionId,text:'Paul',endingId:fullChain?rules.supportedEndingId:rules.prematureEndingId},
    {id:rules.peterConclusionId,text:'Peter',endingId:rules.peterEndingId},
    {id:rules.inconclusiveConclusionId,text:'Inconclusive',endingId:rules.inconclusiveEndingId},
  ].map(a=>({...a,weight:scoreDeductionAssessment({...input,selectedConclusionId:a.id,resolvedEndingId:a.endingId},false,rules).categories.finalConclusion!}));
  questions.push({id:'FINAL-CONCLUSION',category:'Final Conclusion',dimension:'',question:'Submit your conclusion:',wasAvailable:true,selectedAnswerId:input.selectedConclusionId,answeredSeconds:duration-90,maximumWeight:1,selectedAnswerWeight:conclusionOptions.find(a=>a.id===input.selectedConclusionId)!.weight,options:conclusionOptions});
  input.questionRecords=questions;

  const events:ScoringSessionEvent[]=[];
  const add=(seconds:number,eventType:string,targetId:string|null=null,values:Record<string,string>={})=>events.push({sequenceNumber:0,timestampMs:Math.round(seconds*1000),eventType,targetId,payload:Object.entries(values).map(([key,value])=>({key,value}))});
  add(0,'SessionStarted',null,{source:DEMO_SOURCE,synthetic:'true'});
  for(const [seconds,eventType] of [[5,'SceneLogSigned'],[10,'PPEEquipped'],[15,'SceneTurnoverCompleted'],[35,'CSIForm1Received'],[85,'IOCAssessmentCompleted'],[120,'SOCORequested'],[140,'CSIForm2Completed'],[160,'SOCOTurnoverCompleted'],[210,'ScenePhotographyCompleted']] as const)add(seconds,eventType);
  add(50,'EvidenceStatusChanged','BODY-A',{status:'Found'});
  for(const [i,id] of ['ioc-possible-weapon','ioc-bloodstain-area'].entries())add(70+i*5,'IOCObservationRecorded',id);
  for(const c of input.checkpoints){
    add(c.eligibleSeconds,'ReasoningCheckpointEligible',c.checkpointId,{contentVersion:rules.contentVersion});
    add(c.answeredSeconds,'ReasoningCheckpointSubmitted',c.checkpointId,{responseId:c.responseId,weight:String(rules.checkpoints.find(r=>r.id===c.checkpointId)!.responses.find(r=>r.id===c.responseId)!.weight),maximumWeight:'4',responseOrder:String(c.responseOrder),eligibleSeconds:String(c.eligibleSeconds),answeredSeconds:String(c.answeredSeconds),contentVersion:rules.contentVersion});
  }
  const reportLineResults:Array<{evidenceId:string;lineId:string}>=[];
  for(const [i,subject] of catalog.subjects.entries()){
    const start=250+i*220;
    add(start,'EvidenceStatusChanged',subject.id,{status:'Found'});
    add(start+15,'EvidenceStatusChanged',subject.id,{status:'Marked',tentNumber:String(i+1)});
    add(start+30,'PhotographicScaleCaptured',subject.id);
    add(start+45,'MeasurementCompleted',subject.id);
    const supported=level===4?3:level===3?(i===2?2:3):level===2?2:1;
    const selected=[...subject.statements.filter(s=>s.weight===2).slice(0,supported),...subject.statements.filter(s=>s.weight===0).slice(0,3-supported)].map(s=>s.id);
    const statements=subject.statements.map(s=>({...s,selected:selected.includes(s.id),earnedPoints:selected.includes(s.id)?s.weight:0}));
    const documentation={version:catalog.version,subjectId:subject.id,subjectLabel:subject.label,statements,earnedPoints:statements.reduce((n,s)=>n+s.earnedPoints,0),maximumPossiblePoints:6};
    add(start+65,'ReportLinesSelected',subject.id,{lineIds:selected.join(','),lineCount:'3',documentationVersion:String(catalog.version),documentation:JSON.stringify(documentation)});
    reportLineResults.push(...selected.map(lineId=>({evidenceId:subject.id,lineId})));
    if(subject.id!=='BODY-A'){
      add(start+75,'EvidenceSwabbed',subject.id);
      add(start+85,'SampleDryingCompleted',subject.id);
      add(start+90,'SampleDryingRetrieved',subject.id);
      add(start+95,'SamplePackaged',subject.id,{workflow:'swab-dry-before-containment-v1'});
      if(subject.id!=='EVD-015')add(start+100,'EvidenceFingerprintProcessed',subject.id);
      add(start+105,'EvidenceStatusChanged',subject.id,{status:'Sealed'});
      add(start+120,'EvidenceDeposited',subject.id,{boxId:'Evidence transport box',sourceEvidenceId:subject.id});
    }
  }
  add(1070,'FingerprintIdentified','EVD-014',{matches:JSON.stringify({identities:['Paul']})});
  add(1180,'WitnessStatementDiscovered',rules.supportedStatementId);
  add(1200,'BodyDocumentationRecorded','BODY-A');add(1220,'BodyPreparedForRemoval','BODY-A');add(1250,'BodyRemoved','BODY-A');
  add(1300,'SketchSubmitted');add(1350,'CustodyPassCompleted');
  for(const a of input.relationshipResponses!)add(a.answeredSeconds,'RelationshipInterpretationSubmitted',a.relationshipId,{responseId:a.responseId,responseOrder:String(a.responseOrder),answeredSeconds:String(a.answeredSeconds),reviewVersion:'1'});
  add(duration-90,'ConclusionSelected',input.selectedConclusionId);
  add(duration-89,'DeductionAssessmentSnapshot',input.selectedConclusionId,{assessment:JSON.stringify(input)});
  add(duration-60,'EvidenceInventoryConfirmed');add(duration-40,'FinalSceneSurveyCompleted');add(duration-20,'SceneReleaseConfirmed');
  add(duration-5,'InvestigationCompleted');add(duration,'SessionEnded');
  events.sort((a,b)=>a.timestampMs-b.timestampMs);events.forEach((e,i)=>e.sequenceNumber=i+1);
  const payload={payloadVersion:1,sessionId:demoUuid(`${code}:${attempt}`),studentId,classId,isTestSession:true,
    scenarioId:rules.scenarioId,scenarioVersion:rules.scenarioVersion,scoringRulesVersion:rules.scoringRulesVersion,groundTruthVersion:rules.groundTruthVersion,
    clientVersion:DEMO_SOURCE,startedAtUtc:started.toISOString(),completedAtUtc:completed,durationSeconds:duration,
    selectedConclusionId:input.selectedConclusionId,resolvedEndingId:input.resolvedEndingId,hasClientReportedScores:false,
    evidenceResults:['EVD-014','EVD-015','EVD-018'].map((evidenceId,i)=>({evidenceId,finalStatus:'Stored',swabbingDone:true,fingerprintingDone:evidenceId!=='EVD-015',isFlipped:false,fingerprintLabStatus:evidenceId==='EVD-015'?'NotSent':'Identified',tentNumber:i+2,tentLetter:''})),
    reportLineResults,orderedEvents:events};
  mergeAssessmentEvents(payload);
  const score=scoreDeductionEvents(events,{sessionId:payload.sessionId,scenarioId:rules.scenarioId,selectedConclusionId:input.selectedConclusionId,resolvedEndingId:input.resolvedEndingId},completed,rules);
  if(score.status!=='complete')throw Error('Demo session did not pass scoring validation: '+score.reviewReasons.join('; '));
  return {payload,score,documentation:buildRecorderDocumentation(events)};
}
