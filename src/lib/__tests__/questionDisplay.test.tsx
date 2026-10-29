import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import definition from '../data/questionDisplay.v1.json' with {type:'json'};
import {questionLabel,questionText} from '../questionDisplay.ts';
import {resolveEvidenceName} from '../scenarioContent.ts';
import {currentResult} from './sessionRecord.fixture.ts';
import {rules} from './assessmentPresentation.fixture.ts';
import {SessionRecord} from '../../components/SessionRecord.tsx';
import {buildEducationalRecord} from '../sessionRecord.ts';

test('current question display order follows registered game order; legacy numbering remains independent',()=>{
 assert.deepEqual(definition.current,rules.checkpoints.map(q=>q.id));
 definition.current.forEach((id,i)=>assert.equal(questionLabel(id),`Reasoning Question ${i+1}`));
 definition.legacy.forEach((id,i)=>assert.equal(questionLabel(id),`Reasoning Question ${i+1}`));
 assert.equal(questionLabel('RC-03-FINGERPRINT'),'Reasoning Question 3');
 assert.equal(questionLabel('HYP-02'),'Reasoning Question 2');
 assert.equal(resolveEvidenceName('HYP-02'),'Reasoning Question 2');
 assert.equal(questionLabel('RC-03-FINGERPRINT-A'),'Reasoning Question 3 – Answer A');
 assert.equal(questionLabel('RC-03-FINGERPRINT',['RC-03-FINGERPRINT']),'Reasoning Question 1');
 assert.equal(questionText('Hypothesis Checkpoint: Submit Hypothesis & Reasoning'),'Reasoning Checkpoint: Confirm Answer');
 assert.doesNotMatch(questionText('HYP-99 / HYP-FUTURE / REL-future-link'),/HYP-|REL-/);
});

test('Unity and dashboard labels mirror authored current and legacy checkpoint order',{skip:!process.env.VICSI_UNITY_PROJECT},()=>{
 const root=process.env.VICSI_UNITY_PROJECT!;
 assert.deepEqual(JSON.parse(readFileSync(`${root}/Assets/Resources/QuestionDisplayNames_1.json`,'utf8')),definition);
 for(const [key,file] of [['current','Assets/Resources/ReasoningCheckpoints_LastDrink.asset'],['legacy','Assets/_Project/Data/Scenarios/HypothesisCheckpoints_CSI_Environment.asset']] as const){
  const ids=[...readFileSync(`${root}/${file}`,'utf8').matchAll(/^  - id: (\S+)/gm)].map(m=>m[1]);
  assert.deepEqual(definition[key],ids);
 }
});

test('both dashboard roles show readable current question and relationship headings with unchanged answers, weights and grades',()=>{
 const result=currentResult();
 const saved=result.events.find(e=>e.eventType==='DeductionAssessmentSnapshot')!.payload!.find(p=>p.key==='assessment')!;
 const input=JSON.parse(saved.value);
 input.questionRecords[0].question+=' HYP-03';
 input.questionRecords[0].options[0].text+=' REL-paul-timeline-contradiction';
 saved.value=JSON.stringify(input);
 const before=JSON.stringify(result),record=buildEducationalRecord(result);
 for(const instructor of [false,true]){
  const html=renderToStaticMarkup(<SessionRecord result={result} instructor={instructor}/>);
  assert.doesNotMatch(html,/HYP-|RC-\d+|REL-[a-z]/);
  for(let i=1;i<=6;i++)assert.ok(html.includes(`Reasoning Question ${i}`));
  assert.ok(html.replaceAll('&#x27;',"'").includes(questionLabel('REL-paul-timeline-contradiction')));
  assert.equal((html.match(/selected-answer-label/g)??[]).length,13);
 }
 assert.equal(record.score,100);assert.equal(record.questions.length,13);
 assert.equal(JSON.stringify(result),before);
});

test('raw-ID historical uploads remain readable without a question snapshot in both roles',()=>{
 const result=currentResult();result.scoringVersion='1.5.0';result.events=[];
 result.hypotheses=['HYP-01','HYP-02','HYP-03'].map(checkpointId=>({checkpointId,selectedOptionId:'recorded-option',reasoningOptionId:'recorded-reason'}));
 const before=JSON.stringify(result);
 for(const instructor of [false,true]){
  const html=renderToStaticMarkup(<SessionRecord result={result} instructor={instructor}/>);
  assert.doesNotMatch(html,/HYP-/);
  for(let i=1;i<=3;i++)assert.ok(html.includes(`Reasoning Question ${i}`));
  assert.match(html,/recorded-option/);assert.match(html,/recorded-reason/);
 }
 assert.equal(JSON.stringify(result),before);
});
