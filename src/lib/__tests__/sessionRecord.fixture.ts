import {snapshot,resultFor,rules} from './assessmentPresentation.fixture.ts';
import {REASONING_DISPLAY_CONTENT} from '../reasoningDisplayContent.ts';
import {scoreDeductionAssessment} from '../scoring/deductionAssessmentScorer.ts';
import type {QuestionRecord} from '../sessionRecord.ts';
export function currentInput(wrongRelationship=false) {
  const input=snapshot();input.relationshipReviewVersion=1;input.completedRelationshipIds=[];input.boardConnections=[];
  input.relationshipResponses=rules.relationships.map((r,i)=>({relationshipId:r.id,responseId:wrongRelationship&&r.id==='REL-peter-departure-supported'?r.interpretations!.find(a=>a.id!==r.correctInterpretationId)!.id:r.correctInterpretationId!,responseOrder:i+1,answeredSeconds:100+i}));
  input.questionRecordVersion=1;
  const questions:QuestionRecord[]=rules.checkpoints.map(r=>{const s=input.checkpoints.find(s=>s.checkpointId===r.id)!,text=REASONING_DISPLAY_CONTENT[r.id];return {id:r.id,category:'Reasoning',dimension:r.category,question:text.prompt,wasAvailable:s.wasEligible,selectedAnswerId:s.responseId,
    answeredSeconds:s.answeredSeconds,maximumWeight:4,selectedAnswerWeight:r.responses.find(a=>a.id===s.responseId)!.weight,options:r.responses.map(a=>({...a,text:text.responses[a.id]}))};});
  questions.push(...rules.relationships.map(r=>{const s=input.relationshipResponses!.find(a=>a.relationshipId===r.id)!;return {id:r.id,category:'Evidence Relationships',dimension:'',question:r.reviewPrompt!,wasAvailable:true,selectedAnswerId:s.responseId,
    answeredSeconds:s.answeredSeconds,maximumWeight:r.weight,selectedAnswerWeight:s.responseId===r.correctInterpretationId?r.weight:-rules.unsupportedRelationshipPenalty,options:r.interpretations!.map(a=>({...a,weight:a.id===r.correctInterpretationId?r.weight:-rules.unsupportedRelationshipPenalty}))};}));
  const options=[{id:rules.supportedConclusionId,text:'Paul',endingId:rules.supportedEndingId},{id:rules.peterConclusionId,text:'Peter',endingId:rules.peterEndingId}].map(a=>({...a,weight:scoreDeductionAssessment({...input,selectedConclusionId:a.id,resolvedEndingId:a.endingId},false,rules).categories.finalConclusion!}));
  questions.push({id:'FINAL-CONCLUSION',category:'Final Conclusion',dimension:'',question:'Submit your conclusion:',wasAvailable:true,selectedAnswerId:input.selectedConclusionId,answeredSeconds:120,maximumWeight:1,selectedAnswerWeight:1,options});
  input.questionRecords=questions;return input;
}
export const currentResult=(wrong=false)=>resultFor(currentInput(wrong));
