import "server-only";
import type { ResultDetail, ResultSummary } from "./results.ts";
import { resolveSessionScoring } from "./scoring/registry.ts";
import { scoreDeductionEvents } from "./scoring/deductionAssessmentScorer.ts";
import { REASONING_DISPLAY_CONTENT } from "./reasoningDisplayContent.ts";
import { evidenceText } from "./evidenceDisplay.ts";
import { resolveRelationshipName, resolveEvidenceName } from "./scenarioContent.ts";
import { BLOCKED_EVENTS, trainingAnalytics } from "./trainingAnalytics.ts";

export interface AssessmentPresentation {
  finalized: boolean;
  total: number | null;
  components: Array<{label:string;points:number|null;maximum:number}>;
  checkpoints: Array<{id:string;prompt:string;response:string;dimension:string;feedback:string;timestampMs:number|null;order:number|null;strength?:number;context:string}>;
  relationships: Array<{id:string;label:string;state:string;support:string;explanation:string;category:string;interpretation?:string;responseOrder?:number}>;
  conclusion: {label:string;assessment:string};
  training: {status:string;items:Array<{label:string;status:string}>;metrics:Array<{label:string;value:string}>;notes:string[]};
  reviewNote: string | null;
}

export const finite = (value:unknown):number|null => typeof value === "number" && Number.isFinite(value) ? value : null;
export const formatPoints = (value:number|null):string => finite(value) === null ? "Not available" : String(Math.round(value! * 100) / 100);
export function assessedScore(result: Pick<ResultSummary,"scoringVersion"|"verificationStatus"|"completedAtUtc"|"verifiedScore"|"assessmentComponents">):number|null {
  if (result.verificationStatus !== "verified") return null;
  if (result.scoringVersion === "1.7.0") {
    if (!result.completedAtUtc || result.assessmentComponents?.deductionAssessmentComplete !== 1) return null;
    const score=finite(result.assessmentComponents.deductionTotalScore);
    return score!==null && score>=0 && score<=100?score:null;
  }
  const ratio = finite(result.verifiedScore);
  return ratio === null || ratio<0 || ratio>1 ? null : ratio * 100;
}

const strengths:Record<number,string> = {4:"Strong evidence-based reasoning",3:"Reasonable reasoning",2:"Limited / assumption-heavy reasoning",1:"Unsupported or overconfident reasoning"};
const humanize = (value:string) => value.toLowerCase().replaceAll("_"," ").replace(/^./,c=>c.toUpperCase());
const relationshipCopy:Record<string,{category:string;explanation:string}> = {
  "REL-knife-consistent-wound":{category:"Physical consistency",explanation:"Consistency with the wound supports possible weapon relevance; it does not establish who used the knife."},
  "REL-paul-print-handled-knife":{category:"Contact / prior handling",explanation:"The print shows contact at some point, not when, why, or who carried out the attack."},
  "REL-spatter-consistent-reconstruction":{category:"Scene reconstruction",explanation:"The blood pattern informs attack-area reconstruction; it does not identify the attacker."},
  "REL-bottle-supports-brother":{category:"Contextual corroboration",explanation:"Earlier presence provides context and does not establish guilt."},
  "REL-peter-departure-supported":{category:"Account corroboration",explanation:"Corroborates the departure account without proving involvement in the attack."},
  "REL-paul-timeline-contradiction":{category:"Timeline reasoning",explanation:"The observation conflicts with Paul’s account; the vendor did not witness the attack."},
};
const conclusions:Record<string,{label:string;assessment:string}> = {
  supported_paul:{label:"Paul is the strongest supported suspect.",assessment:"Supported by the developed evidence and relationships."},
  premature_paul:{label:"Paul was identified before sufficient support was developed.",assessment:"The submitted accusation is insufficiently supported by the recorded evidence chain."},
  unsupported_peter:{label:"Peter was identified as the suspect.",assessment:"The recorded evidence does not support this accusation."},
  inconclusive_insufficient:{label:"Inconclusive — no suspect identified with sufficient confidence.",assessment:"Recognizes the limitations of the evidence developed at submission."},
  inconclusive_supported:{label:"Inconclusive — no suspect identified with sufficient confidence.",assessment:"The scorer recorded a developed support chain; the conclusion did not integrate that available support."},
  not_recorded:{label:"Not completed",assessment:"No assessed conclusion is available."},
};

