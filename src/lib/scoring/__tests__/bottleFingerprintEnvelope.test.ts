import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {mergeAssessmentEvents} from "../assessmentEventEnvelope.ts";

const match={sequenceNumber:1,timestampMs:100,eventType:"FingerprintIdentified",targetId:"EVD-018",payload:[
  {key:"matches",value:JSON.stringify({identities:["John","Peter","Paul"]})},
  {key:"sourceSampleId",value:"fingerprint-sample:EVD-018"},{key:"scored",value:"false"},
]};
test("three bottle identities survive the essential envelope with raw events disabled",()=>{
  const merged=mergeAssessmentEvents({scoringRulesVersion:"1.7.0",orderedEvents:[],deductionAssessmentEvents:[match]});
  assert.deepEqual(merged.orderedEvents,[match]);
  assert.deepEqual(JSON.parse(match.payload[0].value).identities,["John","Peter","Paul"]);
});
test("duplicate transport copies preserve one identification without merging people",()=>{
  const merged=mergeAssessmentEvents({scoringRulesVersion:"1.7.0",orderedEvents:[match],deductionAssessmentEvents:[match]});
  assert.deepEqual(merged.orderedEvents,[match]);
  assert.throws(()=>mergeAssessmentEvents({scoringRulesVersion:"1.7.0",orderedEvents:[match],deductionAssessmentEvents:[{...match,payload:[]}]}));
});
test("single-person knife results remain independent",()=>{
  const knife={...match,sequenceNumber:2,targetId:"EVD-014",payload:[{key:"matches",value:JSON.stringify({identities:["Paul"]})}]};
  const merged=mergeAssessmentEvents({scoringRulesVersion:"1.7.0",deductionAssessmentEvents:[match,knife]});
  assert.deepEqual(merged.orderedEvents,[match,knife]);
});
const wire=process.env.VICSI_BOTTLE_WIRE;
test("actual Unity upload carries all three identities in its essential event and any legacy summary",{skip:!wire},()=>{
  const payload=JSON.parse(fs.readFileSync(wire!,"utf8"));
  assert.equal(payload.includesRawEventLog,false);
  const legacySummary=payload.evidenceResults?.find((e:{evidenceId:string})=>e.evidenceId==="EVD-018");
  if(legacySummary) assert.deepEqual(legacySummary.fingerprintMatchIdentities,["John","Peter","Paul"]);
  else assert.equal(payload.scoringRulesVersion,"1.7.0"); // Current minimal records retain the original event instead.
  const merged=mergeAssessmentEvents(payload);
  const matches=(merged.orderedEvents as typeof match[]).filter(e=>e.eventType==="FingerprintIdentified"&&e.targetId==="EVD-018");
  assert.equal(matches.length,1);
  assert.deepEqual(JSON.parse(matches[0].payload.find(p=>p.key==="matches")!.value).identities,["John","Peter","Paul"]);
});
