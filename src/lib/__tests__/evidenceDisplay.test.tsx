import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {evidenceLabel,evidenceText} from '../evidenceDisplay.ts';
import {resolveEvidenceName} from '../scenarioContent.ts';
import {procedureTimeline,buildEducationalRecord} from '../sessionRecord.ts';
import {currentResult} from './sessionRecord.fixture.ts';
import {SessionRecord} from '../../components/SessionRecord.tsx';
import {EvidenceTimeline} from '../../components/EvidenceTimeline.tsx';
import {DeductionResultPanels} from '../../components/DeductionResultPanels.tsx';
import {resultFor} from './assessmentPresentation.fixture.ts';

test('shared Unity and dashboard presentation mapping agree exactly',{skip:!process.env.VICSI_UNITY_PROJECT},()=>{
 const unity=process.env.VICSI_UNITY_PROJECT;assert.ok(unity);
 assert.deepEqual(JSON.parse(readFileSync(`${unity}/Assets/Resources/EvidenceDisplayNames_1.json`,'utf8')),JSON.parse(readFileSync('src/lib/data/evidenceDisplay.v1.json','utf8')));
});
test('current and historical IDs resolve without rewriting data; derived sample IDs retain source',()=>{
 for(const [id,label] of [['EVD-014','Evidence 1 – Kitchen Knife'],['EVD-015','Evidence 2 – Blood Spatter'],['EVD-018','Evidence 3 – Empty Liquor Bottle'],['BODY-A','Body A – John']]){
   assert.equal(evidenceLabel(id),label);assert.equal(resolveEvidenceName(id),label);
 }
 assert.equal(evidenceLabel('fingerprint-sample:EVD-018'),'Fingerprint Sample – Evidence 3 – Empty Liquor Bottle');
 assert.equal(evidenceLabel('blood-sample:EVD-014'),'Blood Sample – Evidence 1 – Kitchen Knife');
 assert.equal(evidenceLabel('FUTURE-ID','Future evidence'),'Future evidence');
 assert.equal(evidenceText('Processed fingerprint for EVD-014'), 'Processed fingerprint for Evidence 1 – Kitchen Knife');
 assert.equal(evidenceText('Collected EVD-018'), 'Collected Evidence 3 – Empty Liquor Bottle');
 assert.equal(evidenceText('Observed BODY-A'), 'Observed Body A – John');
 assert.equal(evidenceText('EVD-017 / EVD-019 / EVD-999'), "Victim's mobile phone / Disposable gloves / Unrecognized evidence");
 assert.equal(evidenceLabel('fingerprint-sample:EVD-999'),'Fingerprint Sample – Unrecognized evidence');
 assert.equal(resolveEvidenceName('EVD-999'),'Unrecognized evidence');
 assert.equal(evidenceText('EVD-0149 and X-EVD-015'), 'Unrecognized evidence and X-Evidence 2 – Blood Spatter');
});

test('legacy activity text and detailed review panels resolve IDs without altering source records',()=>{
 const events=[{timestamp:'00:01:00',action:'Processed fingerprint for EVD-014',item:'EVD-015',note:'Collected EVD-018 near BODY-A',eventKind:'informational' as const,correct:null}];
 const beforeEvents=JSON.stringify(events);
 const timeline=renderToStaticMarkup(<EvidenceTimeline events={events}/>);
 assert.doesNotMatch(timeline,/EVD-01[458]|BODY-A/);
 for(const label of ['Evidence 1 – Kitchen Knife','Evidence 2 – Blood Spatter','Evidence 3 – Empty Liquor Bottle','Body A – John'])assert.ok(timeline.includes(label));
 assert.equal(JSON.stringify(events),beforeEvents);
 const result=resultFor();
 const view=result.assessment!;
 Object.assign(view.checkpoints[0],{prompt:'Compare EVD-014 and BODY-A',context:'Observed EVD-015',response:'Collected EVD-018',feedback:'EVD-014 supports handling'});
 Object.assign(view.relationships[0],{label:'Compare EVD-014 with BODY-A',interpretation:'EVD-015 supports reconstruction',explanation:'EVD-018 establishes context'});
 const before=JSON.stringify(result);
 for(const instructor of [false,true]){
  const html=renderToStaticMarkup(<DeductionResultPanels result={result} instructor={instructor}/>);
  assert.doesNotMatch(html,/EVD-01[458]|BODY-A/);
  for(const label of ['Evidence 1 – Kitchen Knife','Evidence 2 – Blood Spatter','Evidence 3 – Empty Liquor Bottle','Body A – John'])assert.ok(html.includes(label));
 }
 assert.equal(JSON.stringify(result),before);
});

