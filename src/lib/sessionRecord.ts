import "server-only";
import {evidenceLabel,evidenceText} from "./evidenceDisplay.ts";
import definition from "./scoring/data/procedureTimeline.v1.json" with {type:"json"};
import {resolveSessionScoring} from "./scoring/registry.ts";
import {scoreDeductionAssessment} from "./scoring/deductionAssessmentScorer.ts";
import {payloadValue} from "./scoring/types.ts";
import type {DeductionAssessmentInput, ScoringSessionEvent} from "./scoring/types.ts";
import type {ResultDetail} from "./results.ts";
import {assessedScore} from "./assessmentPresentation.ts";
import {buildRecorderDocumentation,type RecorderDocumentationRecord} from "./recorderDocumentation.ts";

export interface AnswerRecord {id:string;text:string;weight:number;endingId?:string}
export interface QuestionRecord {
  id:string;category:string;dimension:string;question:string;wasAvailable:boolean;
  options:AnswerRecord[];selectedAnswerId:string;selectedAnswerWeight:number;maximumWeight:number;answeredSeconds:number;
}
export interface ProcedureRecord {id:string;timestampMs:number;description:string}
export interface EducationalRecord {
  recorder:RecorderDocumentationRecord;
  timeline:ProcedureRecord[];questions:QuestionRecord[];historical:boolean;note:string|null;
  recordedAnswers:Array<{id:string;selected:string;weight:number|null;timestampMs:number|null}>;
  score:number|null;components:Array<{label:string;points:number|null;maximum:number}>;
  formula:{reasoningMaximum:number;relationshipMaximum:number;reasoningWeight:number;relationshipWeight:number;conclusionWeight:number;penalty:number}|null;
}
export function procedureTimeline(events:ScoringSessionEvent[]):ProcedureRecord[] {
  const items:ProcedureRecord[]=[];
  const seen=new Set<number>();
  const recordedSubjects=new Set(events.filter(e=>e.eventType==="ReportLinesSelected").map(e=>e.targetId));
  for(const e of [...events].sort((a,b)=>a.timestampMs-b.timestampMs||a.sequenceNumber-b.sequenceNumber)) {
    if(seen.has(e.sequenceNumber)||!Number.isFinite(e.timestampMs)||e.timestampMs<0)continue;
    seen.add(e.sequenceNumber);
    if(recordedSubjects.has(e.targetId)&&(e.eventType==="BodyDocumentationRecorded"
      ||e.eventType==="EvidenceStatusChanged"&&payloadValue(e,"status")==="Logged"))continue;
    const template=e.eventType==="EvidenceStatusChanged"
      ?definition.statuses.find(s=>s.id===payloadValue(e,"status"))?.description
      :definition.events.find(s=>s.id===e.eventType)?.description;
    if(!template)continue;
    let target=evidenceLabel(e.targetId??"",definition.targets.find(t=>t.id===e.targetId)?.description??e.targetId??"Evidence");
    if(e.eventType==="EvidenceAddedToInventory" && payloadValue(e,"sampleType")==="Fingerprint")
      target=`lifted fingerprint sample from ${payloadValue(e,"sourceEvidenceId")??target}`;
    const marker=payloadValue(e,"tentLetter")||payloadValue(e,"tentNumber")||"(label not recorded)";
    items.push({id:`${e.eventType}:${e.sequenceNumber}`,timestampMs:e.timestampMs,
      description:evidenceText(template.replaceAll("{target}",target).replaceAll("{marker}",marker))});
  }
  return items;
}
function frozenInput(events:ScoringSessionEvent[]):unknown {
  const snapshots=events.filter(e=>e.eventType==="DeductionAssessmentSnapshot");
  if(snapshots.length!==1)return null;
  try{return JSON.parse(payloadValue(snapshots[0],"assessment")??"");}catch{return null;}
}
const close=(a:number,b:number)=>Number.isFinite(a)&&Math.abs(a-b)<.002;

/** Validate presentation weights against the already authoritative scorer/rules.
 * No submitted display weight or percentage is ever a grade input. Old snapshots
 * without this additive version remain valid, without inventing their missing text. */
