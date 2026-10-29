import {test} from "node:test";
import assert from "node:assert/strict";
import {resolveSessionScoring} from "../registry.ts";
import {scoreDeductionAssessment,scoreDeductionEvents} from "../deductionAssessmentScorer.ts";
import {mergeAssessmentEvents} from "../assessmentEventEnvelope.ts";
import {computeOverallScore} from "../overallScore.ts";
import type {DeductionAssessmentInput,ScoringSessionEvent} from "../types.ts";

const rules=resolveSessionScoring("CSI-ENVIRONMENT-001","1.2.0","1.7.0").scoringRules!.deduction!;
function fixture(weights=[4,4,4,4,4,4]):DeductionAssessmentInput {
  return {scoringRulesVersion:"1.7.0",contentVersion:"1.0.0",selectedConclusionId:rules.supportedConclusionId,resolvedEndingId:rules.supportedEndingId,
    atConclusion:true,requiresSceneRelease:true,checkpointSystemReady:true,form1Received:true,victimObserved:true,sceneSecurityAcknowledged:true,
    iocObservationIds:["ioc-possible-weapon","ioc-bloodstain-area"],confirmedFindingIds:[...rules.supportedFindingIds],
    discoveredStatementIds:[rules.supportedStatementId],observedEvidenceIds:["BODY-A","EVD-014","EVD-015","EVD-018"],
    checkpoints:rules.checkpoints.map((c,i)=>({checkpointId:c.id,responseId:c.responses.find(r=>r.weight===weights[i])!.id,wasEligible:true,responseOrder:i+1,eligibleSeconds:10+i*10,answeredSeconds:15+i*10})),
    completedRelationshipIds:rules.relationships.map(r=>r.id),boardConnections:rules.relationships.map(r=>({sourceId:r.sourceId,targetId:r.targetId}))};
}
function eventsFor(input:DeductionAssessmentInput):ScoringSessionEvent[] {
  const events:ScoringSessionEvent[]=[];
  const add=(type:string,id:string,values:Record<string,string>={})=>events.push({sequenceNumber:events.length+1,timestampMs:(events.length+1)*1000,eventType:type,targetId:id,payload:Object.entries(values).map(([key,value])=>({key,value}))});
  for(const c of input.checkpoints) {
    if(c.wasEligible)add("ReasoningCheckpointEligible",c.checkpointId,{contentVersion:"1.0.0"});
    if(c.responseId)add("ReasoningCheckpointSubmitted",c.checkpointId,{responseId:c.responseId,weight:"999",maximumWeight:"999",responseOrder:String(c.responseOrder),eligibleSeconds:String(c.eligibleSeconds),answeredSeconds:String(c.answeredSeconds),contentVersion:"1.0.0"});
  }
  add("DeductionAssessmentSnapshot",input.selectedConclusionId,{assessment:JSON.stringify(input)});
  add("InvestigationCompleted","");add("SessionEnded","");return events;
}
const context=(i:DeductionAssessmentInput)=>({sessionId:"test",scenarioId:"CSI-ENVIRONMENT-001",selectedConclusionId:i.selectedConclusionId,resolvedEndingId:i.resolvedEndingId});
const score=(i:DeductionAssessmentInput,completed=true)=>scoreDeductionAssessment(i,completed,rules);
const close=(a:number|undefined,b:number)=>assert.ok(a!==undefined&&Math.abs(a-b)<1e-9,`${a} != ${b}`);

