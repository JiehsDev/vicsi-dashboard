import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {mergeAssessmentEvents} from "../assessmentEventEnvelope.ts";

const ids=["EVD-014","EVD-018","EVD-015","blood-sample:EVD-014","fingerprint-sample:EVD-014","fingerprint-sample:EVD-018"];
const deposits=ids.map((id,index)=>({sequenceNumber:index+1,timestampMs:100,eventType:"EvidenceDeposited",targetId:id,payload:[
  {key:"boxId",value:"EvidenceBox"},{key:"sourceEvidenceId",value:id.split(":").at(-1)!},
  {key:"previousCustodyLocation",value:"Inventory"},{key:"newCustodyLocation",value:"EvidenceBox"},{key:"scored",value:"false"},
]}));
const pass={sequenceNumber:7,timestampMs:100,eventType:"CustodyPassCompleted",targetId:"EvidenceBox",payload:[{key:"itemCount",value:"6"},{key:"scored",value:"false"}]};
test("bulk custody survives raw-disabled envelope without losing sample identities",()=>{
  const merged=mergeAssessmentEvents({scoringRulesVersion:"1.7.0",orderedEvents:[],deductionAssessmentEvents:[...deposits,pass]});
  assert.deepEqual(merged.orderedEvents,[...deposits,pass]);
  assert.equal(new Set(deposits.map(e=>e.targetId)).size,6);
});
test("raw and essential transport copies do not duplicate custody",()=>{
  const merged=mergeAssessmentEvents({scoringRulesVersion:"1.7.0",orderedEvents:[...deposits,pass],deductionAssessmentEvents:[...deposits,pass]});
  assert.equal((merged.orderedEvents as unknown[]).length,7);
});
const wire=process.env.VICSI_CUSTODY_WIRE;
test("actual Unity custody payload retains all six item records",{skip:!wire},()=>{
  const payload=JSON.parse(fs.readFileSync(wire!,"utf8"));
  assert.equal(payload.includesRawEventLog,false);
  const events=mergeAssessmentEvents(payload).orderedEvents as typeof deposits;
  const actual=events.filter(e=>e.eventType==="EvidenceDeposited");
  assert.deepEqual(actual.map(e=>e.targetId).sort(),[...ids].sort());
  assert.equal(events.filter(e=>e.eventType==="CustodyPassCompleted").length,1);
  for(const entry of actual) {
    assert.ok(entry.payload.some(p=>p.key==="sourceEvidenceId" && p.value===entry.targetId.split(":").at(-1)));
    assert.ok(entry.payload.some(p=>p.key==="scored" && p.value==="false"));
  }
});
