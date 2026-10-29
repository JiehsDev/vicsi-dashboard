import {spawnSync} from 'node:child_process';
const browser=process.argv.includes('--browser');
const commands=browser?[
  ['--import','./Tools/testing/register-tsx.mjs','Tools/testing/render-session-fixtures.tsx'],
  ['--test','Tools/testing/session-responsive.test.mjs'],
]:[['--import','./Tools/testing/register-tsx.mjs','--test','src/lib/__tests__/sessionRecord.test.tsx','src/lib/__tests__/sessionUploadApi.test.tsx','src/lib/__tests__/recorderDocumentation.test.tsx']];
for(const args of commands){
  const env={...process.env,...(browser?{VICSI_DASHBOARD_FIXTURES:'1'}:{VICSI_SESSION_TESTS:'1'})};
  if(browser&&!env.VICSI_UNITY_PROJECT)throw new Error('Set VICSI_UNITY_PROJECT to the local Unity workspace containing current-unity-upload.json.');
  const result=spawnSync(process.execPath,args,{stdio:'inherit',env,windowsHide:true});
  if(result.status!==0)process.exit(result.status??1);
}