/** Server-only read adapter. Grades always come from stored server categories.
 * The existing authoritative scorer supplies qualitative support decisions from
 * the immutable Phase 4 snapshot. No browser scoring, reweighting or DB writes. */
export function buildAssessmentPresentation(result:ResultDetail):AssessmentPresentation|undefined {
  if (result.scoringVersion !== "1.7.0") return undefined;
  const events = result.events.map(e=>({...e,payload:Array.isArray(e.payload)?e.payload.filter(p=>p && typeof p.key==="string" && typeof p.value==="string"):[]}));
  const rules=resolveSessionScoring(result.scenarioId,result.groundTruthVersion,result.scoringVersion).scoringRules?.deduction;
  const registered=!!rules && rules.scenarioVersion===result.scenarioVersion && rules.groundTruthVersion===result.groundTruthVersion && rules.scenarioId===result.scenarioId;
  let authoritative:ReturnType<typeof scoreDeductionEvents>|undefined;
  if(registered && rules) {
    try {authoritative=scoreDeductionEvents(events,{sessionId:result.sessionId,scenarioId:result.scenarioId,selectedConclusionId:result.selectedConclusionId,resolvedEndingId:result.resolvedEndingId},result.completedAtUtc,rules);}
    catch { /* Corrupt optional records are reported as unavailable, never a fabricated grade. */ }
  }
  const finalized=registered && result.verificationStatus==="verified" && !!result.completedAtUtc && result.categories.deductionAssessmentComplete===1;
  const trustedFeedback=finalized && authoritative?.status==="complete" ? authoritative.review : undefined;
  const payload=(e:typeof events[number],key:string)=>e.payload.find(p=>p.key===key)?.value;
  const ordered=[...events].sort((a,b)=>a.sequenceNumber-b.sequenceNumber);
  const firstResponses=new Map<string,typeof events[number]>();
  for(const e of ordered) if(e.eventType==="ReasoningCheckpointSubmitted" && e.targetId && !firstResponses.has(e.targetId))firstResponses.set(e.targetId,e);
  const checkpointContext:Record<string,string>={"RC-01-PETER":"Checkpoint trigger: CSI Form 1 received; Peter's reported nervous departure.","RC-02-SCENE":"Checkpoint trigger: victim, scene security, possible weapon and bloodstain area observed.","RC-03-FINGERPRINT":"Checkpoint trigger: Paul's fingerprint finding confirmed on the knife.","RC-04-KNIFE-WOUND":"Checkpoint trigger: knife and wound consistency finding confirmed.","RC-05-TIMELINE":"Checkpoint trigger: vendor's observation around 3:00 AM discovered.","RC-06-BLOODSTAIN":"Checkpoint trigger: bloodstain reconstruction finding confirmed."};
  const checkpoints=Object.entries(registered?REASONING_DISPLAY_CONTENT:{}).map(([id,content])=>{
    const e=firstResponses.get(id), responseId=e?payload(e,"responseId"):undefined;
    const reviewed=trustedFeedback?.checkpoints.find(c=>c.checkpointId===id && c.responseId===responseId);
    const eligible=ordered.some(e=>e.eventType==="ReasoningCheckpointEligible" && e.targetId===id);
    return {id,prompt:content.prompt,response:responseId?(content.responses[responseId]??"Response text not available"):(eligible?"Not completed":"Not recorded"),
      dimension:humanize(reviewed?.category??content.category),
      feedback:reviewed?(strengths[reviewed.strength]??"Feedback not available"):(responseId?"Assessment feedback not available":eligible?"Eligible checkpoint not answered":"No response recorded"),
      timestampMs:e?finite(e.timestampMs):null,order:e?finite(Number(payload(e,"responseOrder"))):null,strength:reviewed?.strength,context:eligible||e?checkpointContext[id]:"Eligibility not recorded; information available at this moment cannot be reconstructed."};
  }).sort((a,b)=>(a.timestampMs??Infinity)-(b.timestampMs??Infinity)||(a.order??Infinity)-(b.order??Infinity));
  const ids=new Set([...result.relationships.map(r=>r.relationshipId),...ordered.filter(e=>e.eventType==="RelationshipInterpretationSubmitted"&&e.targetId).map(e=>e.targetId!),...(trustedFeedback?.relationships.map(r=>r.relationshipId)??[])]);
  const relationships=[...ids].map(id=>{
    const decision=trustedFeedback?.relationships.find(r=>r.relationshipId===id);
    const definition=rules?.relationships.find(r=>r.id===id);
    const recorded=ordered.find(e=>e.eventType==="RelationshipInterpretationSubmitted" && e.targetId===id);
    const responseId=decision?.responseId??(recorded?payload(recorded,"responseId"):undefined);
    const copy=relationshipCopy[id];
    return {id,label:definition?.reviewPrompt?.split("\n")[0]??(copy?resolveRelationshipName(id,result.groundTruthVersion):id.startsWith("unmatched:")?"Unmatched board connection":"Unrecognized relationship"),state:result.relationships.find(r=>r.relationshipId===id)?.state??"Recorded at submission",
      support:decision?(decision.supported?"Supported":"Unsupported"):"Support not assessed / not available",
      category:copy?.category??"Unclassified relationship",explanation:copy?.explanation??"This connection has no supported evidentiary relationship in the assessment.",
      interpretation:responseId?definition?.interpretations?.find(c=>c.id===responseId)?.text:undefined,
      responseOrder:decision?.responseOrder??(recorded?Number(payload(recorded,"responseOrder")):undefined)};
  });
  const has=(type:string)=>events.some(e=>e.eventType===type);
  const blocked=events.filter(e=>BLOCKED_EVENTS.has(e.eventType));
  const guidance=events.filter(e=>["SketchPlacementHintShown"].includes(e.eventType));
  const procedureOrder=events.filter(e=>e.eventType==="ProcedureOutOfOrder");
  const additionalNotes=result.procedureViolations.filter(v=>!events.some(e=>e.eventType===v.eventType && e.targetId===v.targetId && e.timestampMs===v.timestampMs));
  const totalEvidence=result.evidenceResults.length;
  const observedTraining=trainingAnalytics(result);
  const processed=observedTraining.processed;
  const observed=events.length>0 || result.procedureViolations.length>0;
  const count=(n:number)=>observed?`${n} recorded`:"Not recorded";
  const training={
    status:has("InvestigationCompleted")?"Completed — investigation closeout recorded":result.completedAtUtc?"Completion not recorded":"Not completed",
    items:[
      {label:"Scene documentation",status:has("ScenePhotographyCompleted")?"Completed":"Not recorded"},
      {label:"Evidence marking",status:events.some(e=>e.eventType==="EvidenceStatusChanged" && payload(e,"status")==="Marked")?"Recorded":"Not recorded"},
      {label:"Measurements",status:has("MeasurementCompleted")?"Recorded":"Not recorded"},
      {label:"Fingerprint processing",status:result.evidenceResults.some(e=>e.fingerprintingDone)?"Recorded":"Not recorded"},
      {label:"Biological sampling",status:result.evidenceResults.some(e=>e.swabbingDone)?"Recorded":"Not recorded"},
      {label:"Evidence packaging",status:events.some(e=>e.eventType==="EvidenceStatusChanged" && payload(e,"status")==="Sealed")?"Recorded":"Not recorded"},
      {label:"Evidence custody",status:has("EvidenceDeposited")?"Recorded":"Not recorded"},
      ...observedTraining.steps.filter(s=>["IOCAssessmentCompleted","SOCOTurnoverCompleted","SketchSubmitted","BodyDocumentationRecorded","BodyRemoved","CustodyPassCompleted","SceneReleaseConfirmed"].includes(s.eventType)),
      {label:"Evidence inventory review",status:has("EvidenceInventoryConfirmed")?"Completed":"Not recorded"},
      {label:"Final scene survey",status:has("FinalSceneSurveyCompleted")?"Completed":"Not recorded"},
    ],
    metrics:[
      {label:"Evidence fully processed",value:totalEvidence?`${processed} of ${totalEvidence} tracked items`:"Not recorded"},
      {label:"Recorded sketch guidance hints",value:guidance.length?count(guidance.length):"Not recorded"},
      {label:"Total guidance prompts received",value:"Not recorded — prompt receipt is not logged"},
      {label:"Blocked procedural actions",value:count(observedTraining.blockedCount)},
      {label:"Procedure-order events",value:finite(result.categories.procedureOrderWarningCount)!==null?`${result.categories.procedureOrderWarningCount} recorded`:count(procedureOrder.length)},
      {label:"Session time",value:finite(result.durationSeconds)!==null?`${Math.round(result.durationSeconds!/60)} min`:"Not recorded"},
      {label:"Procedure order compliance (analytics only)",value:finite(result.categories.procedureOrderCompliance)!==null?`${Math.round(result.categories.procedureOrderCompliance*100)}%`:"Not available"},
      ...[
        ["Scene photography coverage","scenePhotographyCoverage"],
        ["Measurement completion","measurementCompletion"],
        ["Evidence relevance precision (legacy analytics)","precision"],
        ["Documentation selection accuracy (legacy analytics)","documentationAccuracy"],
      ].filter(([,key])=>finite(result.categories[key])!==null).map(([label,key])=>({label,value:`${Math.round(result.categories[key]*100)}% (non-scored)`})),
    ],
    notes:[...blocked,...procedureOrder,...additionalNotes.map((v,i)=>({...v,sequenceNumber:Number.MAX_SAFE_INTEGER+i,payload:[]}))].sort((a,b)=>a.timestampMs-b.timestampMs||a.sequenceNumber-b.sequenceNumber).map(e=>{
      const reason=payload(e,"reason")??payload(e,"blockReason")??payload(e,"expectedPrerequisite");
      const attempted=payload(e,"attempted"),current=payload(e,"current");
      const label=e.eventType==="ProcedureOutOfOrder"?"Procedure-order guidance":["EvidenceTransitionBlocked","EvidenceDepositBlocked","MarkerReclaimBlocked"].includes(e.eventType)?"Procedural action blocked":"Training guidance note";
      return evidenceText(`${label}${e.targetId?` (${resolveEvidenceName(e.targetId)})`:""}${reason?`: ${reason}`:attempted?`: attempted ${attempted}${current?` while ${current}`:""}`:""}.`);
    }),
  };
  return {finalized,total:finalized?finite(result.categories.deductionTotalScore):null,
    components:[{label:"Reasoning Checkpoints",points:finalized?finite(result.categories.reasoningCheckpointComponent):null,maximum:60},
      {label:"Evidence Relationships",points:finalized?finite(result.categories.deductionRelationshipComponent):null,maximum:25},
      {label:"Final Conclusion",points:finalized?finite(result.categories.finalConclusionComponent):null,maximum:15}],
    checkpoints:checkpoints.map(c=>({...c,prompt:evidenceText(c.prompt),response:evidenceText(c.response),context:evidenceText(c.context),feedback:evidenceText(c.feedback)})),
    relationships:relationships.map(r=>({...r,label:evidenceText(r.label),explanation:evidenceText(r.explanation),interpretation:r.interpretation===undefined?undefined:evidenceText(r.interpretation)})),conclusion:trustedFeedback?conclusions[trustedFeedback.conclusion]:{label:result.selectedConclusionId?"Submitted conclusion — assessment not available":"Not completed",assessment:"Completion or verification is pending. No final support judgment is displayed."},training,
    reviewNote:result.verificationMessage??(!registered?"Scenario / ground-truth registration does not match 1.7.0.":authoritative?.status!=="complete"?"Detailed reasoning assessment is not available from the recorded snapshot.":null)};
}
