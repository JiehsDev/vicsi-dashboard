import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const checks=[
 {label:'Synthetic demo session scoring, documentation and deterministic identities',args:['--import','./Tools/testing/register-tsx.mjs','--test','src/lib/__tests__/dashboardDemoSeed.test.ts']},
 {label:'Self-service profile ownership, credentials and session actions',args:['--import','./Tools/testing/register-tsx.mjs','--test','src/lib/__tests__/profileManagement.test.ts']},
 {label:'Resend invitation payload and transport outcomes',args:['--import','./Tools/testing/register-tsx.mjs','--test','src/lib/__tests__/invitationEmail.test.ts']},
 {label:'Resend signed callback verification and retries',env:{VICSI_EMAIL_WEBHOOK_TESTS:'1'},args:['--import','./Tools/testing/register-tsx.mjs','--test','src/lib/__tests__/invitationEmailWebhook.test.ts']},
 {label:'One-use account setup, encryption and Auth rollback safety',args:['--import','./Tools/testing/register-tsx.mjs','--test','src/lib/__tests__/accountSetup.test.ts']},
 {label:'Administrator access guards and scoped actions',env:{VICSI_ADMIN_GUARD_TESTS:'1'},args:['--import','./Tools/testing/register-tsx.mjs','--test','src/lib/__tests__/adminAccess.test.ts']},
 {label:'Administrator activity presentation and filters',args:['--import','./Tools/testing/register-tsx.mjs','--test','src/lib/__tests__/adminPresentation.test.ts']},
 {label:'Class invitation destinations and feedback',args:['--import','./Tools/testing/register-tsx.mjs','--test','src/lib/__tests__/classInvites.test.ts']},
 {label:'Class edit modal action validation and navigation',env:{VICSI_CLASS_ACTION_TESTS:'1'},args:['--import','./Tools/testing/register-tsx.mjs','--test','src/lib/__tests__/classManagement.test.ts']},
 {label:'Instructor sidebar class links and role boundaries',args:['--import','./Tools/testing/register-tsx.mjs','--test','src/lib/__tests__/sidebarClasses.test.tsx']},
 {label:'Class overview roster and session navigation',args:['--import','./Tools/testing/register-tsx.mjs','--test','src/lib/__tests__/classOverview.test.tsx']},
 {label:'Class student/session routes and access checks',env:{VICSI_DASHBOARD_FIXTURES:'1'},args:['--import','./Tools/testing/register-tsx.mjs','--test','src/lib/__tests__/classOverviewRoutes.test.tsx']},
 {label:'Instructor review queue and versioned performance overview',args:['--import','./Tools/testing/register-tsx.mjs','--test','src/lib/__tests__/instructorOverview.test.tsx']},
 {label:'Student home guidance, status and review links',args:['--import','./Tools/testing/register-tsx.mjs','--test','src/lib/__tests__/studentHome.test.tsx']},
 {label:'TypeScript validation',args:[require.resolve('typescript/bin/tsc'),'--noEmit','--incremental','false']},
 {label:'Dashboard session expiry and browser cookie policy',args:['--import','./Tools/testing/register-tsx.mjs','--test','src/lib/__tests__/dashboardSession.test.ts']},
 {label:'Current session records, upload API and student/instructor routes',args:['Tools/testing/run-session-tests.mjs']},
 {label:'Legacy presentation and scoring compatibility',args:['--import','./Tools/testing/register-tsx.mjs','--test',
  'src/lib/__tests__/assessmentPresentation.test.tsx','src/lib/__tests__/dashboardAnalytics.test.tsx',
  'src/lib/__tests__/currentGameDashboard.test.ts','src/lib/__tests__/evidenceDisplay.test.tsx','src/lib/__tests__/questionDisplay.test.tsx']},
];
for(const check of checks){
 console.log(`\n${check.label}`);
 const result=spawnSync(process.execPath,check.args,{stdio:'inherit',env:{...process.env,...check.env},windowsHide:true});
 if(result.error)console.error(result.error.message);
 if(result.status!==0)process.exit(result.status??1);
}
