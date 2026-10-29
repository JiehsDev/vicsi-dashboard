import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {buildShellPreview} from './build-shell-preview.mjs';
let server,browser,socket,base,id=0;const pending=new Map();
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function call(method,params={}){return new Promise((resolve,reject)=>{const requestId=++id;pending.set(requestId,{resolve,reject});socket.send(JSON.stringify({id:requestId,method,params}));});}
before(async()=>{
 const bundle=await buildShellPreview();
 const original=await readFile('docs/evidence/dashboard-redesign/student-overview.html','utf8'),style=original.match(/<style>([\s\S]*?)<\/style>/)[0];
 server=createServer(async(req,res)=>{try{if(req.url==='/shell.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle);return;}if(req.url.startsWith('/interactive-shell')){res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">${style}</head><body><div id="preview"></div><script src="/shell.js"></script></body></html>`);return;}const name=new URL(req.url,'http://localhost').pathname.slice(1).replace(/[^a-z-]/g,'');res.setHeader('Content-Type','text/html; charset=utf-8');res.end(await readFile(`docs/evidence/dashboard-redesign/${name}.html`));}catch{res.statusCode=404;res.end('Fixture unavailable');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;
 const profile=await mkdtemp(path.join(tmpdir(),'vicsi-redesign-browser-'));
 browser=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let port;for(let n=0;n<100;n++){try{port=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await pause(100);}}
 assert.ok(port,'Edge remote debugging started');const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
 await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});
 socket.addEventListener('message',event=>{const msg=JSON.parse(event.data);if(pending.has(msg.id)){const p=pending.get(msg.id);pending.delete(msg.id);if(msg.error)p.reject(msg.error);else p.resolve(msg.result);}});await call('Page.enable');
});
for(const width of [375,1366])test(`real AppShell toggles navigation and submits sign out at ${width}px`,async()=>{
 await call('Emulation.setDeviceMetricsOverride',{width,height:940,deviceScaleFactor:1,mobile:width<640});await call('Page.navigate',{url:`${base}/interactive-shell?view=relationships`});
 for(let n=0;n<100;n++){const ready=await call('Runtime.evaluate',{expression:`!!document.querySelector('.collapse-button')`});if(ready.result.value)break;await pause(20);}
 const sidebarWidth=async()=>{const result=await call('Runtime.evaluate',{expression:`Math.round(document.querySelector('.app-sidebar').getBoundingClientRect().width)`});return result.result.value;};
 const before=await sidebarWidth();await call('Runtime.evaluate',{expression:`document.querySelector('.collapse-button').click()`});await pause(50);const after=await sidebarWidth();assert.notEqual(before,after);assert.equal(before,width<640?74:232);assert.equal(after,width<640?210:74);
 const selected=await call('Runtime.evaluate',{expression:`document.querySelector('a[aria-current=page]').getAttribute('aria-label')`});assert.equal(selected.result.value,'Evidence Relationships');
 await call('Runtime.evaluate',{expression:`document.querySelector('.header-account form').requestSubmit()`});await pause(100);const signout=await call('Runtime.evaluate',{expression:`document.body.dataset.signedOut`});assert.equal(signout.result.value,'true');
});
test('native filter disclosure opens and contains shared export-compatible controls',async()=>{
 await call('Page.navigate',{url:`${base}/instructor-sessions`});for(let n=0;n<100;n++){const ready=await call('Runtime.evaluate',{expression:`!!document.querySelector('.global-filters')`});if(ready.result.value)break;await pause(20);}
 const result=await call('Runtime.evaluate',{returnByValue:true,expression:`document.querySelector('.global-filters summary').click();JSON.stringify({open:document.querySelector('.global-filters').open,names:[...document.querySelectorAll('.global-filters [name]')].map(e=>e.name)})`});const values=JSON.parse(result.result.value);assert.equal(values.open,true);for(const name of ['q','classId','scenarioId','scoringVersion','status','dateFrom','dateTo','includeTests'])assert.ok(values.names.includes(name));
});
test('session rows provide native links across the row without hiding student drilldowns',async()=>{
 await call('Emulation.setDeviceMetricsOverride',{width:1366,height:940,deviceScaleFactor:1,mobile:false});await call('Page.navigate',{url:`${base}/instructor-sessions`});
 for(let n=0;n<100;n++){const ready=await call('Runtime.evaluate',{expression:`!!document.querySelector('.product-table .row-link')`});if(ready.result.value)break;await pause(20);}
 const result=await call('Runtime.evaluate',{expression:`(()=>{const cell=document.querySelector('.product-table tbody .numeric');cell.scrollIntoView({block:'center'});const b=cell.getBoundingClientRect();return document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)?.closest('a')?.classList.contains('row-link')})()`});assert.equal(result.result.value,true);
});
after(async()=>{socket?.close();browser?.kill();await new Promise(r=>server?.close(r));});
const pages=['student-overview','student-sessions','student-reasoning','student-relationships','student-training','student-record','instructor-overview','instructor-students','instructor-sessions','instructor-reasoning','instructor-relationships','instructor-training','historical-record','empty','loading','long-text'];
for(const page of pages)for(const width of [375,768,1366])test(`${page} at ${width}px: readable content and bounded tables`,async()=>{
 await call('Emulation.setDeviceMetricsOverride',{width,height:940,deviceScaleFactor:1,mobile:width<640});
 await call('Page.navigate',{url:`${base}/${page}`});
 for(let n=0;n<100;n++){const ready=await call('Runtime.evaluate',{expression:`document.readyState==='complete'&&document.querySelector('.app-main')!==null`});if(ready.result.value)break;await pause(20);}
 const state=await call('Runtime.evaluate',{returnByValue:true,expression:`JSON.stringify({viewport:innerWidth,scroll:document.documentElement.scrollWidth,main:!!document.querySelector('main#main-content'),nav:document.querySelectorAll('.sidebar-link').length,overflow:[...document.querySelectorAll('.selected-answer,.reasoning-timeline p,.interpretation-list p')].filter(e=>e.scrollWidth>e.clientWidth+1).length,tables:[...document.querySelectorAll('.product-table')].map(e=>!!e.closest('.table-scroll')),brokenText:/NaN|undefined/.test(document.body.innerText),hiddenScore:document.querySelector('.score-primary')?.getBoundingClientRect().width,filters:!!document.querySelector('form.filter-bar input[name=view]'),loading:!!document.querySelector('[role=status]')})`});
 const values=JSON.parse(state.result.value);assert.ok(values.main);assert.ok(values.nav>=5);assert.ok(values.scroll<=values.viewport+1,JSON.stringify(values));assert.equal(values.overflow,0);assert.ok(values.tables.every(Boolean));assert.equal(values.brokenText,false);
 if(page==='loading')assert.ok(values.loading);
 if(['student-overview','instructor-overview','student-training','long-text'].includes(page)&&width!==768){const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(`docs/evidence/dashboard-redesign/${page}-${width}.png`,Buffer.from(shot.data,'base64'));}
});
