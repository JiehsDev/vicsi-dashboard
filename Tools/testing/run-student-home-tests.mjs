import {spawnSync} from 'node:child_process';
const browser=process.argv.includes('--browser');
const commands=browser?[
 ['--import','./Tools/testing/register-tsx.mjs','Tools/testing/render-student-home-fixtures.tsx'],
 ['--test','Tools/testing/student-home-responsive.test.mjs'],
]:[['--import','./Tools/testing/register-tsx.mjs','--test','src/lib/__tests__/studentHome.test.tsx']];
for(const args of commands){
 const result=spawnSync(process.execPath,args,{stdio:'inherit',windowsHide:true,env:{...process.env,...(browser?{VICSI_DASHBOARD_FIXTURES:'1'}:{})}});
 if(result.error)console.error(result.error.message);
 if(result.status!==0)process.exit(result.status??1);
}