export function validateQuestionRecords(events:ScoringSessionEvent[],scenarioId:string,groundTruthVersion:string|null,scoringVersion:string):QuestionRecord[]|null {
  const value=frozenInput(events);
  if(!value||typeof value!=="object")return null;
  const input=value as DeductionAssessmentInput&{questionRecordVersion?:number;questionRecords?:QuestionRecord[]};
  if(!input.questionRecordVersion)return null;
  const rules=resolveSessionScoring(scenarioId,groundTruthVersion,scoringVersion).scoringRules?.deduction;
  const fail=()=>{throw new Error("Invalid question snapshot.");};
  if(input.questionRecordVersion!==1||!rules||!Array.isArray(input.questionRecords))return fail();
  const qs=input.questionRecords;
  if(qs.length!==rules.checkpoints.length+rules.relationships.length+1||new Set(qs.map(q=>q?.id)).size!==qs.length)return fail();
  for(const q of qs) {
    if(!q||typeof q.question!=="string"||!q.question.trim()||q.question.length>12000||typeof q.category!=="string"
      ||typeof q.dimension!=="string"||typeof q.wasAvailable!=="boolean"||typeof q.selectedAnswerId!=="string"
      ||!Number.isFinite(q.answeredSeconds)||q.answeredSeconds< -1||!Number.isFinite(q.selectedAnswerWeight)
      ||!Number.isFinite(q.maximumWeight)||!Array.isArray(q.options)||q.options.length<1||q.options.length>16
      ||new Set(q.options.map(a=>a?.id)).size!==q.options.length
      ||q.options.some(a=>!a||typeof a.id!=="string"||typeof a.text!=="string"||!a.text.trim()||a.text.length>16000||!Number.isFinite(a.weight)))return fail();
    const checkpoint=rules.checkpoints.find(r=>r.id===q.id),relationship=rules.relationships.find(r=>r.id===q.id);
    let selected="",seconds=-1;
    if(checkpoint) {
      const s=input.checkpoints.find(s=>s.checkpointId===q.id);if(!s)return fail();
      selected=s.responseId;seconds=selected?s.answeredSeconds:-1;
      if(q.category!=="Reasoning"||q.dimension!==checkpoint.category||q.wasAvailable!==s.wasEligible||q.maximumWeight!==rules.maximumCheckpointWeight
        ||q.options.length!==checkpoint.responses.length||q.options.some(a=>checkpoint.responses.find(r=>r.id===a.id)?.weight!==a.weight))return fail();
    } else if(relationship) {
      const s=input.relationshipResponses?.find(s=>s.relationshipId===q.id);selected=s?.responseId??"";seconds=s?.answeredSeconds??-1;
      if(q.category!=="Evidence Relationships"||q.maximumWeight!==relationship.weight||q.options.length!==relationship.interpretations?.length
        ||q.options.some(a=>!relationship.interpretations?.some(r=>r.id===a.id)||a.weight!==(a.id===relationship.correctInterpretationId?relationship.weight:-rules.unsupportedRelationshipPenalty)))return fail();
    } else if(q.id==="FINAL-CONCLUSION") {
      selected=input.selectedConclusionId;seconds=q.answeredSeconds;
      const ids=[rules.supportedConclusionId,rules.peterConclusionId,rules.inconclusiveConclusionId];
      if(q.category!=="Final Conclusion"||q.maximumWeight!==1||!q.options.some(a=>a.id===selected))return fail();
      for(const a of q.options) {
        if(!ids.includes(a.id)||typeof a.endingId!=="string")return fail();
        const trial=scoreDeductionAssessment({...input,selectedConclusionId:a.id,resolvedEndingId:a.endingId},false,rules);
        if(trial.reviewReasons.length||!close(a.weight,trial.categories.finalConclusion??NaN))return fail();
      }
    } else return fail();
    const selectedOption=q.options.find(a=>a.id===selected);
    if(q.selectedAnswerId!==selected||selected&&!selectedOption||!close(q.selectedAnswerWeight,selectedOption?.weight??0)||!close(q.answeredSeconds,seconds))return fail();
  }
  return qs;
}

