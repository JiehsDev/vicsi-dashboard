// Local read-only evidence renderer. GET requests only; never uploads or mutates records.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {renderToStaticMarkup} from 'react-dom/server';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import {PathnameContext,SearchParamsContext} from 'next/dist/shared/lib/hooks-client-context.shared-runtime.js';
import {AppShell} from '../../src/components/AppShell.tsx';
import {LoadingWorkspace} from '../../src/components/AnalyticsUI.tsx';
import {SessionRecord} from '../../src/components/SessionRecord.tsx';
import StudentPage from '../../src/app/results/page.tsx';
import InstructorPage from '../../src/app/(dashboard)/class-results/page.tsx';
import {resultFor,rules} from '../../src/lib/__tests__/assessmentPresentation.fixture.ts';
import {buildAssessmentPresentation} from '../../src/lib/assessmentPresentation.ts';
import {mergeAssessmentEvents} from '../../src/lib/scoring/assessmentEventEnvelope.ts';
import {scoreDeductionEvents} from '../../src/lib/scoring/deductionAssessmentScorer.ts';
import type {ResultDetail} from '../../src/lib/results.ts';
import type {ScoringSessionEvent} from '../../src/lib/scoring/types.ts';
const out='docs/evidence/dashboard-redesign';await mkdir(out,{recursive:true});
const project=process.env.VICSI_UNITY_PROJECT;if(!project)throw new Error('Set VICSI_UNITY_PROJECT to the audited Unity workspace.');
const wire=JSON.parse(await readFile(path.join(project,'docs/evidence/relationship-review/completed-upload-wire.json'),'utf8'));
const current=resultFor();current.sessionId='current-review-capture';current.studentId='sample-student';current.events=mergeAssessmentEvents(wire).orderedEvents as ScoringSessionEvent[];
current.selectedConclusionId=wire.selectedConclusionId;current.resolvedEndingId=wire.resolvedEndingId;current.completedAtUtc=wire.completedAtUtc;
const grade=scoreDeductionEvents(current.events.map(e=>({...e,payload:e.payload??[]})),{sessionId:wire.sessionId,scenarioId:wire.scenarioId,selectedConclusionId:wire.selectedConclusionId,resolvedEndingId:wire.resolvedEndingId},wire.completedAtUtc,rules);
if(grade.status!=='complete')throw new Error('Current Unity capture did not verify: '+grade.reviewReasons.join('; '));
current.categories=grade.categories as Record<string,number>;current.assessmentComponents=current.categories;current.verifiedScore=grade.overallScore!;current.assessment=buildAssessmentPresentation(current);current.trainingCompletion=current.events.some(e=>e.eventType==='InvestigationCompleted')?'Completed':'Not recorded';
current.evidenceResults=(wire.evidenceResults??[]).map((e:ResultDetail['evidenceResults'][number])=>({...e}));
current.confirmedFindingIds=wire.confirmedFindingIds??[];
current.startedAtUtc=wire.startedAtUtc??null;current.durationSeconds=wire.durationSeconds??null;
current.scenarioVersion=wire.scenarioVersion;current.groundTruthVersion=wire.groundTruthVersion;current.scoringVersion=wire.scoringRulesVersion;
current.relationships=(wire.relationshipResults??[]).map((r:{relationshipId:string;state:string;wasEverSelected:boolean})=>({relationshipId:r.relationshipId,state:r.state,wasEverSelected:r.wasEverSelected}));
current.assessment=buildAssessmentPresentation(current);
const root=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
const historical:ResultDetail[]=[];
if(process.env.VICSI_READ_LIVE==='true') {
 if(!root||!key)throw new Error('Read-only Supabase credentials unavailable.');
 const get=async(table:string,query:string)=>{const response=await fetch(`${root}/rest/v1/${table}?${query}`,{method:'GET',headers:{apikey:key,Authorization:`Bearer ${key}`}});if(!response.ok)throw new Error(`Read-only ${table}: ${response.status}`);return response.json();};
 const sessions=await get('assessment_sessions','select=*&is_test_session=eq.false&order=server_received_at_utc.desc&limit=20');
 const studentMap=new Map<string,string>();
 for(const [n,s] of sessions.entries()) {
  const where=`session_id=eq.${encodeURIComponent(s.session_id)}`;
  const [cat,ev,ed,re,notes]=await Promise.all([get('session_score_categories',`${where}&source=eq.server`),get('session_events',`${where}&order=sequence_number.asc&limit=1000`),get('session_evidence_results',where),get('session_relationships',where),get('session_procedure_violations',where)]);
  const r=resultFor();if(!studentMap.has(s.student_id))studentMap.set(s.student_id,`historical-student-${studentMap.size+1}`);
  Object.assign(r,{sessionId:`historical-attempt-${n+1}`,receiptId:`historical-receipt-${n+1}`,studentId:studentMap.get(s.student_id),classId:'historical-class',scenarioId:s.scenario_id,scenarioDisplayName:'CSI Environment',scenarioVersion:s.scenario_version,scoringVersion:s.scoring_rules_version,groundTruthVersion:s.ground_truth_version,startedAtUtc:s.started_at_utc,completedAtUtc:s.completed_at_utc,durationSeconds:s.duration_seconds,selectedConclusionId:s.selected_conclusion_id,resolvedEndingId:s.resolved_ending_id,verificationStatus:s.verification_status,verifiedScore:s.verified_score,serverReceivedAtUtc:s.server_received_at_utc,categories:Object.fromEntries(cat.map((c:{category_key:string;category_value:number})=>[c.category_key,c.category_value])),assessmentComponents:undefined,assessment:undefined,verificationMessage:null,confirmedFindingIds:[],unlockedInsightIds:[]});
  const allowed=new Set(['reason','blockReason','expectedPrerequisite','status','attempted','current','itemCount']);
  r.events=ev.map((e:Record<string,unknown>)=>({sequenceNumber:Number(e.sequence_number),timestampMs:Number(e.timestamp_ms),eventType:String(e.event_type),targetId:e.target_id as string|null,payload:Array.isArray(e.payload)?e.payload.filter(p=>allowed.has(p.key)):[]}));
  r.evidenceResults=ed.map((e:Record<string,unknown>)=>({evidenceId:String(e.evidence_id),finalStatus:String(e.final_status),swabbingDone:e.swabbing_done===true,fingerprintingDone:e.fingerprinting_done===true,isFlipped:e.is_flipped===true,fingerprintLabStatus:e.fingerprint_lab_status as string|null,tentNumber:e.tent_number as number|null,tentLetter:e.tent_letter as string|null}));
  r.relationships=re.map((e:Record<string,unknown>)=>({relationshipId:String(e.relationship_id),state:String(e.state),wasEverSelected:e.was_ever_selected===true}));r.procedureViolations=notes.map((e:Record<string,unknown>)=>({eventType:String(e.event_type),targetId:e.target_id as string|null,timestampMs:Number(e.timestamp_ms)}));r.trainingCompletion=r.events.some(e=>e.eventType==='InvestigationCompleted')?'Completed':'Not recorded';historical.push(r);
 }
}
const fixtureGlobal=globalThis as unknown as {__vicsiDetails:ResultDetail[];__vicsiProfile:Record<string,string>};
const css=await postcss([tailwind({base:process.cwd()})]).process(await readFile('src/app/globals.css','utf8'),{from:'src/app/globals.css'});
async function save(name:string,role:'student'|'instructor',body:React.ReactNode,query=new URLSearchParams()) {
 const base=role==='student'?'/results':'/class-results';
 const html=renderToStaticMarkup(<PathnameContext.Provider value={base}><SearchParamsContext.Provider value={query}><AppShell role={role} name="Sample learner">{body}</AppShell></SearchParamsContext.Provider></PathnameContext.Provider>);
 await writeFile(`${out}/${name}.html`,`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ViCSI ${name} validation fixture</title><style>${css.css}</style></head><body>${html}</body></html>`);
}
fixtureGlobal.__vicsiDetails=[current];fixtureGlobal.__vicsiProfile={role:'student',fullName:'Sample learner',section:'Section A'};
for(const view of ['overview','sessions','reasoning','relationships','training'])await save(`student-${view}`,'student',await StudentPage({searchParams:Promise.resolve({view})}),new URLSearchParams({view}));
await save('student-record','student',<SessionRecord result={current}/>);
fixtureGlobal.__vicsiDetails=[current,...historical];fixtureGlobal.__vicsiProfile={role:'instructor',fullName:'Instructor'};
for(const view of ['overview','students','sessions','reasoning','relationships','training'])await save(`instructor-${view}`,'instructor',await InstructorPage({searchParams:Promise.resolve({view})}),new URLSearchParams({view}));
if(historical.length)await save('historical-record','student',<SessionRecord result={historical[0]}/>);
fixtureGlobal.__vicsiDetails=[];fixtureGlobal.__vicsiProfile={role:'student',fullName:'Sample learner'};
await save('empty','student',await StudentPage({searchParams:Promise.resolve({})}));
await save('loading','student',<LoadingWorkspace/>);
const long=structuredClone(current);long.assessment!.checkpoints[0].response='A recorded interpretation with unusually long supporting text. '.repeat(70);await save('long-text','student',<SessionRecord result={long}/>);
await writeFile(`${out}/data-validation.json`,JSON.stringify({currentSource:'Unity relationship-review/completed-upload-wire.json',currentScore:grade.totalScore,currentComponents:current.assessment!.components,currentReviewResponses:current.assessment!.relationships.filter(r=>!!r.interpretation).length,historicalRecordsRead:historical.length,historicalVersions:[...new Set(historical.map(r=>r.scoringVersion))],readsOnly:true,productionWrites:0},null,2));
console.log(`Rendered actual student/instructor pages: current Unity capture and ${historical.length} anonymized live historical attempts. GET only.`);
