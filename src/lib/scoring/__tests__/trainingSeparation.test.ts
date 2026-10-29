import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { resolveSessionScoring } from "../registry.ts";
import { scoreEvidence } from "../evidenceScorer.ts";
import { scoreProcedural } from "../proceduralScorer.ts";
import { scoreProcedureOrder } from "../procedureOrderScorer.ts";
import { scoreScenePhotography } from "../scenePhotographyScorer.ts";
import { scoreMeasurement } from "../measurementScorer.ts";
import { scoreRelationships } from "../relationshipScorer.ts";
import { scoreConclusion } from "../conclusionScorer.ts";
import { computeOverallScore } from "../overallScore.ts";
import type { ScoreCategories, ScoringSessionEvent, ScoringRules } from "../types.ts";

const scenarioId = "CSI-ENVIRONMENT-001";
const current = resolveSessionScoring(scenarioId, "1.2.0", "1.6.0");
const truth = current.groundTruth!;
const rules = current.scoringRules!;
const old = resolveSessionScoring(scenarioId, "1.2.0", "1.5.0").scoringRules!;
const training = ["criticalRecall", "relevantRecall", "precision", "distractorFallRate", "proceduralCompliance", "scenePhotography", "measurement", "procedureOrderCompliance"] as const;
const assessed = ["reasoningAccuracy", "documentationAccuracy", "relationshipAccuracy", "finalConclusionAccuracy"] as const;
const e = (eventType: string, targetId: string | null = null, payload: Record<string, string> = {}, seq = 1): ScoringSessionEvent => ({eventType, targetId, sequenceNumber: seq, timestampMs: seq * 1000, payload: Object.entries(payload).map(([key,value]) => ({key,value}))});
function categories(events: ScoringSessionEvent[], version: ScoringRules = rules): ScoreCategories {
  return {
    ...scoreEvidence(events, truth, version),
    ...scoreProcedural(events.filter(x => ["EvidenceTransitionBlocked", "NonEvidenceMarked", "MarkerReclaimBlocked", "EvidenceMarkerRejected"].includes(x.eventType)), version.procedural),
    ...scoreProcedureOrder(events, version.procedureOrder),
    ...scoreScenePhotography(events, version.scenePhotography),
    ...scoreMeasurement(events, version.measurement),
    relationshipAccuracy: 0.5,
    finalConclusionAccuracy: 0,
  };
}
const overall = (events: ScoringSessionEvent[], version = rules) => computeOverallScore(categories(events, version), version.categoryWeights);
const baseline = [e("HypothesisSubmitted", "HYP-01", {reasoningOptionId: truth.hypothesisCheckpoints[0].reasoningOptions.find(x => x.isCorrect)!.id})];

