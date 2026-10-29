import { countVersionedContent } from "../../versionedContentCounts.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { resolveGroundTruth, resolveSessionScoring } from "../registry.ts";
import { scoreConclusion } from "../conclusionScorer.ts";
import { scoreEvidence } from "../evidenceScorer.ts";
import { scoreRelationships } from "../relationshipScorer.ts";
import type { ScoringSessionEvent } from "../types.ts";
import { resolveConclusion, resolveEndingTitle, resolveFindingName } from "../../scenarioContent.ts";

const key = resolveGroundTruth("CSI-ENVIRONMENT-001", "1.2.0")!;
test("1.2.0 display maps Peter and distinguishes the supported and premature Paul outcomes",()=>{
  assert.equal(resolveConclusion("conclusion-peter","1.2.0").displayName,"Peter");
  assert.equal(resolveConclusion("conclusion-brother","1.2.0").displayName,"Paul");
  assert.equal(resolveEndingTitle("ending-peter-unsupported","1.2.0"),"Peter — Unsupported Accusation");
  assert.equal(resolveEndingTitle("ending-premature-submission","1.2.0"),"Paul — Insufficiently Supported Accusation");
  assert.equal(resolveEndingTitle("ending-brother-accused","1.2.0"),"Paul — Supported Accusation");
  assert.equal(resolveFindingName("FIND-KNIFE-PRINT-BROTHER","1.2.0"),"Paul's Fingerprint Identified on Knife");
});
test("historical outcome display semantics remain unchanged",()=>{
  assert.equal(resolveEndingTitle("ending-premature-submission","1.1.0"),"Premature Submission");
  assert.equal(resolveEndingTitle("ending-brother-accused","1.1.0"),"Brother Accused");
  assert.equal(resolveEndingTitle("ending-premature-submission"),"Premature Submission");
});
test("The Last Drink resolves with unchanged scoring 1.5.0", () => {
  const resolution = resolveSessionScoring("CSI-ENVIRONMENT-001", "1.2.0", "1.5.0");
  assert.ok(resolution.groundTruth);
  assert.equal(resolution.scoringRules!.scoringRulesVersion, "1.5.0");
  assert.equal(key.scenarioVersion, "1.1.0");
});
for (const [conclusion, ending, expected] of [
  ["conclusion-brother", "ending-brother-accused", 1],
  ["conclusion-brother", "ending-premature-submission", 0],
  ["conclusion-peter", "ending-peter-unsupported", 0],
  ["CONCLUSION-INCONCLUSIVE", "ending-inconclusive", 0],
  ["conclusion-peter", "ending-brother-accused", 0],
] as const) {
  test(`1.2.0 outcome ${conclusion}/${ending} receives ${expected}`, () => {
    assert.equal(scoreConclusion({sessionId:"test",scenarioId:key.scenarioId,selectedConclusionId:conclusion,resolvedEndingId:ending},key), expected);
  });
}
test("all three checkpoints classify the intentional answer and distractors", () => {
  assert.deepEqual(key.hypothesisCheckpoints.map(h=>h.id), ["HYP-01","HYP-02","HYP-03"]);
  const events: ScoringSessionEvent[] = key.hypothesisCheckpoints.map((h,i)=>({sequenceNumber:i,timestampMs:i,eventType:"HypothesisSubmitted",targetId:h.id,payload:[{key:"reasoningOptionId",value:h.reasoningOptions.find(o=>o.isCorrect)!.id}]}));
  assert.equal(scoreEvidence(events,key).reasoningAccuracy,1);
  const wrong=events.map((e,i)=>({...e,payload:[{key:"reasoningOptionId",value:key.hypothesisCheckpoints[i].reasoningOptions.find(o=>!o.isCorrect)!.id}]}));
  assert.equal(scoreEvidence(wrong,key).reasoningAccuracy,0);
});
test("BODY-A documentation is classified without adding a collectible recall item", () => {
  assert.deepEqual(key.evidence.map(e=>e.evidenceId),["EVD-014","EVD-015","EVD-018"]);
  const result=scoreEvidence([{sequenceNumber:1,timestampMs:1,eventType:"ReportLinesSelected",targetId:"BODY-A",payload:[{key:"lineIds",value:"body-a-location,body-a-position,body-a-wound-sharp-object"}]}],key);
  assert.equal(result.documentationTruePositives,3);
  assert.equal(result.documentationUnclassified,0);
  assert.equal(result.criticalTotal,2);
});
test("five active board relationships determine the 1.2.0 denominator",()=>{
  assert.equal(key.relationships.length,5);
  const completed=key.relationships.map(r=>({relationshipId:r.relationshipId,state:"Completed",wasEverSelected:true}));
  assert.equal(scoreRelationships(completed,key).relationshipAccuracy,1);
  assert.equal(scoreRelationships(completed.slice(0,3),key).relationshipAccuracy,0.6);
});
test("historical explicit and missing versions retain their original keys",()=>{
  const old=resolveGroundTruth(key.scenarioId,"1.1.0")!;
  assert.equal(old.relationships.length,3);
  assert.equal(old.hypothesisCheckpoints.length,2);
  assert.equal(resolveSessionScoring(key.scenarioId,null,null).groundTruthVersion,"1.0.0");
  assert.equal(resolveGroundTruth(key.scenarioId,"9.9.9"),null);
  assert.equal(scoreConclusion({sessionId:"old",scenarioId:key.scenarioId,selectedConclusionId:"conclusion-brother",resolvedEndingId:"ending-brother-accused"},old),1);
});
test("active key excludes retired evidence and outcome semantics",()=>{
  assert.ok(!JSON.stringify(key).match(/wife|affair|gloves|EVD-017|EVD-019|hyp01-fall/i));
});
test("current Unity export matches preserved history plus the current versioned timeline rule", {skip:!process.env.VICSI_UNITY_PROJECT},()=>{
  const unity=JSON.parse(fs.readFileSync(process.env.VICSI_UNITY_PROJECT+"/Assets/_Project/Data/Scenarios/GroundTruth_CSI_Environment.json","utf8"));
  const expected={...unity,scenarioId:"CSI-ENVIRONMENT-001",evidence:unity.evidence.map(({evidenceId,relevance}: {evidenceId:string;relevance:string})=>({evidenceId,relevance}))};
  const preserved=structuredClone(key) as unknown as Record<string,unknown>;
  // Export timestamps are metadata. The immutable historical key predates the
  // added timeline relationship; 1.7.0's authoritative rules include that rule.
  delete expected.generatedAt;delete preserved.generatedAt;
  const historicalIds=new Set(key.relationships.map(r=>r.relationshipId));
  assert.deepEqual(unity.relationships.filter((r:{relationshipId:string})=>!historicalIds.has(r.relationshipId)).map((r:{relationshipId:string})=>r.relationshipId),['REL-paul-timeline-contradiction']);
  const current=resolveSessionScoring(key.scenarioId,'1.2.0','1.7.0').scoringRules!.deduction!;
  for(const relationship of unity.relationships)assert.equal(current.relationships.find(r=>r.id===relationship.relationshipId)?.weight,relationship.scoreWeight);
  expected.relationships=unity.relationships.filter((r:{relationshipId:string})=>historicalIds.has(r.relationshipId));
  assert.deepEqual(preserved,expected);
});

test("mixed historical/current summaries keep shared IDs and labels separate", () => {
  const rows = countVersionedContent([
    {id:"conclusion-brother",groundTruthVersion:"1.1.0"},
    {id:"conclusion-brother",groundTruthVersion:"1.2.0"},
    {id:"conclusion-brother",groundTruthVersion:"1.2.0"},
  ]);
  assert.equal(rows.length,2);
  assert.equal(rows[0].count,2);
  assert.equal(rows[0].groundTruthVersion,"1.2.0");
  assert.equal(resolveConclusion(rows[0].id,rows[0].groundTruthVersion).displayName,"Paul");
  assert.equal(resolveConclusion(rows[1].id,rows[1].groundTruthVersion).displayName,resolveConclusion("conclusion-brother","1.1.0").displayName);
  assert.equal(countVersionedContent([{id:"ending-premature-submission"}])[0].groundTruthVersion,null);
});
