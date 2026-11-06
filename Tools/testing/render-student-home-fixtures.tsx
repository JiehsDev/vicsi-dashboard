// Local, synthetic UI previews. No network access or production credentials.
import {mkdir,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {tmpdir} from "node:os";
import assert from "node:assert/strict";
import {renderToStaticMarkup} from "react-dom/server";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import {PathnameContext,SearchParamsContext} from "next/dist/shared/lib/hooks-client-context.shared-runtime.js";
import {AppRouterContext} from "next/dist/shared/lib/app-router-context.shared-runtime.js";
import LoginPage from "../../src/app/login/page.tsx";
import SignupPage from "../../src/app/signup/page.tsx";
import MyClassesPage from "../../src/app/results/classes/page.tsx";
import JoinClassPage from "../../src/app/results/classes/join/page.tsx";
import AdminOverviewPage from '../../src/app/admin/page.tsx';
import AdminActivityPage from '../../src/app/admin/activity/page.tsx';
import AdminAccessPage from '../../src/app/admin/access/page.tsx';
import AdminUsersPage from '../../src/app/admin/users/page.tsx';
import AdminUserPage from '../../src/app/admin/users/[id]/page.tsx';
import InstructorInvitationsPage from '../../src/app/admin/invitations/page.tsx';
import {AppShell} from "../../src/components/AppShell.tsx";
import HomePage from "../../src/app/results/home/page.tsx";
import GuidePage from "../../src/app/results/guide/page.tsx";
import SessionsPage from "../../src/app/results/page.tsx";
import InstructorSessionsPage from "../../src/app/(dashboard)/class-results/page.tsx";
import ClassPage from "../../src/app/(dashboard)/classes/[classId]/page.tsx";
import ClassesPage from "../../src/app/(dashboard)/classes/page.tsx";
import EditClassPage from "../../src/app/(dashboard)/classes/[classId]/edit/page.tsx";
import ClassStudentPage from "../../src/app/(dashboard)/classes/[classId]/students/[studentId]/page.tsx";
import ClassSessionPage from "../../src/app/(dashboard)/classes/[classId]/students/[studentId]/sessions/[sessionId]/page.tsx";
import type {ClassDetail} from "../../src/lib/classes.ts";
import {SessionRecord} from "../../src/components/SessionRecord.tsx";
import {WorkspaceError} from "../../src/components/WorkspaceError.tsx";
import {THEME_INIT_SCRIPT} from "../../src/lib/theme.ts";
import {currentResult} from "../../src/lib/__tests__/sessionRecord.fixture.ts";
import type {ResultDetail} from "../../src/lib/results.ts";
const out=process.env.VICSI_STUDENT_PREVIEW_DIR??path.join(tmpdir(),"vicsi-student-home-preview");
await mkdir(out,{recursive:true});
const globals=globalThis as unknown as {__vicsiDetails:ResultDetail[];__vicsiProfile:Record<string,string>|null;__vicsiClasses?:ClassDetail[]};
globals.__vicsiDetails=[];
for(const page of [HomePage,GuidePage]) {
 globals.__vicsiProfile=null;await assert.rejects(page(),/NEXT_REDIRECT/);
 globals.__vicsiProfile={role:"instructor"};await assert.rejects(page(),/NEXT_REDIRECT/);
}
globals.__vicsiProfile={role:"student",fullName:"Ana Reyes"};
const css=await postcss([tailwind({base:process.cwd()})]).process(await readFile("src/app/globals.css","utf8"),{from:"src/app/globals.css"});
async function save(name:string,pathname:string,body:React.ReactNode,role:"student"|"instructor"|"admin"="student") {
 const router={back(){},forward(){},refresh(){},hmrRefresh(){},push(){},replace(){},prefetch:async()=>{}};
 const shell=renderToStaticMarkup(<AppRouterContext.Provider value={router}><PathnameContext.Provider value={pathname}><SearchParamsContext.Provider value={new URLSearchParams()}><AppShell role={role} name={role==='admin'?'ViCSI Administrator':role==="instructor"?"Dev Instructor (Test)":"Ana Reyes"} classes={role==="instructor"?globals.__vicsiClasses:undefined} onSignOut={async()=>{}}>{body}</AppShell></SearchParamsContext.Provider></PathnameContext.Provider></AppRouterContext.Provider>);
 await writeFile(path.join(out,`${name}.html`),`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ViCSI student preview</title><script>${THEME_INIT_SCRIPT}</script><style>${css.css}</style></head><body>${shell}<script src="/theme-preview.js" defer></script></body></html>`);
}
await writeFile(path.join(out,"instructor-sidebar.html"),`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.css}</style></head><body><div id="instructor-shell-root"></div><script src="/modal-preview.js" defer></script></body></html>`);
await save("home-empty","/results/home",await HomePage());
await save('admin-overview','/admin',await AdminOverviewPage(),'admin');
await save('admin-activity','/admin/activity',await AdminActivityPage({searchParams:Promise.resolve({})}),'admin');
await save('admin-access','/admin/access',await AdminAccessPage({searchParams:Promise.resolve({})}),'admin');
await save('admin-users','/admin/users',await AdminUsersPage({searchParams:Promise.resolve({})}),'admin');
await save('admin-user-detail','/admin/users/33333333-3333-4333-8333-333333333333',await AdminUserPage({params:Promise.resolve({id:'33333333-3333-4333-8333-333333333333'})}),'admin');
await save('admin-invitations','/admin/invitations',await InstructorInvitationsPage({searchParams:Promise.resolve({})}),'admin');
await save('admin-activity-invalid','/admin/activity',await AdminActivityPage({searchParams:Promise.resolve({from:'2026-11-31'})}),'admin');
(globalThis as unknown as {__adminPreviewMode:string}).__adminPreviewMode='empty';
await save('admin-empty','/admin',await AdminOverviewPage(),'admin');
(globalThis as unknown as {__adminPreviewMode:string}).__adminPreviewMode='error';
await save('admin-unavailable','/admin',await AdminOverviewPage(),'admin');
(globalThis as unknown as {__adminPreviewMode:string}).__adminPreviewMode='normal';
await save('admin-access-controls','/admin/access',<div id="admin-access-test-root"/>,'admin');
await save('admin-user-controls','/admin/users',<div id="admin-user-test-root"/>,'admin');
await writeFile(path.join(out,'account-setup-controls.html'),`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.css}</style></head><body><div id="account-setup-test-root"></div></body></html>`);
await save("student-classes","/results/classes",await MyClassesPage({searchParams:Promise.resolve({})}));
await save("class-join","/results/classes/join",await JoinClassPage({searchParams:Promise.resolve({code:"ABCDE23456"})}));
(globalThis as unknown as {__vicsiInviteStatus:string}).__vicsiInviteStatus="invalid";
await save("class-join-invalid","/results/classes/join",await JoinClassPage({searchParams:Promise.resolve({code:"BAD"})}));
(globalThis as unknown as {__vicsiInviteStatus:string}).__vicsiInviteStatus="ready";
await save("sessions-empty","/results",await SessionsPage({searchParams:Promise.resolve({})}));
const result=currentResult(true);result.sessionId="student-attempt";
const roster:ClassDetail={id:"class-a",name:"Forensic investigation",section:"A",academicYear:"2026-2027",semester:"1st",archivedAt:null,createdAt:"2026-11-01",sessionCount:0,averageVerifiedScore:null,
  students:[{studentId:result.studentId,fullName:"Ana Reyes",studentNumber:"2026-001",enrolledAt:"2026-11-04"},
    {studentId:"no-upload",fullName:"Benjamin Santos with a long family name",studentNumber:"2026-002",enrolledAt:"2026-11-04"}]};
(globalThis as unknown as {__vicsiClassDetail:ClassDetail}).__vicsiClassDetail=roster;
(globalThis as unknown as {__vicsiClasses:ClassDetail[]}).__vicsiClasses=[roster,{...roster,id:"class-b",name:"Crime scene documentation and evidence handling",section:"B"},{...roster,id:"archived",name:"Forensic investigation",section:"Previous term",archivedAt:"2026-10-01"}];
await save("classes-directory","/classes",await ClassesPage({searchParams:Promise.resolve({})}),"instructor");
await save("class-editor","/classes/class-a/edit",await EditClassPage({params:Promise.resolve({classId:"class-a"}),searchParams:Promise.resolve({})}),"instructor");
globals.__vicsiDetails=Array.from({length:7},(_,i)=>({...result,sessionId:i===0?"student-attempt":`student-attempt-${i}`}));
await save("class-overview","/classes/class-a",await ClassPage({params:Promise.resolve({classId:"class-a"}),searchParams:Promise.resolve({})}),"instructor");
await save("modal-controls","/classes/class-a",<div id="modal-test-root"/>,"instructor");
await save("manage-class-controls","/classes/class-a",<div id="manage-class-test-root"/>,"instructor");
await save("invite-controls","/classes/class-a",<div id="class-invite-test-root"/>,"instructor");
await save("pagination-controls","/results",<div id="pagination-test-root"/>);
await save("class-student","/classes/class-a",await ClassStudentPage({params:Promise.resolve({classId:"class-a",studentId:result.studentId}),searchParams:Promise.resolve({})}),"instructor");
await save("class-student-empty","/classes/class-a",await ClassStudentPage({params:Promise.resolve({classId:"class-a",studentId:"no-upload"}),searchParams:Promise.resolve({})}),"instructor");
await save("class-session","/classes/class-a",await ClassSessionPage({params:Promise.resolve({classId:"class-a",studentId:result.studentId,sessionId:result.sessionId})}),"instructor");
globals.__vicsiDetails=[result];
await save("home-results","/results/home",await HomePage());
await save("sessions-list","/results",await SessionsPage({searchParams:Promise.resolve({})}));
await save("sessions-filtered","/results",await SessionsPage({searchParams:Promise.resolve({q:"unmatched scenario"})}));
await save("sessions-invalid-date","/results",await SessionsPage({searchParams:Promise.resolve({dateFrom:"not-a-date"})}));
await save("session-detail","/results/student-attempt",<SessionRecord result={result}/>);

globals.__vicsiDetails=Array.from({length:12},(_,i)=>({...result,sessionId:`attempt-${i+1}`}));
for(const page of [1,2,3])await save(`sessions-page-${page===1?"first":page===2?"middle":"last"}`,"/results",await SessionsPage({searchParams:Promise.resolve({page:String(page)})}));
for(const page of [1,3])await save(`instructor-sessions-${page===1?"first":"last"}`,"/class-results",await InstructorSessionsPage({searchParams:Promise.resolve({page:String(page)})}),"instructor");

globals.__vicsiDetails=[result,
 {...result,studentId:"weak",sessionId:"weak",assessmentComponents:{deductionAssessmentComplete:1,deductionTotalScore:33.75,reasoningCheckpointComponent:30,deductionRelationshipComponent:0,finalConclusionComponent:3.75}},
 {...result,studentId:"pending",sessionId:"pending",verificationStatus:"requires_review"},
 {...result,studentId:"incomplete",sessionId:"incomplete",completedAtUtc:null},
 {...result,studentId:"legacy",sessionId:"legacy",scoringVersion:"1.5.0",verifiedScore:.72},
 {...result,studentId:"test",sessionId:"test",isTestSession:true}];
await save("instructor-overview","/class-results",await InstructorSessionsPage({searchParams:Promise.resolve({performanceGroup:JSON.stringify([result.scenarioId,result.scenarioVersion,result.scoringVersion,result.groundTruthVersion])})}),"instructor");
globals.__vicsiDetails=[];
await save("instructor-empty","/class-results",await InstructorSessionsPage({searchParams:Promise.resolve({})}),"instructor");
globals.__vicsiDetails=[{...result,verificationStatus:"requires_review",verifiedScore:null}];
await save("home-review","/results/home",await HomePage());
globals.__vicsiDetails=[{...result,isTestSession:true}];
await save("home-tests","/results/home",await HomePage());
await save("sessions-tests","/results",await SessionsPage({searchParams:Promise.resolve({})}));
globals.__vicsiDetails=[{...result,scoringVersion:"1.5.0",verifiedScore:.72}];
await save("home-historical","/results/home",await HomePage());
globals.__vicsiDetails=[{...result,scenarioDisplayName:"A long investigation scenario name that still needs to remain readable on a small student phone"}];
await save("home-long","/results/home",await HomePage());
await save("guide","/results/guide",await GuidePage());
await save("load-error","/results/home",<WorkspaceError reset={()=>{}}/>);
await writeFile(path.join(out,"source.json"),JSON.stringify({source:"Synthetic currentResult fixture; actual student route components",productionReads:0,productionWrites:0,authorizationChecks:4},null,2));
console.log(`Student Home and guide previews: ${out}`);

for(const [name,page] of [["auth-login",LoginPage],["auth-signup",SignupPage]] as const) {
 const body=renderToStaticMarkup(await page({searchParams:Promise.resolve({})}));
 await writeFile(path.join(out,`${name}.html`),`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ViCSI account preview</title><script>${THEME_INIT_SCRIPT}</script><style>${css.css}</style></head><body>${body}</body></html>`);
}