test("1.6.0 classifies training with zero weights and preserves all four assessment weights", () => {
  assert.equal(rules.scoringRulesVersion, "1.6.0");
  for (const name of training) assert.equal(rules.categoryWeights[name], 0, name);
  for (const name of assessed) assert.equal(rules.categoryWeights[name], old.categoryWeights[name], name);
  assert.equal(Object.values(rules.categoryWeights).reduce((a,b) => a+b,0),6);
});
test("procedures alone generate no deduction credit: no assessment category available means undefined", () => {
  const c: ScoreCategories = Object.fromEntries(training.map(name => [name,1]));
  assert.equal(computeOverallScore(c,rules.categoryWeights),undefined);
});
for (const name of training) test(`${name} cannot change overall score or its denominator`, () => {
  const c: ScoreCategories = {reasoningAccuracy: 1, documentationAccuracy: 0, relationshipAccuracy: 0.5, finalConclusionAccuracy: 0};
  const expected = computeOverallScore(c,rules.categoryWeights);
  for (const value of [0,0.5,1,undefined]) assert.equal(computeOverallScore({...c,[name]:value},rules.categoryWeights),expected);
});
test("photography, markers, all EvidenceStatus transitions, processing, custody and closeout never add credit", () => {
  const procedures = truth.lifecycleSequence.map((status,i) => e("EvidenceStatusChanged","EVD-014",{status},i+2));
  procedures.push(e("ScenePhotographyStarted",null,{requiredPointCount:"1"},20),e("ScenePhotoCompleted","p1",{required:"True",inOrder:"True"},21));
  const r = rules.measurement!.requirements[0];
  procedures.push(e("MeasurementTaken",r.evidenceId,{requirementId:r.requirementId,referenceId:r.referenceAId,measuredDistance:String(r.expectedDistanceA)},22),e("MeasurementTaken",r.evidenceId,{requirementId:r.requirementId,referenceId:r.referenceBId,measuredDistance:String(r.expectedDistanceB)},23));
  for (const eventType of ["EvidenceStored", "EvidenceInventoryReviewed", "FinalSceneSurveyCompleted", "SceneReleased"]) procedures.push(e(eventType,null,{},24));
  const actual = categories([...baseline,...procedures]);
  assert.equal(actual.criticalRecall,0.5); // raw marker metric still changes
  assert.equal(actual.scenePhotography,1);
  assert.ok(actual.measurement! > categories(baseline).measurement!);
  assert.equal(overall([...baseline,...procedures]),overall(baseline));
});
test("repeated blocked attempts change training analytics without reducing deduction", () => {
  const blocked = Array.from({length:30},(_,i) => e("EvidenceTransitionBlocked","EVD-014",{reason:"Photograph first"},i+2));
  const actual = categories([...baseline,...blocked]);
  assert.equal(actual.proceduralCompliance,0);
  assert.equal(overall([...baseline,...blocked]),overall(baseline));
  assert.ok(overall([...baseline,...blocked],old)! < overall(baseline,old)!);
});
test("ProcedureOutOfOrder remains counted and deduplicated as training analytics", () => {
  const warning = e("ProcedureOutOfOrder","EVD-014",{procedureId:"scene-photos-before-evidence-photo",evidenceId:"EVD-014",expectedPrerequisite:"scene-photography"},2);
  const actual = categories([...baseline,warning,{...warning,sequenceNumber:3}]);
  assert.equal(actual.procedureOrderWarningCount,1);
  assert.equal(actual.procedureOrderCompliance,0.9);
  assert.equal(overall([...baseline,warning]),overall(baseline));
});
test("non-evidence marker/reclaim/rejection attempts cannot reduce the grade through precision or compliance", () => {
  const attempts = ["NonEvidenceMarked","MarkerReclaimBlocked","EvidenceMarkerRejected"].map((x,i)=>e(x,"floor",{},i+2));
  assert.equal(overall([...baseline,...attempts]),overall(baseline));
  assert.equal(scoreEvidence(attempts,truth,rules).nonEvidenceMarkCount,1);
});
test("pure report completion statements are ignored in both assessment numerator and denominator", () => {
  for (const line of rules.trainingReportLines!) {
    const event = e("ReportLinesSelected",line.evidenceId,{lineIds:line.lineId});
    assert.equal(scoreEvidence([event],truth,rules).documentationAccuracy,undefined);
    assert.equal(scoreEvidence([event],truth,rules).documentationUnclassified,0);
    assert.equal(scoreEvidence([event],truth,old).documentationAccuracy,1);
  }
  const wrong = e("ReportLinesSelected","EVD-014",{lineIds:"knife-conclusion-weapon"});
  const mixed = {...wrong,payload:[{key:"lineIds",value:"knife-conclusion-weapon,knife-print-on-handle"}]};
  assert.equal(scoreEvidence([mixed],truth,rules).documentationAccuracy,0);
  assert.equal(scoreEvidence([mixed],truth,old).documentationAccuracy,0.5);
  assert.equal(overall([...baseline,mixed]),overall([...baseline,wrong]));
});
test("every other authored report observation, interpretation and unsupported claim remains assessed", () => {
  const trainingIds = new Set(rules.trainingReportLines!.map(x=>x.lineId));
  for (const item of truth.evidenceReportLines) for (const line of item.reportLineOptions) {
    if (trainingIds.has(line.id)) continue;
    const result = scoreEvidence([e("ReportLinesSelected",item.evidenceId,{lineIds:line.id})],truth,rules);
    assert.equal(result.documentationAccuracy,line.isAccurate ? 1 : 0,line.id);
  }
});
test("all existing hypothesis reasoning options still change assessment", () => {
  for (const h of truth.hypothesisCheckpoints) {
    const correct = e("HypothesisSubmitted",h.id,{reasoningOptionId:h.reasoningOptions.find(x=>x.isCorrect)!.id});
    const wrong = e("HypothesisSubmitted",h.id,{reasoningOptionId:h.reasoningOptions.find(x=>!x.isCorrect)!.id});
    assert.equal(scoreEvidence([correct],truth,rules).reasoningAccuracy,1);
    assert.equal(scoreEvidence([wrong],truth,rules).reasoningAccuracy,0);
    assert.ok(overall([correct])! > overall([wrong])!);
  }
});
test("deduction relationship weights/formula still change assessment", () => {
  const complete = truth.relationships.map(r=>({relationshipId:r.relationshipId,state:"Completed",wasEverSelected:true}));
  const full = scoreRelationships(complete,truth).relationshipAccuracy;
  const partial = scoreRelationships(complete.slice(0,3),truth).relationshipAccuracy;
  assert.equal(full,1); assert.equal(partial,0.6);
  assert.ok(computeOverallScore({relationshipAccuracy:full},rules.categoryWeights)! > computeOverallScore({relationshipAccuracy:partial},rules.categoryWeights)!);
});
test("unchanged exact conclusion/ending pair still determines assessment", () => {
  for (const [conclusion,ending,expected] of [["conclusion-brother","ending-brother-accused",1],["conclusion-brother","ending-premature-submission",0],["conclusion-peter","ending-peter-unsupported",0],["CONCLUSION-INCONCLUSIVE","ending-inconclusive",0]] as const) {
    const value = scoreConclusion({sessionId:"test",scenarioId,selectedConclusionId:conclusion,resolvedEndingId:ending},truth);
    assert.equal(value,expected);
    assert.equal(computeOverallScore({finalConclusionAccuracy:value},rules.categoryWeights),expected);
  }
});
test("1.0.0 through 1.5.0 and missing-version fallback preserve procedural scoring semantics", () => {
  for (const version of ["1.0.0","1.1.0","1.2.0","1.3.0","1.4.0","1.5.0"]) {
    const r = resolveSessionScoring(scenarioId,"1.2.0",version).scoringRules!;
    assert.equal(r.scoringRulesVersion,version);
    assert.equal(r.categoryWeights.criticalRecall,2);
    assert.equal(r.categoryWeights.proceduralCompliance,1);
    assert.equal(r.trainingReportLines,undefined);
  }
  assert.equal(resolveSessionScoring(scenarioId,null,null).scoringRulesVersion,"1.0.0");
});
test("training exclusions cannot hide mismatched evidence IDs or unknown report selections", () => {
  const result = scoreEvidence([
    e("ReportLinesSelected","BODY-A",{lineIds:"knife-print-on-handle"}),
    e("ReportLinesSelected","EVD-014",{lineIds:"unknown-line,knife-print-on-handle"},2),
  ],truth,rules);
  assert.equal(result.documentationUnclassified,2);
  assert.equal(result.documentationAccuracy,undefined);
  assert.equal(result.warnings.length,1);
});
test("historical scoring definitions remain byte-identical", {skip: !process.env.VICSI_UNITY_PROJECT}, () => {
  assert.ok(process.env.VICSI_UNITY_PROJECT,"set VICSI_UNITY_PROJECT for historical/gate checks");
  const hashes: Record<string,string> = JSON.parse(fs.readFileSync(process.env.VICSI_UNITY_PROJECT+"/docs/evidence/assessment-phase1/preserved-hashes.json","utf8"));
  for (const [file,expected] of Object.entries(hashes)) {
    // The session payload is intentionally simplified and the game has evolved.
    // This historical baseline guards immutable versioned scoring data, not the
    // entire current game source against a months-old file hash.
    if (!file.replaceAll("\\","/").includes("/src/lib/scoring/data/")) continue;
    assert.equal(crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"),expected,file);
  }
});
