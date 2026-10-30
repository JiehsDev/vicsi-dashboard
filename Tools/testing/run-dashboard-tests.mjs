import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const checks=[
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
 const result=spawnSync(process.execPath,check.args,{stdio:'inherit',env:process.env,windowsHide:true});
 if(result.error)console.error(result.error.message);
 if(result.status!==0)process.exit(result.status??1);
}
