// Local, synthetic UI previews. No network access or production credentials.
import {mkdir,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {tmpdir} from "node:os";
import assert from "node:assert/strict";
import {renderToStaticMarkup} from "react-dom/server";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import {PathnameContext,SearchParamsContext} from "next/dist/shared/lib/hooks-client-context.shared-runtime.js";
import {AppShell} from "../../src/components/AppShell.tsx";
import HomePage from "../../src/app/results/home/page.tsx";
import GuidePage from "../../src/app/results/guide/page.tsx";
import SessionsPage from "../../src/app/results/page.tsx";
import {SessionRecord} from "../../src/components/SessionRecord.tsx";
import {WorkspaceError} from "../../src/components/WorkspaceError.tsx";
import {THEME_INIT_SCRIPT} from "../../src/lib/theme.ts";
import {currentResult} from "../../src/lib/__tests__/sessionRecord.fixture.ts";
import type {ResultDetail} from "../../src/lib/results.ts";
const out=process.env.VICSI_STUDENT_PREVIEW_DIR??path.join(tmpdir(),"vicsi-student-home-preview");
await mkdir(out,{recursive:true});
const globals=globalThis as unknown as {__vicsiDetails:ResultDetail[];__vicsiProfile:Record<string,string>|null};
globals.__vicsiDetails=[];
for(const page of [HomePage,GuidePage]) {
 globals.__vicsiProfile=null;await assert.rejects(page(),/NEXT_REDIRECT/);
 globals.__vicsiProfile={role:"instructor"};await assert.rejects(page(),/NEXT_REDIRECT/);
}
globals.__vicsiProfile={role:"student",fullName:"Ana Reyes"};
const css=await postcss([tailwind({base:process.cwd()})]).process(await readFile("src/app/globals.css","utf8"),{from:"src/app/globals.css"});
async function save(name:string,pathname:string,body:React.ReactNode) {
 const shell=renderToStaticMarkup(<PathnameContext.Provider value={pathname}><SearchParamsContext.Provider value={new URLSearchParams()}><AppShell role="student" name="Ana Reyes" onSignOut={async()=>{}}>{body}</AppShell></SearchParamsContext.Provider></PathnameContext.Provider>);
 await writeFile(path.join(out,`${name}.html`),`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ViCSI student preview</title><script>${THEME_INIT_SCRIPT}</script><style>${css.css}</style></head><body>${shell}<script src="/theme-preview.js" defer></script></body></html>`);
}
await save("home-empty","/results/home",await HomePage());
await save("sessions-empty","/results",await SessionsPage({searchParams:Promise.resolve({})}));
const result=currentResult(true);result.sessionId="student-attempt";
globals.__vicsiDetails=[result];
await save("home-results","/results/home",await HomePage());
await save("sessions-list","/results",await SessionsPage({searchParams:Promise.resolve({})}));
await save("sessions-filtered","/results",await SessionsPage({searchParams:Promise.resolve({q:"unmatched scenario"})}));
await save("sessions-invalid-date","/results",await SessionsPage({searchParams:Promise.resolve({dateFrom:"not-a-date"})}));
await save("session-detail","/results/student-attempt",<SessionRecord result={result}/>);
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
