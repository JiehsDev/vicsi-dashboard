// Actual page components, local Unity capture, and isolated synthetic history only.
// No Supabase client, network read, environment credential or production data access.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {renderToStaticMarkup} from 'react-dom/server';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import {PathnameContext,SearchParamsContext} from 'next/dist/shared/lib/hooks-client-context.shared-runtime.js';
import {AppShell} from '../../src/components/AppShell.tsx';
import {SessionRecord} from '../../src/components/SessionRecord.tsx';
import {LoadingWorkspace} from '../../src/components/AnalyticsUI.tsx';
import StudentPage from '../../src/app/results/page.tsx';
import InstructorPage from '../../src/app/(dashboard)/class-results/page.tsx';
import {resultFor,rules} from '../../src/lib/__tests__/assessmentPresentation.fixture.ts';
import {mergeAssessmentEvents} from '../../src/lib/scoring/assessmentEventEnvelope.ts';
import {scoreDeductionEvents} from '../../src/lib/scoring/deductionAssessmentScorer.ts';
import type {ResultDetail} from '../../src/lib/results.ts';
import type {ScoringSessionEvent} from '../../src/lib/scoring/types.ts';
const project=process.env.VICSI_UNITY_PROJECT;if(!project)throw new Error('Set VICSI_UNITY_PROJECT to the local Unity workspace.');
const out='docs/evidence/session-simplification/browser';await mkdir(out,{recursive:true});
const wire=JSON.parse(await readFile(path.join(project,'docs/evidence/session-simplification/current-unity-upload.json'),'utf8'));
const events=mergeAssessmentEvents(wire).orderedEvents as ScoringSessionEvent[];
// Composite local preview: case capture plus the isolated Unity upload-filter fixture.
// These files do not represent a single physical-headset playthrough.
const procedures=JSON.parse(await readFile(path.join(project,'docs/evidence/dashboard-workflow-refresh-2026-10-20/procedure-events-wire.json'),'utf8'));
const nextSequence=Math.max(...events.map(e=>e.sequenceNumber))+1;
events.push(...(procedures.orderedEvents as ScoringSessionEvent[]).map((e,i)=>({...e,sequenceNumber:nextSequence+i})));
const recorder=JSON.parse(await readFile(path.join(project,'docs/evidence/recorder-documentation-2026-10-21/current-unity-upload.json'),'utf8'));
const recorderStart=Math.max(...events.map(e=>e.sequenceNumber))+1;
events.push(...(recorder.orderedEvents as ScoringSessionEvent[]).filter(e=>e.eventType==='ReportLinesSelected').map((e,i)=>({...e,sequenceNumber:recorderStart+i})));
const grade=scoreDeductionEvents(events,{sessionId:wire.sessionId,scenarioId:wire.scenarioId,selectedConclusionId:wire.selectedConclusionId,resolvedEndingId:wire.resolvedEndingId},wire.completedAtUtc,rules);
if(grade.status!=='complete')throw new Error(grade.reviewReasons.join('; '));
const current=resultFor();Object.assign(current,{sessionId:wire.sessionId,scenarioVersion:wire.scenarioVersion,scoringVersion:wire.scoringRulesVersion,groundTruthVersion:wire.groundTruthVersion,
 startedAtUtc:wire.startedAtUtc,completedAtUtc:wire.completedAtUtc,durationSeconds:wire.durationSeconds,selectedConclusionId:wire.selectedConclusionId,resolvedEndingId:wire.resolvedEndingId,
 verifiedScore:grade.overallScore,categories:grade.categories,assessmentComponents:grade.categories,events});
const historical={...resultFor(),sessionId:'historical-record',scoringVersion:'1.5.0',verifiedScore:.72,assessment:undefined,assessmentComponents:undefined};
const state=globalThis as unknown as {__vicsiDetails:ResultDetail[];__vicsiProfile:Record<string,string>};
const css=await postcss([tailwind({base:process.cwd()})]).process(await readFile('src/app/globals.css','utf8'),{from:'src/app/globals.css'});
async function save(name:string,role:'student'|'instructor',body:React.ReactNode) {
 const html=renderToStaticMarkup(<PathnameContext.Provider value={role==='student'?'/results':'/class-results'}><SearchParamsContext.Provider value={new URLSearchParams()}><AppShell role={role} name={role==='student'?'Sample learner':'Professor'}>{body}</AppShell></SearchParamsContext.Provider></PathnameContext.Provider>);
 await writeFile(`${out}/${name}.html`,`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ViCSI ${name}</title><style>${css.css}</style></head><body>${html}</body></html>`);
}
state.__vicsiDetails=[current,historical];state.__vicsiProfile={role:'student',fullName:'Sample learner'};
await save('student-list','student',await StudentPage({searchParams:Promise.resolve({})}));
await save('student-detail','student',<SessionRecord result={current}/>);
await save('historical','student',<SessionRecord result={historical}/>);
state.__vicsiProfile={role:'instructor',fullName:'Professor'};
await save('instructor-list','instructor',await InstructorPage({searchParams:Promise.resolve({})}));
await save('instructor-detail','instructor',<SessionRecord result={current} instructor studentName="Sample learner" className="Forensic investigation · Section A"/>);
state.__vicsiDetails=[];state.__vicsiProfile={role:'student',fullName:'Sample learner'};
await save('empty','student',await StudentPage({searchParams:Promise.resolve({})}));
await save('loading','student',<LoadingWorkspace/>);
await writeFile(`${out}/source.json`,JSON.stringify({source:'current-unity-upload.json',procedureSource:'procedure-events-wire.json (isolated Unity filter fixture)',score:grade.totalScore,productionReads:0,productionWrites:0},null,2));
console.log('Rendered student and instructor list/detail, historical, empty and loading states from local fixtures.');
