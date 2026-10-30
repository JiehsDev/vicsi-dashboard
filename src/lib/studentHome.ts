import type {ResultDetail,ResultSummary} from "./results.ts";
import {assessedScore} from "./assessmentPresentation.ts";
import {buildEducationalRecord} from "./sessionRecord.ts";
import {questionLabel} from "./questionDisplay.ts";

const dateNumber=(value:string|null|undefined)=>value && Number.isFinite(Date.parse(value))?Date.parse(value):0;
export function studentHomeState(rows:ResultSummary[]) {
  // A retry's receipt date must not turn an old investigation into the latest attempt.
  const sessions=rows.filter(r=>!r.isTestSession).sort((a,b)=>
    (dateNumber(b.startedAtUtc)||dateNumber(b.completedAtUtc)||dateNumber(b.serverReceivedAtUtc))-
    (dateNumber(a.startedAtUtc)||dateNumber(a.completedAtUtc)||dateNumber(a.serverReceivedAtUtc)) || a.sessionId.localeCompare(b.sessionId));
  const latest=sessions[0]??null;
  const receipt=[...rows].sort((a,b)=>dateNumber(b.serverReceivedAtUtc)-dateNumber(a.serverReceivedAtUtc))[0];
  const lastReceived=receipt && dateNumber(receipt.serverReceivedAtUtc)?receipt.serverReceivedAtUtc:null;
  return {sessions,latest,lastReceived,lastReceivedIsTest:receipt?.isTestSession===true,hiddenTests:rows.filter(r=>r.isTestSession).length,score:latest?assessedScore(latest):null};
}
export function resultStatus(result:ResultSummary) {
  if(assessedScore(result)!==null)return {label:"Result ready",description:"Your investigation has been received and its result is ready to review."};
  if(result.verificationStatus==="requires_review")return {label:"Instructor review needed",description:"Your investigation was received, but a final score needs review. Ask your instructor about this attempt."};
  return {label:"Final score unavailable",description:"Your investigation was received. A verified final score is not available; you can still view its recorded activity."};
}
export interface ReviewFocus {id:string;title:string;description:string;href:string}
export function reviewFocus(result:ResultDetail|null):ReviewFocus[] {
  if(!result || result.isTestSession || assessedScore(result)===null || result.scoringVersion!=="1.7.0")return [];
  const record=buildEducationalRecord(result);
  return record.questions.map((q,index)=>({...q,questionNumber:index+1})).filter(q=>q.selectedAnswerId && q.wasAvailable && q.maximumWeight>0 && q.selectedAnswerWeight/q.maximumWeight<.75)
    .sort((a,b)=>a.selectedAnswerWeight/a.maximumWeight-b.selectedAnswerWeight/b.maximumWeight || a.answeredSeconds-b.answeredSeconds)
    .slice(0,2).map(q=>({id:q.id,
      title:`Review ${questionLabel(q.id)}`,
      description:q.category==="Evidence Relationships"?"Revisit what the evidence supports and the limits of your selected interpretation.":q.category==="Final Conclusion"?"Compare your submitted conclusion with the support recorded in this attempt.":"Review your selected response and how strongly it follows from the available evidence.",
      href:`/results/${encodeURIComponent(result.sessionId)}#question-${q.questionNumber}`}));
}
