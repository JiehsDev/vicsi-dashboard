import "server-only";
import { payloadValue } from "./types.ts";
import type { DeductionAssessmentInput, DeductionScoringDefinition, ScoreCategories, ScoringSessionEvent, ScoringSessionContext } from "./types.ts";

export interface DeductionAssessmentOutput {
  status: "complete" | "incomplete" | "requires_review";
  categories: ScoreCategories;
  overallScore?: number; // Existing backend convention: 0-1; percentage = *100.
  totalScore?: number;   // Audit-friendly 0-100.
  reviewReasons: string[];
  review?: {
    checkpoints: Array<{checkpointId:string;responseId:string;category:string;strength:number}>;
    relationships: Array<{relationshipId:string;supported:boolean;responseId?:string;responseOrder?:number}>;
    conclusion: "supported_paul" | "premature_paul" | "unsupported_peter" | "inconclusive_insufficient" | "inconclusive_supported" | "not_recorded";
  };
}
const pair = (a:string,b:string) => [a,b].sort().join("|");
export function checkpointTriggerSatisfied(c:DeductionScoringDefinition["checkpoints"][number], input:DeductionAssessmentInput, rules:DeductionScoringDefinition):boolean {
  switch(c.trigger) {
    case 0:return input.form1Received;
    case 1:return input.form1Received && input.victimObserved && input.sceneSecurityAcknowledged
      && input.iocObservationIds.includes("ioc-possible-weapon") && input.iocObservationIds.includes("ioc-bloodstain-area");
    case 2:return input.confirmedFindingIds.includes(c.findingId);
    case 3:return input.form1Received && input.discoveredStatementIds.includes(rules.supportedStatementId);
    default:return false;
  }
}
const supported = (r:DeductionScoringDefinition["relationships"][number], input:DeductionAssessmentInput) =>
  r.findingIds.every(id=>input.confirmedFindingIds.includes(id))
  && (!r.statementId || input.discoveredStatementIds.includes(r.statementId))
  && (!r.evidenceId || input.observedEvidenceIds.includes(r.evidenceId)) && (!r.requiresForm1 || input.form1Received);

/** Fixed denominators; neither procedural data nor legacy HYP/report ratios enter
 * this function. Response weights are resolved exclusively from server rules. */
