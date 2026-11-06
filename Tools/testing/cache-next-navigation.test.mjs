// Explicit opt-in read-only integration against the configured backend's demo student.
// Uses temporary browser cookies; never changes profiles, grades or enrollments.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {createServer} from 'node:net';
import {readFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServerClient} from '@supabase/ssr';
import {encodeDashboardSession} from '../../src/lib/dashboardSession.ts';
const require=createRequire(import.meta.url),pause=ms=>new Promise(r=>setTimeout(r,ms));
test('production Next navigation reuses a cached page and signout removes access to cached records',{skip:process.env.VICSI_LIVE_CACHE_TESTS!=='1',timeout:120000},async()=>{
 process.loadEnvFile('.env.local');
 const account=JSON.parse(await readFile('test-output/dashboard-demo-credentials.json','utf8'))[0];
 const cookies=new Map();
 const auth=createServerClient(process.env.SUPABASE_URL,process.env.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false},cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:values=>values.forEach(c=>cookies.set(c.name,c.value))}});
 let app,browser,socket;let id=0;const pending=new Map(),requests=[];
 const call=(method,params={})=>new Promise((resolve,reject)=>{const requestId=++id;pending.set(requestId,{resolve,reject});socket.send(JSON.stringify({id:requestId,method,params}));});
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error('Browser evaluation failed');return r.result.value;};
 const waitHeading=async title=>{for(let i=0;i<300;i++){if(await evaluate(`Array.from(document.querySelectorAll('h1')).some(e=>e.getBoundingClientRect().width&&e.textContent.includes(${JSON.stringify(title)}))`))return;await pause(50);}const details=await evaluate(`({path:location.pathname,headings:[...document.querySelectorAll('h1')].map(e=>e.textContent),login:!!document.querySelector('input[name=identifier]'),alerts:[...document.querySelectorAll('[role=alert]')].map(e=>e.textContent)})`);assert.fail(`View did not open: ${title}; ${JSON.stringify(details)}`);};
 try{
  const login=await auth.auth.signInWithPassword({email:`${account.studentId.toLowerCase()}@students.traceboard.internal`,password:account.password});if(login.error)throw Error('Synthetic student sign-in failed');
  const now=Date.now();cookies.set('vicsi-dashboard-session',encodeDashboardSession({userId:login.data.user.id,startedAt:now,activeAt:now}));
  const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));const base=`http://127.0.0.1:${port}`;
  app=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','--port',String(port),'--hostname','127.0.0.1'],{windowsHide:true,stdio:'ignore'});
  for(let i=0;i<100;i++){try{if((await fetch(base+'/brand/favicon.svg')).ok)break;}catch{}await pause(100);}
  const profile=await mkdtemp(path.join(tmpdir(),'vicsi-cache-next-browser-'));browser=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
  let debugPort;for(let i=0;i<100;i++){try{debugPort=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await pause(100);}}
  const targets=await(await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});
  socket.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.method==='Network.requestWillBeSent')requests.push(message.params.request);if(pending.has(message.id)){const p=pending.get(message.id);pending.delete(message.id);if(message.error)p.reject(message.error);else p.resolve(message.result);}});
  await call('Page.enable');await call('Network.enable');
  for(const [name,value] of cookies)await call('Network.setCookie',{name,value,url:base,path:'/',httpOnly:true,sameSite:'Lax'});
  await call('Page.navigate',{url:base+'/results'});await waitHeading('My Sessions');
  const revision=await evaluate(`fetch('/api/dashboard/revision',{cache:'no-store'}).then(async r=>({status:r.status,cache:r.headers.get('Cache-Control'),body:await r.json()}))`);assert.equal(revision.status,200);assert.equal(revision.cache,'private, no-store');assert.deepEqual(Object.keys(revision.body).sort(),['revision','scope']);
  await evaluate(`document.querySelector('.sidebar-link[href="/results/classes"]').click()`);await waitHeading('My Classes');await pause(150);
  const offset=requests.length;
  await evaluate(`document.querySelector('.sidebar-link[href="/results"]').click()`);await waitHeading('My Sessions');await pause(150);
  const returnRequests=requests.slice(offset).filter(r=>{const url=new URL(r.url);return url.pathname==='/results'&&url.searchParams.has('_rsc')&&!Object.entries(r.headers).some(([key,value])=>key.toLowerCase()==='next-router-prefetch'&&String(value)==='1');});
  assert.equal(returnRequests.length,0,'Returning to a recent page must reuse the browser page cache');
  const waitSignIn=async()=>{for(let i=0;i<300;i++){if(await evaluate(`location.pathname==='/login'&&!!document.querySelector('input[name=identifier]')`))return;await pause(50);}assert.fail('Sign-in form did not open');};
  await evaluate(`document.querySelector('.signout-button').click()`);await pause(50);await evaluate(`document.querySelector('dialog:modal .button-primary').click()`);await waitSignIn();
  const signedOut=await evaluate(`fetch('/api/dashboard/revision',{cache:'no-store'}).then(r=>r.status)`);assert.equal(signedOut,401);
  await evaluate(`history.back()`);await pause(300);await waitSignIn();assert.equal(await evaluate(`!!document.querySelector('.app-sidebar')`),false);
 }finally{socket?.close();browser?.kill();app?.kill();await auth.auth.signOut({scope:'local'}).catch(()=>{});}
});