/** Presentation only. Final numbers come exclusively from stored server categories.
 * A historical record lacking question text never receives today's answer key. */
export function buildEducationalRecord(result:ResultDetail):EducationalRecord {
  const events=result.events.map(e=>({...e,payload:Array.isArray(e.payload)?e.payload:[]}));
  let questions:QuestionRecord[]|null=null,note:string|null=null;
  try{questions=validateQuestionRecords(events,result.scenarioId,result.groundTruthVersion??null,result.scoringVersion??"");}
  catch{note="The saved question snapshot could not be verified. Only original recorded answers are shown.";}
  const recordedAnswers:EducationalRecord["recordedAnswers"]=[];
  if(!questions)for(const e of events)if(["ReasoningCheckpointSubmitted","RelationshipInterpretationSubmitted","HypothesisSubmitted","ConclusionSelected"].includes(e.eventType)) {
    const raw=payloadValue(e,"weight");
    const registered=resolveSessionScoring(result.scenarioId,result.groundTruthVersion,result.scoringVersion).scoringRules?.deduction;
    const expected=registered?.checkpoints.find(c=>c.id===e.targetId)?.responses.find(a=>a.id===payloadValue(e,"responseId"))?.weight;
    recordedAnswers.push({id:e.targetId??e.eventType,selected:payloadValue(e,"responseId")??payloadValue(e,"selectedOptionId")??e.targetId??"Not recorded",
      weight:raw!==undefined&&raw!==null&&expected!==undefined&&Number(raw)===expected?expected:null,timestampMs:e.timestampMs});
  }
  if(!questions) {
    for(const q of result.hypotheses)if(q.selectedOptionId&&!recordedAnswers.some(a=>a.id===q.checkpointId))
      recordedAnswers.push({id:q.checkpointId,selected:q.selectedOptionId+(q.reasoningOptionId?` · Justification: ${q.reasoningOptionId}`:""),weight:null,timestampMs:null});
    if(result.selectedConclusionId&&!events.some(e=>e.eventType==="ConclusionSelected"))
      recordedAnswers.push({id:"FINAL-CONCLUSION",selected:result.selectedConclusionId,weight:null,timestampMs:null});
  }
  const score=assessedScore({...result,assessmentComponents:result.categories});
  const rules=resolveSessionScoring(result.scenarioId,result.groundTruthVersion,result.scoringVersion).scoringRules?.deduction;
  const components=rules?[
    {label:"Reasoning",key:"reasoningCheckpointComponent",maximum:rules.checkpointWeight},
    {label:"Evidence Relationships",key:"deductionRelationshipComponent",maximum:rules.relationshipWeight},
    {label:"Final Conclusion",key:"finalConclusionComponent",maximum:rules.conclusionWeight},
  ].map(c=>({label:c.label,maximum:c.maximum,points:result.verificationStatus==="verified"&&Number.isFinite(result.categories[c.key])?result.categories[c.key]:null})):[];
  const formula=rules?{reasoningMaximum:rules.checkpoints.length*rules.maximumCheckpointWeight,
    relationshipMaximum:rules.relationships.reduce((sum,q)=>sum+q.weight,0),reasoningWeight:rules.checkpointWeight,
    relationshipWeight:rules.relationshipWeight,conclusionWeight:rules.conclusionWeight,penalty:rules.unsupportedRelationshipPenalty}:null;
  return {recorder:buildRecorderDocumentation(events,result.recordedReportLines),timeline:procedureTimeline(events),questions:(questions??[]).sort((a,b)=>(a.answeredSeconds<0?Infinity:a.answeredSeconds)-(b.answeredSeconds<0?Infinity:b.answeredSeconds)),historical:!questions,
    note:note??(!questions?"This historical session did not capture complete question and answer-option snapshots. Missing text or weights are not reconstructed.":null),recordedAnswers,score,components,formula};
}
