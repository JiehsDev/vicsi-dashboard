import { test } from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {buildAssessmentPresentation,assessedScore,formatPoints} from '../assessmentPresentation.ts';
import {DeductionResultPanels} from '../../components/DeductionResultPanels.tsx';
import {ResultScoreSummary} from '../../components/ResultScoreSummary.tsx';
import {ResultCategoryGrid} from '../../components/ResultCategoryGrid.tsx';
import {deductionExportColumns} from '../resultExport.ts';
import {ACTIVE_LAST_DRINK_SCENARIO} from '../../../supabase/seed/active-last-drink-scenario.mjs';
import {scoreDeductionEvents} from '../scoring/deductionAssessmentScorer.ts';
import {resultFor,snapshot,rules} from './assessmentPresentation.fixture.ts';
const render=(result=resultFor(),instructor=false)=>renderToStaticMarkup(<DeductionResultPanels result={result} instructor={instructor}/>);
test('relationship review choices render in student and instructor Evidence Relationships panels',()=>{
  const i=snapshot();i.relationshipReviewVersion=1;i.boardConnections=[];i.completedRelationshipIds=[];
  i.relationshipResponses=rules.relationships.map((q,n)=>({relationshipId:q.id,responseId:q.correctInterpretationId!,responseOrder:n+1,answeredSeconds:100+n}));
  for(const instructor of [false,true]) {
    const html=render(resultFor(i),instructor);
    assert.match(html,/Evidence Relationships/);assert.match(html,/Selected interpretation:/);
    assert.match(html,/Confirmed response/);assert.doesNotMatch(html,/Board state:/);
    assert.match(html,/Reasoning Development/);assert.match(html,/Final Conclusion/);
    assert.match(html,/when, why, or whether/);assert.match(html,/midnight/);
  }
});
test('1.7.0 grade uses authoritative stored 60/25/15 outputs',()=>{
  const r=resultFor();r.categories.reasoningCheckpointComponent=52;r.categories.deductionRelationshipComponent=22;r.categories.finalConclusionComponent=15;r.categories.deductionTotalScore=89;
  r.assessment=buildAssessmentPresentation(r);const html=render(r);
  assert.match(html,/Deduction Performance/);assert.match(html,/52<small> \/ 60/);assert.match(html,/22<small> \/ 25/);assert.match(html,/15<small> \/ 15/);assert.equal(r.assessment!.total,89);
});
test('procedural categories never enter assessed component cards',()=>{
  const r=resultFor();Object.assign(r.categories,{procedureOrderCompliance:.25,proceduralCompliance:.1,scenePhotography:1,measurement:1});r.assessment=buildAssessmentPresentation(r);
  assert.deepEqual(r.assessment!.components.map(c=>c.maximum),[60,25,15]);assert.equal(r.assessment!.total,100);
  const html=render(r);assert.ok(html.indexOf('Procedure order compliance')>html.indexOf('Training Analytics'));assert.doesNotMatch(html,/Procedure Grade|Procedural Errors|CSI Score/);
});
test('timeline sorts actual recorded chronology, independent of roster/array order',()=>{
  const r=resultFor();r.events.reverse();const responses=r.events.filter(e=>e.eventType==='ReasoningCheckpointSubmitted');responses.find(e=>e.targetId==='RC-06-BLOODSTAIN')!.timestampMs=11000;
  r.assessment=buildAssessmentPresentation(r);assert.equal(r.assessment!.checkpoints[0].id,'RC-06-BLOODSTAIN');
});
test('uploaded weights are ignored and normal student HTML exposes only qualitative strength',()=>{
  const html=render();assert.match(html,/Strong evidence-based reasoning/);assert.doesNotMatch(html,/weight|999|maximumWeight|responseId|Checkpoint RC-/i);
});
test('instructor can inspect chronological responses, dimensions, identifiers and versions without weights',()=>{
  const html=render(resultFor(),true);assert.match(html,/Reasoning Question 3/);assert.match(html,/Limitation recognition/);assert.match(html,/Response order 3/);assert.match(html,/Scoring version: 1.7.0/);assert.doesNotMatch(html,/999/);
});
test('supported relationship shows support with contact limitations',()=>{const html=render();assert.match(html,/Supported/);assert.match(html,/not when, why, or who/);});
test('completed known link lacking facts is unsupported, never successful',()=>{
  const i=snapshot();i.completedRelationshipIds=['REL-bottle-supports-brother'];i.observedEvidenceIds=[];i.boardConnections=[];i.resolvedEndingId=rules.prematureEndingId;
  const r=resultFor(i);assert.equal(r.assessment!.relationships[0].support,'Unsupported');assert.doesNotMatch(render(r),/text-emerald-300/);
});
test('unknown current node pairs are explicitly unsupported',()=>{
  const i=snapshot();i.boardConnections.push({sourceId:'EVD-014',targetId:'unknown-card'});const r=resultFor(i);
  assert.ok(r.assessment!.relationships.some(r=>r.id.startsWith('unmatched:') && r.support==='Unsupported'));
});
test('supported Paul uses human wording without proof of guilt',()=>{const html=render();assert.match(html,/Paul is the strongest supported suspect/);assert.doesNotMatch(html,/scientifically proven|Supported Paul|supported_paul/);});
test('premature Paul feedback follows scorer',()=>{const i=snapshot();i.completedRelationshipIds=[];i.boardConnections=[];i.resolvedEndingId=rules.prematureEndingId;assert.match(render(resultFor(i)),/insufficiently supported/);});
test('unsupported Peter feedback follows scorer',()=>{const i=snapshot();i.selectedConclusionId=rules.peterConclusionId;i.resolvedEndingId=rules.peterEndingId;assert.match(render(resultFor(i)),/does not support this accusation/);});
test('both inconclusive support states render correctly',()=>{
  const i=snapshot();i.selectedConclusionId=rules.inconclusiveConclusionId;i.resolvedEndingId=rules.inconclusiveEndingId;
  assert.match(render(resultFor(i)),/did not integrate/);i.completedRelationshipIds=[];i.boardConnections=[];assert.match(render(resultFor(i)),/Recognizes the limitations/);
});
test('training completion is independent of grade and has no points',()=>{const html=render();const section=html.slice(html.indexOf('class="training-area"'));assert.match(section,/Completed/);assert.match(section,/no points/);assert.doesNotMatch(section,/\/ 100|\/ 60/);});
test('blocked actions and procedure-order records become guidance analytics, never penalties',()=>{
  const r=resultFor();r.events.push({sequenceNumber:90,timestampMs:90000,eventType:'EvidenceTransitionBlocked',targetId:'EVD-014',payload:[{key:'attempted',value:'Collected'},{key:'current',value:'Marked'}]});
  r.assessment=buildAssessmentPresentation(r);assert.equal(r.assessment!.total,100);assert.match(render(r),/attempted Collected while Marked/);assert.match(render(r),/do not subtract points/);
});
test('1.6.0 retains original ratios and historical score label',()=>{
  const r=resultFor();r.scoringVersion='1.6.0';r.verifiedScore=.86;assert.equal(buildAssessmentPresentation(r),undefined);
  const html=renderToStaticMarkup(<ResultScoreSummary result={r}/>);assert.match(html,/Historical verified score/);assert.match(html,/86%/);assert.doesNotMatch(html,/Deduction Score/);
  const categories=renderToStaticMarkup(<ResultCategoryGrid categories={{reasoningAccuracy:.8,documentationAccuracy:.7,relationshipAccuracy:.6,finalConclusionAccuracy:1,procedureOrderCompliance:.5}}/>);assert.match(categories,/Documentation accuracy/);assert.match(categories,/Procedure order compliance/);
});
test('missing checkpoint/event data renders placeholders without fabricated feedback',()=>{
  const r=resultFor();r.events=[];r.assessment=buildAssessmentPresentation(r);const html=render(r);assert.equal(r.assessment!.checkpoints.length,6);assert.match(html,/Not recorded/);assert.doesNotMatch(html,/NaN|undefined|0\/0|Strong evidence-based reasoning/);
});
test('incomplete and review sessions suppress grade, support labels and component points',()=>{
  const r=resultFor();r.completedAtUtc=null;r.verificationStatus='requires_review';r.assessment=buildAssessmentPresentation(r);assert.equal(r.assessment!.total,null);assert.equal(assessedScore(r),null);assert.doesNotMatch(render(r),/Strong evidence-based reasoning|text-emerald-300|100 \/ 100/);
});
test('nonfinite scores and missing components never render NaN or undefined',()=>{
  const r=resultFor();r.categories.reasoningCheckpointComponent=NaN;delete r.categories.finalConclusionComponent;r.categories.deductionTotalScore=NaN;r.assessment=buildAssessmentPresentation(r);assert.doesNotMatch(render(r),/NaN|undefined/);assert.equal(formatPoints(NaN), 'Not available');
});
test('mismatched registration never presents a final grade',()=>{const r=resultFor();r.scenarioVersion='9.9.9';r.assessment=buildAssessmentPresentation(r);assert.equal(r.assessment!.total,null);assert.equal(r.assessment!.checkpoints.length,0);});
test('malformed snapshot never crashes result rendering or yields support judgments',()=>{
  const r=resultFor();r.events.find(e=>e.eventType==='DeductionAssessmentSnapshot')!.payload=[{key:'assessment',value:'{"checkpoints":null}'}];r.assessment=buildAssessmentPresentation(r);assert.doesNotThrow(()=>render(r));assert.doesNotMatch(render(r),/Strong evidence-based reasoning/);
});
test('class summary displays deduction grade and three stored components',()=>{const html=renderToStaticMarkup(<ResultScoreSummary result={resultFor()}/>);assert.match(html,/Deduction Performance/);assert.match(html,/Reasoning 60 \/ 60/);assert.doesNotMatch(html,/compliance/i);});
test('class summaries require completion marker and expose training separately',()=>{
  const r=resultFor();r.trainingCompletion='Completed';assert.match(renderToStaticMarkup(<ResultScoreSummary result={r}/>),/Training Completion \(non-scored\): Completed/);
  delete r.assessmentComponents!.deductionAssessmentComplete;assert.equal(assessedScore(r),null);assert.match(renderToStaticMarkup(<ResultScoreSummary result={r}/>),/Not available/);
});
test('stored procedural notes survive an omitted raw event log',()=>{const r=resultFor();r.events=[];r.procedureViolations=[{eventType:'EvidenceTransitionBlocked',targetId:'EVD-014',timestampMs:10}];r.assessment=buildAssessmentPresentation(r);assert.match(render(r),/Procedural action blocked/);assert.equal(r.assessment!.training.notes.length,1);});
test('absent guidance receipt records never become a made-up prompt total',()=>{const r=resultFor();assert.equal(r.assessment!.training.metrics.find(m=>m.label==='Total guidance prompts received')!.value,'Not recorded — prompt receipt is not logged');});
test('CSV adds versioned deduction points without relabeling historical values',()=>{
  const r=resultFor();assert.equal(deductionExportColumns(r).deductionScore,100);assert.equal(deductionExportColumns(r).reasoningCheckpointPoints,60);
  r.scoringVersion='1.6.0';assert.equal(deductionExportColumns(r).deductionScore,null);assert.equal(r.verifiedScore,1);
  r.scoringVersion='1.7.0';r.verificationStatus='requires_review';assert.equal(deductionExportColumns(r).deductionScore,null);
});
test('development registration matches active scorer versions and seeds share it',()=>{
  assert.equal(ACTIVE_LAST_DRINK_SCENARIO.scenario_id,rules.scenarioId);assert.equal(ACTIVE_LAST_DRINK_SCENARIO.scenario_version,rules.scenarioVersion);assert.equal(ACTIVE_LAST_DRINK_SCENARIO.ground_truth_version,rules.groundTruthVersion);assert.equal(ACTIVE_LAST_DRINK_SCENARIO.scoring_rules_version,'1.7.0');
  for(const name of ['seed-assessment-dev-data.mjs','seed-john-doe-bypass-identity.mjs'])assert.match(readFileSync(new URL('../../../supabase/seed/'+name,import.meta.url),'utf8'),/ACTIVE_LAST_DRINK_SCENARIO/);
});
test('panels use readable chronological lists and a compact score summary',()=>{const html=render();assert.match(html,/reasoning-timeline/);assert.match(html,/score-summary/);assert.match(html,/interpretation-list/);assert.doesNotMatch(html,/min-w-\[|whitespace-nowrap|bg-slate-9/);});
test('real Phase 4 Unity envelope can be read without frontend field inventions',()=>{
  const wire=JSON.parse(readFileSync(new URL('./fixtures/phase4-unity-completed.json',import.meta.url),'utf8'));
  const r=resultFor();r.events=wire.deductionAssessmentEvents;r.selectedConclusionId=wire.selectedConclusionId;r.resolvedEndingId=wire.resolvedEndingId;r.completedAtUtc=wire.completedAtUtc;
  const scored=scoreDeductionEvents(wire.deductionAssessmentEvents,{sessionId:wire.sessionId,scenarioId:wire.scenarioId,selectedConclusionId:wire.selectedConclusionId,resolvedEndingId:wire.resolvedEndingId},wire.completedAtUtc,rules);
  assert.equal(scored.status,'complete');r.categories=scored.categories as Record<string,number>;r.verifiedScore=scored.overallScore!;
  r.assessment=buildAssessmentPresentation(r);assert.equal(r.assessment!.total,scored.totalScore);assert.equal(r.assessment!.checkpoints.length,6);assert.match(render(r),/Inconclusive/);assert.doesNotMatch(render(r),/NaN|undefined/);
});