export function scoreDeductionAssessment(input:DeductionAssessmentInput|null, completed:boolean, rules:DeductionScoringDefinition):DeductionAssessmentOutput {
  const reviewReasons:string[]=[];
  const categories:ScoreCategories={reasoningCheckpointMaximum:rules.checkpoints.length*rules.maximumCheckpointWeight,deductionAssessmentComplete:0};
  if(!input) return {status:completed?"requires_review":"incomplete",categories,reviewReasons:["Conclusion-time assessment snapshot missing."]};
  if([rules.checkpointWeight,rules.relationshipWeight,rules.conclusionWeight].some(w=>!Number.isFinite(w)||w<0)
    || Math.abs(rules.checkpointWeight+rules.relationshipWeight+rules.conclusionWeight-100)>.001 || categories.reasoningCheckpointMaximum!<=0
    || !rules.relationships.length || rules.relationships.some(r=>!Number.isFinite(r.weight)||r.weight<=0)
    || !Number.isFinite(rules.unsupportedRelationshipPenalty) || rules.unsupportedRelationshipPenalty<0
    || [rules.supportedConclusionCredit,rules.prematureConclusionCredit,rules.peterConclusionCredit,rules.inconclusiveInsufficientCredit,rules.inconclusiveSupportedCredit].some(v=>!Number.isFinite(v)||v<0||v>1)
    || rules.checkpoints.some(c=>c.responses.some(r=>r.weight<1||r.weight>rules.maximumCheckpointWeight)))
    return {status:"requires_review",categories,reviewReasons:["Invalid scoring definition; weights or denominators are inconsistent."]};
  if(input.scoringRulesVersion!==rules.scoringRulesVersion || input.contentVersion!==rules.contentVersion || !input.checkpointSystemReady)
    reviewReasons.push("Checkpoint system/content version unavailable or inconsistent.");
  const review: NonNullable<DeductionAssessmentOutput["review"]> = {checkpoints:[],relationships:[],conclusion:"not_recorded"};
  const states=new Map(input.checkpoints.map(s=>[s.checkpointId,s]));
  if(states.size!==input.checkpoints.length || input.checkpoints.some(s=>!rules.checkpoints.some(c=>c.id===s.checkpointId)))
    reviewReasons.push("Duplicate or unknown checkpoint state.");
  let earned=0,answered=0,eligibleUnanswered=0,undiscovered=0;
  for(const c of rules.checkpoints) {
    const state=states.get(c.id),ready=checkpointTriggerSatisfied(c,input,rules);
    if(!state) {reviewReasons.push(`${c.id}: checkpoint state missing.`);continue;}
    if(ready!==state.wasEligible) reviewReasons.push(`${c.id}: observed facts and recorded eligibility disagree.`);
    if(!state.responseId) {if(state.wasEligible)eligibleUnanswered++;else undiscovered++;continue;}
    const response=c.responses.find(r=>r.id===state.responseId);
    if(!state.wasEligible || !response || state.responseOrder<=0 || state.answeredSeconds<state.eligibleSeconds) {
      reviewReasons.push(`${c.id}: invalid locked response record.`);continue;
    }
    earned+=response.weight;answered++;
    review.checkpoints.push({checkpointId:c.id,responseId:state.responseId,category:c.category,strength:response.weight});
  }
  const orders=input.checkpoints.filter(s=>s.responseId).map(s=>s.responseOrder);
  if(new Set(orders).size!==orders.length)reviewReasons.push("Duplicate chronological response order.");
  const completedIds=new Set(input.completedRelationshipIds),supportedIds=new Set<string>();
  let relationshipEarned=0,unsupportedCount=0;
  if(input.relationshipReviewVersion) {
    completedIds.clear();
    const answers=input.relationshipResponses;
    if(input.relationshipReviewVersion!==1 || !Array.isArray(answers)
      || answers.some(a=>!a || typeof a.relationshipId!=="string" || typeof a.responseId!=="string"
        || !Number.isInteger(a.responseOrder) || a.responseOrder<=0 || !Number.isFinite(a.answeredSeconds) || a.answeredSeconds<0)
      || new Set(answers.map(a=>a.relationshipId)).size!==answers.length
      || new Set(answers.map(a=>a.responseOrder)).size!==answers.length)
      return {status:"requires_review",categories,reviewReasons:["Malformed relationship review."],review};
    for(const a of answers) {
      const rule=rules.relationships.find(r=>r.id===a.relationshipId);
      if(!rule || !rule.interpretations?.some(c=>c.id===a.responseId) || !supported(rule,input)) {
        reviewReasons.push("Invalid locked relationship response.");continue;
      }
      const correct=a.responseId===rule.correctInterpretationId;
      review.relationships.push({relationshipId:rule.id,supported:correct,responseId:a.responseId,responseOrder:a.responseOrder});
      if(correct)completedIds.add(rule.id);else unsupportedCount++;
    }
    if(input.atConclusion && (!answers.length || rules.relationships.some(r=>supported(r,input)&&!answers.some(a=>a.relationshipId===r.id))))
      reviewReasons.push("Available relationship review is incomplete.");
  }
  for(const r of rules.relationships)if(completedIds.has(r.id)) {
    const hasSupport=supported(r,input);
    if(!input.relationshipReviewVersion)review.relationships.push({relationshipId:r.id,supported:hasSupport});
    if(hasSupport){relationshipEarned+=r.weight;supportedIds.add(r.id);}else unsupportedCount++;
  }
  review.relationships.push(...[...completedIds].filter(id=>!rules.relationships.some(r=>r.id===id)).map(relationshipId=>({relationshipId,supported:false})));
  unsupportedCount += [...completedIds].filter(id=>!rules.relationships.some(r=>r.id===id)).length;
  const authoredPairs=new Set(rules.relationships.map(r=>pair(r.sourceId,r.targetId)));
  const unmatchedPairs=input.relationshipReviewVersion?[]:[...new Set(input.boardConnections.map(p=>pair(p.sourceId,p.targetId)))].filter(p=>!authoredPairs.has(p));
  unsupportedCount += unmatchedPairs.length;
  review.relationships.push(...unmatchedPairs.map(p=>({relationshipId:`unmatched:${p}`,supported:false})));
  const relationshipMaximum=rules.relationships.reduce((sum,r)=>sum+r.weight,0);
  const reasoning=categories.reasoningCheckpointMaximum!>0?earned/categories.reasoningCheckpointMaximum!:0;
  const relationships=relationshipMaximum>0?Math.max(0,relationshipEarned-unsupportedCount*rules.unsupportedRelationshipPenalty)/relationshipMaximum:0;
  const fullChain=rules.supportedFindingIds.every(id=>input.confirmedFindingIds.includes(id))
    && rules.supportedRelationshipIds.every(id=>supportedIds.has(id)) && input.discoveredStatementIds.includes(rules.supportedStatementId);
  let conclusion=0;
  if(input.selectedConclusionId===rules.supportedConclusionId && input.resolvedEndingId===rules.supportedEndingId) {
    if(fullChain){conclusion=rules.supportedConclusionCredit;review.conclusion="supported_paul";}else reviewReasons.push("Supported ending lacks the authored evidence chain.");
  } else if(input.selectedConclusionId===rules.supportedConclusionId && input.resolvedEndingId===rules.prematureEndingId) {
    if(!fullChain){conclusion=rules.prematureConclusionCredit;review.conclusion="premature_paul";}else reviewReasons.push("Premature ending conflicts with the supported evidence chain.");
  } else if(input.selectedConclusionId===rules.peterConclusionId && input.resolvedEndingId===rules.peterEndingId){conclusion=rules.peterConclusionCredit;review.conclusion="unsupported_peter";}
  else if(input.selectedConclusionId===rules.inconclusiveConclusionId && input.resolvedEndingId===rules.inconclusiveEndingId)
    {conclusion=fullChain?rules.inconclusiveSupportedCredit:rules.inconclusiveInsufficientCredit;
    review.conclusion=fullChain?"inconclusive_supported":"inconclusive_insufficient";}
  else if(input.atConclusion)reviewReasons.push("Unknown conclusion/ending pair.");
  Object.assign(categories,{reasoningCheckpoints:reasoning,deductionRelationships:relationships,finalConclusion:conclusion,
    reasoningCheckpointComponent:reasoning*rules.checkpointWeight,deductionRelationshipComponent:relationships*rules.relationshipWeight,
    finalConclusionComponent:conclusion*rules.conclusionWeight,reasoningCheckpointEarned:earned,reasoningCheckpointAnswered:answered,
    reasoningCheckpointEligibleUnanswered:eligibleUnanswered,reasoningCheckpointUndiscovered:undiscovered,unsupportedDeductionRelationships:unsupportedCount});
  const status=reviewReasons.length?"requires_review":completed&&input.atConclusion?"complete":"incomplete";
  if(status!=="complete")return {status,categories,reviewReasons,review};
  // Fixed weights sum to 100 in the definition. No missing-category renormalization.
  const totalScore=Math.max(0,Math.min(100,categories.reasoningCheckpointComponent!+categories.deductionRelationshipComponent!+categories.finalConclusionComponent!));
  const overallScore=totalScore/100;
  categories.deductionAssessmentComplete=1;categories.overallScore=overallScore;categories.deductionTotalScore=totalScore;
  return {status,categories,overallScore,totalScore,reviewReasons,review};
}