test("new rules are explicit 60/25/15 with no legacy category contributions",()=>{
  assert.equal(rules.checkpointWeight,60);assert.equal(rules.relationshipWeight,25);assert.equal(rules.conclusionWeight,15);
  assert.equal(rules.validationStatus,"RESEARCH_CONFIGURATION_REQUIRES_EXPERT_VALIDATION");
  assert.ok(Object.values(resolveSessionScoring("CSI-ENVIRONMENT-001","1.2.0","1.7.0").scoringRules!.categoryWeights).every(w=>w===0));
});
test("six maximum responses earn 60, supported six relationships 25, conclusion 15, total 100",()=>{
  const r=score(fixture());assert.equal(r.status,"complete");close(r.categories.reasoningCheckpointComponent,60);
  close(r.categories.deductionRelationshipComponent,25);close(r.categories.finalConclusionComponent,15);close(r.totalScore,100);close(r.overallScore,1);
});
test("mixed locked weights normalize against 24 without bonuses",()=>{
  const i=fixture([3,3,3,3,2,2]);i.completedRelationshipIds=i.completedRelationshipIds.slice(0,3);i.boardConnections=[];i.resolvedEndingId=rules.prematureEndingId;
  const r=score(i);close(r.categories.reasoningCheckpointComponent,40);close(r.categories.deductionRelationshipComponent,12.5);close(r.totalScore,56.25);
});
test("weak assumptions and unsupported Peter accusation earn low deduction grade",()=>{
  const i=fixture([1,1,1,1,2,2]);i.completedRelationshipIds=[];i.boardConnections=[{sourceId:"EVD-014",targetId:"statement_peter_timeline"}];
  i.selectedConclusionId=rules.peterConclusionId;i.resolvedEndingId=rules.peterEndingId;
  const r=score(i);close(r.totalScore,20);close(r.categories.deductionRelationshipComponent,0);close(r.categories.finalConclusionComponent,0);
});
test("eligible unanswered response remains in fixed denominator",()=>{
  const i=fixture();i.checkpoints[0].responseId="";i.checkpoints[0].responseOrder=0;
  const r=score(i);assert.equal(r.status,"complete");assert.equal(r.categories.reasoningCheckpointMaximum,24);assert.equal(r.categories.reasoningCheckpointEligibleUnanswered,1);close(r.categories.reasoningCheckpointComponent,50);
});
test("concluding before later discovery retains missing opportunity in denominator",()=>{
  const i=fixture();i.confirmedFindingIds=i.confirmedFindingIds.filter(id=>id!=="FIND-SPATTER-RECONSTRUCTION");
  i.checkpoints[5].wasEligible=false;i.checkpoints[5].responseId="";i.checkpoints[5].responseOrder=0;
  i.completedRelationshipIds=i.completedRelationshipIds.filter(id=>id!=="REL-spatter-consistent-reconstruction");i.resolvedEndingId=rules.prematureEndingId;
  const r=score(i);assert.equal(r.status,"complete");assert.equal(r.categories.reasoningCheckpointUndiscovered,1);assert.equal(r.categories.reasoningCheckpointMaximum,24);close(r.categories.reasoningCheckpointComponent,50);
});
test("facts reached but missing eligibility is a technical review, not a zero grade",()=>{
  const i=fixture();i.checkpoints[2].wasEligible=false;i.checkpoints[2].responseId="";
  const r=score(i);assert.equal(r.status,"requires_review");assert.equal(r.totalScore,undefined);
});
test("unavailable checkpoint system/content suppresses final grade",()=>{
  const i=fixture();i.checkpointSystemReady=false;assert.equal(score(i).totalScore,undefined);i.checkpointSystemReady=true;i.contentVersion="unknown";assert.equal(score(i).status,"requires_review");
});
test("supported relationship quality uses all six authored IDs including timeline contradiction",()=>{
  assert.equal(rules.relationships.length,6);assert.ok(rules.relationships.some(r=>r.id==="REL-paul-timeline-contradiction"));
  const i=fixture();i.completedRelationshipIds=[];i.boardConnections=[];i.resolvedEndingId=rules.prematureEndingId;close(score(i).categories.deductionRelationshipComponent,0);
  i.completedRelationshipIds=["REL-paul-timeline-contradiction"];close(score(i).categories.deductionRelationshipComponent,25/6);
});
test("relationships connected without supporting facts earn no credit",()=>{
  const i=fixture();i.completedRelationshipIds=["REL-knife-consistent-wound"];i.boardConnections=[];i.confirmedFindingIds=[];
  for(const c of i.checkpoints.slice(2)){c.wasEligible=c.checkpointId==="RC-05-TIMELINE";if(!c.wasEligible){c.responseId="";c.responseOrder=0;}}
  i.resolvedEndingId=rules.prematureEndingId;close(score(i).categories.deductionRelationshipComponent,0);
});
test("unsupported current connections reduce quality; corrected/removed attempts do not",()=>{
  const i=fixture();i.boardConnections.push({sourceId:"EVD-014",targetId:"statement_peter_timeline"});
  close(score(i).categories.deductionRelationshipComponent,25*5/6);i.boardConnections.pop();close(score(i).categories.deductionRelationshipComponent,25);
});
test("duplicate completed IDs/pairs never create extra relationship credit or penalty",()=>{
  const i=fixture();i.completedRelationshipIds.push(...i.completedRelationshipIds);i.boardConnections.push(...i.boardConnections);close(score(i).totalScore,100);
});
test("Supported Paul requires full evidence/relationship/physical Vendor chain",()=>{
  const i=fixture();close(score(i).categories.finalConclusionComponent,15);i.completedRelationshipIds=i.completedRelationshipIds.filter(id=>id!=="REL-paul-timeline-contradiction");
  assert.equal(score(i).status,"requires_review");assert.equal(score(i).totalScore,undefined);
});
test("Premature Paul is partial support, not suspect-guess full credit",()=>{
  const i=fixture();i.completedRelationshipIds=[];i.boardConnections=[];i.resolvedEndingId=rules.prematureEndingId;close(score(i).categories.finalConclusionComponent,3.75);
  i.completedRelationshipIds=rules.relationships.map(r=>r.id);assert.equal(score(i).status,"requires_review");
});
test("Peter unsupported conclusion has zero conclusion credit",()=>{
  const i=fixture();i.selectedConclusionId=rules.peterConclusionId;i.resolvedEndingId=rules.peterEndingId;close(score(i).categories.finalConclusionComponent,0);
});
test("Inconclusive is strong with insufficient support, lower with full chain",()=>{
  const i=fixture();i.selectedConclusionId=rules.inconclusiveConclusionId;i.resolvedEndingId=rules.inconclusiveEndingId;
  close(score(i).categories.finalConclusionComponent,3.75);i.completedRelationshipIds=[];i.boardConnections=[];close(score(i).categories.finalConclusionComponent,15);
});
test("incomplete session/absent conclusion emits no polished final grade",()=>{
  const i=fixture();assert.equal(score(i,false).status,"incomplete");assert.equal(score(i,false).totalScore,undefined);
  i.atConclusion=false;i.selectedConclusionId="";i.resolvedEndingId="";assert.equal(score(i).status,"incomplete");
  assert.equal(scoreDeductionAssessment(null,false,rules).overallScore,undefined);
});
test("no relationships, no responses and missing data never divide by zero/crash",()=>{
  const i=fixture();i.checkpoints.forEach(s=>{s.responseId="";s.responseOrder=0;});i.completedRelationshipIds=[];i.boardConnections=[];i.resolvedEndingId=rules.prematureEndingId;
  close(score(i).totalScore,3.75);assert.equal(scoreDeductionAssessment(null,true,rules).status,"requires_review");
});
test("invalid scoring configuration is rejected instead of concealed by a 100 clamp",()=>{
  assert.equal(scoreDeductionAssessment(fixture(),true,{...rules,conclusionWeight:30}).status,"requires_review");
  assert.equal(scoreDeductionAssessment(fixture(),true,{...rules,supportedConclusionCredit:2}).totalScore,undefined);
});
test("stable IDs resolve weights on server even when every uploaded weight claims 999",()=>{
  const i=fixture([1,1,1,1,2,2]);const r=scoreDeductionEvents(eventsFor(i),context(i),"2026-10-12T00:00:00Z",rules);
  close(r.categories.reasoningCheckpointComponent,20);assert.equal(r.status,"complete");
});
test("original locked submission rejects altered later response in snapshot",()=>{
  const i=fixture();const events=eventsFor(i);const ev=events.find(e=>e.eventType==="ReasoningCheckpointSubmitted")!;
  ev.payload.find(p=>p.key==="responseId")!.value="RC-01-PETER-A";
  const r=scoreDeductionEvents(events,context(i),"2026-10-12T00:00:00Z",rules);assert.equal(r.status,"requires_review");assert.equal(r.overallScore,undefined);
});
test("procedures, ProcedureOutOfOrder, time and old HYP/report answers do not affect new aggregate",()=>{
  const i=fixture(),events=eventsFor(i),before=scoreDeductionEvents(events,context(i),"2026-10-12T00:00:00Z",rules);
  for(const type of ["ProcedureOutOfOrder","EvidenceStatusChanged","PhotoTaken","EvidenceTraceMarked","EvidenceInventoryConfirmed","SceneReleaseConfirmed","HypothesisSubmitted","ReportLinesSelected","EvidenceTransitionBlocked"])
    events.push({sequenceNumber:events.length+1,timestampMs:999999999,eventType:type,targetId:"EVD-014",payload:[{key:"weight",value:"-999"}]});
  assert.deepEqual(scoreDeductionEvents(events,context(i),"2026-10-12T00:00:00Z",rules),before);
});
test("missing scene release/completion event leaves incomplete session ungraded",()=>{
  const i=fixture(),events=eventsFor(i).filter(e=>e.eventType!=="InvestigationCompleted");
  const r=scoreDeductionEvents(events,context(i),"2026-10-12T00:00:00Z",rules);assert.equal(r.status,"incomplete");assert.equal(r.overallScore,undefined);
});
test("malformed snapshots and mismatched stored endings require review without crash",()=>{
  const i=fixture(),events=eventsFor(i);events.find(e=>e.eventType==="DeductionAssessmentSnapshot")!.payload[0].value="{\"checkpoints\":null}";
  assert.equal(scoreDeductionEvents(events,context(i),"date",rules).status,"requires_review");
  assert.equal(scoreDeductionEvents(eventsFor(i),{...context(i),selectedConclusionId:"other"},"date",rules).overallScore,undefined);
});
test("essential envelope preserves records with raw log disabled/capped and ignores client scores",()=>{
  const i=fixture(),essential=eventsFor(i),payload={scoringRulesVersion:"1.7.0",payloadVersion:1,orderedEvents:[],deductionAssessmentEvents:essential,deductionAssessment:{totalScore:999}};
  const merged=mergeAssessmentEvents(payload);assert.equal((merged.orderedEvents as unknown[]).length,essential.length);
  close(scoreDeductionEvents(merged.orderedEvents as ScoringSessionEvent[],context(i),"date",rules).totalScore,100);
  assert.equal((mergeAssessmentEvents({...payload,orderedEvents:essential.slice(0,2)}).orderedEvents as unknown[]).length,essential.length);
  assert.equal((mergeAssessmentEvents({...payload,scoringRulesVersion:"1.6.0"}).orderedEvents as unknown[]).length,0);
});
test("envelope refuses conflicting duplicates/unexpected essential event types",()=>{
  const ev=eventsFor(fixture())[0];assert.throws(()=>mergeAssessmentEvents({scoringRulesVersion:"1.7.0",orderedEvents:[ev],deductionAssessmentEvents:[{...ev,targetId:"tampered"}]}));
  assert.throws(()=>mergeAssessmentEvents({scoringRulesVersion:"1.7.0",deductionAssessmentEvents:[{...ev,eventType:"other"}]}));
});
test("all response combinations produce totals within 0-100",()=>{
  for(let n=0;n<4096;n++){const weights=Array.from({length:6},(_,k)=>1+((n>>(k*2))&3));
    // RC-02/04 have no authored 2 response. Select nearest existing internal weight.
    weights.forEach((w,k)=>{if(!rules.checkpoints[k].responses.some(r=>r.weight===w))weights[k]=1;});
    const r=score(fixture(weights));assert.ok(r.totalScore!>=0&&r.totalScore!<=100);}
});
test("1.6.0 formula and missing-version historical fallbacks remain unchanged",()=>{
  const old=resolveSessionScoring("CSI-ENVIRONMENT-001","1.2.0","1.6.0");assert.equal(old.scoringRules!.deduction,undefined);
  close(computeOverallScore({reasoningAccuracy:.5,documentationAccuracy:.75,relationshipAccuracy:.4,finalConclusionAccuracy:0},old.scoringRules!.categoryWeights),.35);
  assert.equal(resolveSessionScoring("CSI-ENVIRONMENT-001",null,null).scoringRulesVersion,"1.0.0");
  for(const version of ["1.0.0","1.1.0","1.2.0","1.3.0","1.4.0","1.5.0","1.6.0"])
    assert.equal(resolveSessionScoring("CSI-ENVIRONMENT-001","1.2.0",version).scoringRules!.deduction,undefined);
});
test("authored maximum/response range prevents hidden extra bonuses",()=>{
  assert.equal(rules.checkpoints.length,6);assert.equal(rules.maximumCheckpointWeight,4);
  assert.ok(rules.checkpoints.every(c=>c.responses.length===4&&c.responses.every(r=>r.weight>=1&&r.weight<=4)));
  assert.equal(rules.checkpointWeight+rules.relationshipWeight+rules.conclusionWeight,100);
});

test("custody pass analytics cannot change deduction grades or weights",()=>{
  const input=fixture(),events=eventsFor(input);
  const baseline=scoreDeductionEvents(events,context(input),"date",rules);
  const lastSequence=Math.max(...events.map(e=>e.sequenceNumber));
  const custody=["EvidenceDeposited","CustodyPassCompleted"].map((eventType,index)=>({
    sequenceNumber:lastSequence+index+1,timestampMs:10000+index,eventType,targetId:"EvidenceBox",payload:[
      {key:"scored",value:"true"},{key:"totalScore",value:"999"},{key:"itemCount",value:"6"},
    ],
  }));
  assert.deepEqual(scoreDeductionEvents([...events,...custody],context(input),"date",rules),baseline);
});
