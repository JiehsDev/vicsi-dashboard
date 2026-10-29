import {evidenceText} from "./evidenceDisplay.ts";
import type { ResultDetail } from "./results.ts";

export const BLOCKED_EVENTS = new Set(["EvidenceTransitionBlocked", "EvidenceDepositBlocked", "MarkerReclaimBlocked", "EvidenceMarkerRejected", "BodyRemovalBlocked", "EvidencePairMeasurementRejected"]);
export const GUIDANCE_EVENTS = new Set(["SketchPlacementHintShown", "ProcedureOutOfOrder"]);
const workflowNames: Record<string, string> = {
  SceneTurnoverCompleted: "First responder turnover", CSIForm1Received: "CSI Form 1 received", IOCAssessmentStarted: "IOC assessment started", IOCObservationRecorded: "IOC observation recorded", IOCAssessmentCompleted: "IOC assessment completed",
  SOCOAssistanceDecision: "SOCO assistance decision", SOCORequested: "SOCO requested", CSIForm2Completed: "CSI Form 2 completed", SOCOTurnoverStarted: "SOCO turnover started", SOCOTurnoverCompleted: "SOCO turnover completed", SOCOInvestigationStarted: "Investigation started",
  ScenePhotographyCompleted: "Scene photography completed", EvidenceStatusChanged: "Evidence workflow updated", MeasurementCompleted: "Measurement completed", EvidencePairMeasured: "Evidence-pair distance recorded", SketchSubmitted: "Scene sketch submitted",
  FingerprintIdentified: "Fingerprint identities recorded", ReportLinesSelected: "Evidence findings recorded", WitnessStatementDiscovered: "Witness follow-up recorded", BodyDocumentationRecorded: "Body findings recorded", BodyPreparedForRemoval: "Body prepared for transport", BodyRemoved: "Body removed",
  EvidenceDeposited: "Item transferred to evidence box", CustodyPassCompleted: "Custody pass completed", SOCOCloseoutStarted: "Closeout started", EvidenceInventoryConfirmed: "Final inventory confirmed", FinalSceneSurveyCompleted: "Final scene survey completed", SceneReleaseConfirmed: "IOC report accepted; scene release authorized", InvestigationCompleted: "Investigation completed; scene released", SessionEnded: "Session ended",
  SketchPlacementHintShown: "Sketch placement guidance", ProcedureOutOfOrder: "Procedure-order guidance", MarkerReclaimed: "Marker retrieved", EvidenceTraceMarked: "Trace marker placed",
};
export function eventValue(event: ResultDetail["events"][number], key: string): string | undefined {
  return Array.isArray(event.payload) ? event.payload.find(p => p?.key === key && typeof p.value === "string")?.value : undefined;
}
function recordedDetail(event:ResultDetail["events"][number]):string|undefined {
  if(event.eventType==="EvidenceDeposited")return `Transferred to ${eventValue(event,"boxId")??"evidence box"} · source ${eventValue(event,"sourceEvidenceId")??"not recorded"}`;
  if(event.eventType==="FingerprintIdentified"){
    try{const matches:unknown=JSON.parse(eventValue(event,"matches")??"null");if(matches&&typeof matches==="object"&&"identities" in matches&&Array.isArray(matches.identities))return `Recorded identities: ${matches.identities.filter((id):id is string=>typeof id==="string").join(", ")}`;}catch{/* Optional older/malformed match payload. */}
  }
}
export function trainingAnalytics(result: Pick<ResultDetail, "events" | "evidenceResults" | "procedureViolations" | "scoringVersion">) {
  const events = [...result.events].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  const has = (name: string) => events.some(e => e.eventType === name);
  const blocked = events.filter(e => BLOCKED_EVENTS.has(e.eventType));
  const additional = result.procedureViolations.filter(v => BLOCKED_EVENTS.has(v.eventType) && !blocked.some(e => e.eventType === v.eventType && e.targetId === v.targetId && e.timestampMs === v.timestampMs));
  const timeline = events.filter(e => workflowNames[e.eventType] || BLOCKED_EVENTS.has(e.eventType)).map(e => ({
    key: String(e.sequenceNumber), eventType: e.eventType, timestampMs: e.timestampMs, targetId: e.targetId,
    label: BLOCKED_EVENTS.has(e.eventType) ? "Premature action blocked" : workflowNames[e.eventType],
    detail: evidenceText(eventValue(e, "reason") ?? eventValue(e, "blockReason") ?? eventValue(e, "expectedPrerequisite") ?? eventValue(e, "status") ?? recordedDetail(e) ?? (eventValue(e,"attempted") ? `attempted ${eventValue(e,"attempted")}${eventValue(e,"current")?` while ${eventValue(e,"current")}`:""}` : e.eventType === "CustodyPassCompleted" ? `${eventValue(e, "itemCount") ?? "Recorded"} items secured` : "")),
  }));
  timeline.push(...additional.map((e,i)=>({key:`note-${i}`,eventType:e.eventType,timestampMs:e.timestampMs,targetId:e.targetId,label:"Premature action blocked",detail:"Procedural action blocked; prerequisite detail not recorded."})));
  const processed = result.evidenceResults.filter(e => e.finalStatus === "Processed" || (result.scoringVersion === "1.7.0" && e.evidenceId === "BODY-A" && e.finalStatus === "Logged" && has("BodyRemoved"))).length;
  return { has, timeline, blockedCount: blocked.length + additional.length, guidanceCount: events.filter(e => GUIDANCE_EVENTS.has(e.eventType)).length,
    processed, totalEvidence: result.evidenceResults.length, closeout: has("InvestigationCompleted"), custody: has("CustodyPassCompleted"),
    steps: [
      ["IOC assessment", "IOCAssessmentCompleted"], ["SOCO turnover", "SOCOTurnoverCompleted"], ["Scene documentation", "ScenePhotographyCompleted"], ["Measurements", "MeasurementCompleted"], ["Scene sketch", "SketchSubmitted"],
      ["Body documentation", "BodyDocumentationRecorded"], ["Body transport", "BodyRemoved"], ["Evidence custody pass", "CustodyPassCompleted"], ["Final inventory review", "EvidenceInventoryConfirmed"], ["Final scene survey", "FinalSceneSurveyCompleted"], ["IOC completion report", "SceneReleaseConfirmed"], ["Scene release", "InvestigationCompleted"],
    ].map(([label, type]) => ({ label, status: has(type) ? "Completed" : "Not recorded", eventType: type })),
  };
}