test('old uploads with only internal evidence targets render for both dashboard roles',()=>{
 const result=currentResult();
 result.events=['EVD-014','EVD-015','EVD-018','BODY-A'].map((targetId,i)=>({sequenceNumber:i+1,timestampMs:i*1000,eventType:'EvidenceStatusChanged',targetId,payload:[{key:'status',value:'Processed'}]}));
 const before=JSON.stringify(result);
 for(const instructor of [false,true]){
  const html=renderToStaticMarkup(<SessionRecord result={result} instructor={instructor}/>);
  assert.doesNotMatch(html,/EVD-01[458]|BODY-A/);
  for(const label of ['Evidence 1 – Kitchen Knife','Evidence 2 – Blood Spatter','Evidence 3 – Empty Liquor Bottle','Body A – John'])assert.ok(html.includes(label));
 }
 assert.equal(JSON.stringify(result),before);
});
test('historical timeline preserves actual marker numbers and event order while resolving visible IDs',()=>{
 const events=[{sequenceNumber:3,timestampMs:20,eventType:'EvidenceStatusChanged',targetId:'EVD-018',payload:[{key:'status',value:'Marked'},{key:'tentNumber',value:'6'}]},
 {sequenceNumber:4,timestampMs:20,eventType:'EvidenceAddedToInventory',targetId:'fingerprint-sample:EVD-018',payload:[{key:'sampleType',value:'Fingerprint'},{key:'sourceEvidenceId',value:'EVD-018'}]}];
 const before=JSON.stringify(events),rows=procedureTimeline(events);
 assert.match(rows[0].description,/marker 6.*Evidence 3 – Empty Liquor Bottle/);
 assert.match(rows[1].description,/fingerprint sample/i);assert.match(rows[1].description,/Evidence 3 – Empty Liquor Bottle/);
 assert.doesNotMatch(rows.map(e=>e.description).join(' '),/EVD-01[458]/);assert.equal(JSON.stringify(events),before);
});
test('student and instructor render legacy IDs in question prose without mutating frozen inputs or grades',()=>{
 const r=currentResult();const event=r.events.find(e=>e.eventType==='DeductionAssessmentSnapshot')!;
 const entry=event.payload!.find(p=>p.key==='assessment')!;const snapshot=JSON.parse(entry.value);
 snapshot.questionRecords[0].question+=' EVD-014 and BODY-A';snapshot.questionRecords[0].options[0].text+=' EVD-015 and EVD-018';entry.value=JSON.stringify(snapshot);
 r.events.push({sequenceNumber:999,timestampMs:1000,eventType:'EvidenceStatusChanged',targetId:'EVD-014',payload:[{key:'status',value:'Processed'}]});
 const before=JSON.stringify(r);
 for(const instructor of [false,true]){
  const html=renderToStaticMarkup(<SessionRecord result={r} instructor={instructor}/>);
  assert.doesNotMatch(html,/EVD-01[458]|BODY-A/);assert.match(html,/Evidence 1 – Kitchen Knife/);assert.match(html,/Evidence 2 – Blood Spatter/);assert.match(html,/Evidence 3 – Empty Liquor Bottle/);assert.match(html,/Body A/);
 }
 assert.equal(buildEducationalRecord(r).score,100);assert.equal(JSON.stringify(r),before);
});
