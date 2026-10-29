import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { scoreMeasurement } from "../measurementScorer.ts";
import { resolveScoringRules } from "../registry.ts";
import { CSI_NEW_HOUSE_MEASUREMENTS_V1 } from "../data/csiEnvironment.newHouse.v1.ts";
import { CSI_NEW_HOUSE_MEASUREMENTS_V2 } from "../data/csiEnvironment.newHouse.v2.ts";
import { CSI_NEW_HOUSE_MEASUREMENTS_V3 } from "../data/csiEnvironment.newHouse.v3.ts";
import type { MeasurementRequirementRule, ScoringSessionEvent } from "../types.ts";

const current = resolveScoringRules("CSI-ENVIRONMENT-001","1.7.0")!;
const historical = resolveScoringRules("CSI-ENVIRONMENT-001","1.5.0")!;
function events(requirements: MeasurementRequirementRule[], layoutId?: string): ScoringSessionEvent[] {
  return requirements.flatMap(r => [[r.referenceAId,r.expectedDistanceA],[r.referenceBId,r.expectedDistanceB]].map(([referenceId,distance],i) => ({
    sequenceNumber:i+1,timestampMs:i*1000,eventType:"MeasurementTaken",targetId:r.evidenceId,
    payload:Object.entries({requirementId:r.requirementId,referenceId:String(referenceId),measuredDistance:Number(distance).toFixed(3),afterDisturbance:"False",...(layoutId===undefined?{}:{layoutId})}).map(([key,value])=>({key,value})),
  })));
}

test("new-house-v1 measurements use registered new geometry with unchanged tolerance",()=>{
  const result=scoreMeasurement(events(CSI_NEW_HOUSE_MEASUREMENTS_V1,"new-house-v1"),current.measurement);
  assert.equal(result.measurementAccuracy,1);assert.equal(result.measurementCompletion,1);assert.equal(result.measurement,1);
  assert.equal(result.items.length,4);assert.equal(current.categoryWeights.measurement,0);
  assert.ok(CSI_NEW_HOUSE_MEASUREMENTS_V1.every(r=>r.tolerance===0.1));
});
test("untagged historical sessions retain their previous key and exact output",()=>{
  const old=events(historical.measurement!.requirements);
  assert.deepEqual(scoreMeasurement(old,current.measurement),scoreMeasurement(old,historical.measurement));
  assert.equal(scoreMeasurement(old,current.measurement).measurementAccuracy,1);
  assert.equal(historical.measurement!.layoutProfiles,undefined);
});
test("repositioned evidence uses v2 while v1 sessions retain their frozen geometry",()=>{
  assert.equal(scoreMeasurement(events(CSI_NEW_HOUSE_MEASUREMENTS_V2,"new-house-v2"),current.measurement).measurementAccuracy,1);
  assert.equal(scoreMeasurement(events(CSI_NEW_HOUSE_MEASUREMENTS_V1,"new-house-v1"),current.measurement).measurementAccuracy,1);
  const oldKnife=CSI_NEW_HOUSE_MEASUREMENTS_V1.find(r=>r.evidenceId==="EVD-014")!;
  assert.equal(oldKnife.expectedDistanceA,0.596588);
  assert.equal(oldKnife.expectedDistanceB,0.65503);
  assert.equal(scoreMeasurement(events(CSI_NEW_HOUSE_MEASUREMENTS_V1,"new-house-v2"),current.measurement).measurementAccuracy,0.5);
  const mixed=events(CSI_NEW_HOUSE_MEASUREMENTS_V2,"new-house-v2");
  mixed[0].payload.find(p=>p.key==="layoutId")!.value="new-house-v1";
  assert.equal(scoreMeasurement(mixed,current.measurement).measurementAccuracy,undefined);
});
test("client expected-distance/accuracy claims cannot override the registered layout",()=>{
  const input=events(CSI_NEW_HOUSE_MEASUREMENTS_V1,"new-house-v1");
  input[0].payload.find(p=>p.key==="measuredDistance")!.value="99";
  input[0].payload.push({key:"expectedDistance",value:"99"},{key:"withinTolerance",value:"True"});
  const result=scoreMeasurement(input,current.measurement);
  assert.equal(result.measurementAccuracy,0.875);assert.equal(result.items[0].withinToleranceA,false);
});
test("unknown or mixed layouts leave measurement analytics unavailable instead of using the wrong house",()=>{
  assert.equal(scoreMeasurement(events(CSI_NEW_HOUSE_MEASUREMENTS_V1,"unknown-house"),current.measurement).measurementAccuracy,undefined);
  const mixed=events(CSI_NEW_HOUSE_MEASUREMENTS_V1,"new-house-v1");mixed[0].payload=mixed[0].payload.filter(p=>p.key!=="layoutId");
  assert.equal(scoreMeasurement(mixed,current.measurement).measurementAccuracy,undefined);
  assert.equal(scoreMeasurement(events(CSI_NEW_HOUSE_MEASUREMENTS_V1,"new-house-v1"),historical.measurement).measurementAccuracy,undefined);
});
const unity=process.env.VICSI_UNITY_PROJECT;
test("foot-side wall layout uses v3 while v2 retains its original measurements",()=>{
  assert.equal(scoreMeasurement(events(CSI_NEW_HOUSE_MEASUREMENTS_V3,"new-house-v3"),current.measurement).measurementAccuracy,1);
  assert.equal(scoreMeasurement(events(CSI_NEW_HOUSE_MEASUREMENTS_V2,"new-house-v2"),current.measurement).measurementAccuracy,1);
  assert.equal(CSI_NEW_HOUSE_MEASUREMENTS_V2[2].expectedDistanceA,1.434996);
  assert.equal(CSI_NEW_HOUSE_MEASUREMENTS_V3[2].expectedDistanceA,1.0119886);
  const mixed=events(CSI_NEW_HOUSE_MEASUREMENTS_V3,"new-house-v3");
  mixed[0].payload.find(p=>p.key==="layoutId")!.value="new-house-v2";
  assert.equal(scoreMeasurement(mixed,current.measurement).measurementAccuracy,undefined);
});
test("server profile matches the saved Unity layout, references and expected distances",{skip:!unity},()=>{
  const text=fs.readFileSync(path.join(unity!,"Assets/_Project/Data/Measurement/Measurements_CSI_Environment.asset"),"utf8");
  const blocks=text.split(/^  - requirementId: /m).slice(1);
  for(const r of CSI_NEW_HOUSE_MEASUREMENTS_V3){
    const block=blocks.find(b=>b.startsWith(r.requirementId+"\n")||b.startsWith(r.requirementId+"\r\n"))!;assert.ok(block,r.requirementId);
    for(const key of ["referenceAId","referenceBId","expectedDistanceA","expectedDistanceB","tolerance"] as const){
      const value=block.match(new RegExp(`^    ${key}: (.+)$`,"m"))![1].trim();
      if(typeof r[key]==="number")assert.ok(Math.abs(Number(value)-Number(r[key]))<0.000002,`${r.requirementId}/${key}`);
      else assert.equal(value,r[key]);
    }
  }
  const scene=fs.readFileSync(path.join(unity!,"Assets/_Project/Scenes/Scenarios/CSI_Environment.unity"),"utf8");
  assert.match(scene,/measurementLayoutId: new-house-v3/);
  const source=fs.readFileSync(path.join(unity!,"Assets/_Project/Scripts/Measurement/MeasurementStateManager.cs"),"utf8");
  assert.match(source,/payload\["layoutId"\] = Instance\.measurementLayoutId/);
});
