import "server-only";
import type { ScoringSessionEvent } from "./types.ts";
import {validateQuestionRecords} from "../sessionRecord.ts";
import {validateRecorderDocumentation} from "../recorderDocumentation.ts";

// Body milestones are procedural analytics, carried here only to preserve them
// when optional raw events are disabled/capped. They are never grade inputs.
const allowed=new Set(["DeductionAssessmentSnapshot","ReasoningCheckpointSubmitted","ReasoningCheckpointEligible","ConclusionSelected","EndingSelected","SessionEnded","InvestigationCompleted",
  "BodyDocumentationRecorded","BodyPreparedForRemoval","BodyRemoved","FingerprintIdentified","RelationshipInterpretationSubmitted","EvidenceDeposited","CustodyPassCompleted"]);
const comparable=(e:ScoringSessionEvent)=>JSON.stringify([e.sequenceNumber,e.timestampMs,e.eventType,e.targetId,
  [...e.payload].sort((a,b)=>a.key.localeCompare(b.key)||a.value.localeCompare(b.value))]);
/** Additive 1.7.0 essential-event section uses the existing session_events table.
 * No migration, identity trust or client-score trust. Preserve existing raw events. */
export function mergeAssessmentEvents(payload:Record<string,unknown>):Record<string,unknown> {
  if(payload.scoringRulesVersion!=="1.7.0"){
    const oldEvents=Array.isArray(payload.orderedEvents)?payload.orderedEvents:[];
    if(oldEvents.some(e=>e&&Array.isArray(e.payload)&&e.payload.some((p:{key?:string})=>p?.key==="documentation"||p?.key==="documentationVersion")))
      throw new Error("Recorder Documentation version 1 requires the current session format.");
    return payload;
  }
  const raw=Array.isArray(payload.orderedEvents)?payload.orderedEvents:[];
  const essential=Array.isArray(payload.deductionAssessmentEvents)?payload.deductionAssessmentEvents:[];
  if(essential.length>48)throw new Error("Too many essential assessment events.");
  const bySequence=new Map<number,ScoringSessionEvent>();
  for(const event of [...raw,...essential]) {
    if(!event || typeof event!=="object" || !Number.isInteger(event.sequenceNumber) || event.sequenceNumber<0
      || !Number.isFinite(event.timestampMs) || event.timestampMs<0 || typeof event.eventType!=="string"
      || !(event.targetId===null || typeof event.targetId==="string") || !Array.isArray(event.payload)
      || !event.payload.every((p:unknown)=>p && typeof p==="object" && typeof (p as {key?:unknown}).key==="string" && typeof (p as {value?:unknown}).value==="string"))
      throw new Error("Malformed assessment event.");
    if(essential.includes(event) && !allowed.has(event.eventType))throw new Error("Unexpected essential assessment event type.");
    const old=bySequence.get(event.sequenceNumber);
    if(old && comparable(old)!==comparable(event))throw new Error("Conflicting assessment event sequence.");
    bySequence.set(event.sequenceNumber,event);
  }
  const orderedEvents=[...bySequence.values()].sort((a,b)=>a.sequenceNumber-b.sequenceNumber);
  validateQuestionRecords(orderedEvents,String(payload.scenarioId??""),typeof payload.groundTruthVersion==="string"?payload.groundTruthVersion:null,String(payload.scoringRulesVersion));
  const recorder=validateRecorderDocumentation(orderedEvents);
  if(recorder.length&&payload.scenarioId!=="CSI-ENVIRONMENT-001")throw new Error("Recorder documentation belongs to the active scenario only.");
  return {...payload,orderedEvents};
}