function validInput(value:unknown):value is DeductionAssessmentInput {
  if(!value || typeof value!=="object")return false;
  const v=value as Record<string,unknown>;
  if(v.relationshipReviewVersion!==undefined && v.relationshipReviewVersion!==0 && v.relationshipReviewVersion!==1)return false;
  if(v.relationshipReviewVersion===1 && (!Array.isArray(v.relationshipResponses) || !v.relationshipResponses.every(a=>a && typeof a==="object"
    && typeof a.relationshipId==="string" && typeof a.responseId==="string" && Number.isInteger(a.responseOrder)
    && Number.isFinite(a.answeredSeconds))))return false;
  for(const key of ["scoringRulesVersion","contentVersion","selectedConclusionId","resolvedEndingId"])if(typeof v[key]!=="string")return false;
  for(const key of ["atConclusion","requiresSceneRelease","checkpointSystemReady","form1Received","victimObserved","sceneSecurityAcknowledged"])if(typeof v[key]!=="boolean")return false;
  for(const key of ["iocObservationIds","confirmedFindingIds","discoveredStatementIds","observedEvidenceIds","completedRelationshipIds"])
    if(!Array.isArray(v[key]) || !(v[key] as unknown[]).every(x=>typeof x==="string"))return false;
  if(!Array.isArray(v.checkpoints) || !v.checkpoints.every(s=>s && typeof s==="object" && typeof s.checkpointId==="string" && typeof s.responseId==="string"
    && typeof s.wasEligible==="boolean" && Number.isInteger(s.responseOrder) && Number.isFinite(s.eligibleSeconds) && Number.isFinite(s.answeredSeconds)
    && s.eligibleSeconds>=0 && s.answeredSeconds>=0))return false;
  return Array.isArray(v.boardConnections) && v.boardConnections.every(p=>p && typeof p==="object" && typeof p.sourceId==="string" && typeof p.targetId==="string");
}

/** Parse only the frozen conclusion-time snapshot, not later closeout facts. Bad
 * or missing technical data suppresses a grade and explicitly requires review. */
export function scoreDeductionEvents(events:ScoringSessionEvent[], context:ScoringSessionContext, completedAtUtc:string|null, rules:DeductionScoringDefinition):DeductionAssessmentOutput {
  const ordered=[...events].sort((a,b)=>a.sequenceNumber-b.sequenceNumber);
  const snapshots=ordered.filter(e=>e.eventType==="DeductionAssessmentSnapshot");
  if(snapshots.length!==1)return {status:"requires_review",categories:{deductionAssessmentComplete:0},reviewReasons:["Exactly one conclusion-time assessment snapshot is required."]};
  let input:unknown;
  try {input=JSON.parse(payloadValue(snapshots[0],"assessment")??"");}catch {input=null;}
  if(!validInput(input))return {status:"requires_review",categories:{deductionAssessmentComplete:0},reviewReasons:["Malformed assessment snapshot."]};
  const ended=!!completedAtUtc && ordered.some(e=>e.eventType==="SessionEnded" && e.sequenceNumber>snapshots[0].sequenceNumber);
  const completed=ended && (!input.requiresSceneRelease || ordered.some(e=>e.eventType==="InvestigationCompleted" && e.sequenceNumber>snapshots[0].sequenceNumber));
  const result=scoreDeductionAssessment(input,completed,rules);
  if(input.relationshipReviewVersion===1) {
    const locks=ordered.filter(e=>e.eventType==="RelationshipInterpretationSubmitted");
    if(locks.length!==input.relationshipResponses!.length)result.reviewReasons.push("Relationship lock count differs from frozen review.");
    for(const a of input.relationshipResponses!) {
      const matching=locks.filter(e=>e.targetId===a.relationshipId);
      const e=matching[0];
      if(matching.length!==1 || !e || e.sequenceNumber>=snapshots[0].sequenceNumber
        || payloadValue(e,"responseId")!==a.responseId || Number(payloadValue(e,"responseOrder"))!==a.responseOrder
        || !Number.isFinite(Number(payloadValue(e,"answeredSeconds")))
        || Math.abs(Number(payloadValue(e,"answeredSeconds"))-a.answeredSeconds)>.002 || payloadValue(e,"reviewVersion")!=="1")
        result.reviewReasons.push(`${a.relationshipId}: locked relationship response event mismatch.`);
    }
  }
  if(input.selectedConclusionId!==context.selectedConclusionId || input.resolvedEndingId!==context.resolvedEndingId)
    result.reviewReasons.push("Stored conclusion/ending differs from frozen assessment.");
  // Check lock and chronology against original submitted records. A client cannot
  // substitute a later response or inflate weights in its aggregate/snapshot.
  const submissions=new Map<string,ScoringSessionEvent>();
  const eligibilities=new Set<string>();
  for(const e of ordered.filter(e=>e.sequenceNumber<snapshots[0].sequenceNumber)) {
    if(e.eventType==="ReasoningCheckpointEligible" && e.targetId)eligibilities.add(e.targetId);
    if(e.eventType==="ReasoningCheckpointSubmitted" && e.targetId && !submissions.has(e.targetId))submissions.set(e.targetId,e);
  }
  for(const s of input.checkpoints) {
    if(s.wasEligible!==eligibilities.has(s.checkpointId))result.reviewReasons.push(`${s.checkpointId}: eligibility event mismatch.`);
    const e=submissions.get(s.checkpointId);
    if((s.responseId||"")!==(e?payloadValue(e,"responseId"):"") || e && (s.responseOrder!==Number(payloadValue(e,"responseOrder"))
      || !Number.isFinite(Number(payloadValue(e,"eligibleSeconds"))) || !Number.isFinite(Number(payloadValue(e,"answeredSeconds")))
      || Math.abs(s.eligibleSeconds-Number(payloadValue(e,"eligibleSeconds")))>.002 || Math.abs(s.answeredSeconds-Number(payloadValue(e,"answeredSeconds")))>.002
      || payloadValue(e,"contentVersion")!==rules.contentVersion))result.reviewReasons.push(`${s.checkpointId}: locked response event mismatch.`);
  }
  if(result.reviewReasons.length){result.status="requires_review";result.overallScore=undefined;result.totalScore=undefined;
    delete result.categories.overallScore;delete result.categories.deductionTotalScore;result.categories.deductionAssessmentComplete=0;}
  return result;
}
