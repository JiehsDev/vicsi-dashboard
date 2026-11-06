import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import {buildShellPreview} from './build-shell-preview.mjs';
let server,browser,socket,base,id=0;const pending=new Map();const pause=ms=>new Promise(r=>setTimeout(r,ms));
const output=path.join(tmpdir(),'vicsi-loading-preview');
function call(method,params={}){return new Promise((resolve,reject)=>{const requestId=++id;pending.set(requestId,{resolve,reject});socket.send(JSON.stringify({id:requestId,method,params}));});}
async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
before(async()=>{
 await mkdir(output,{recursive:true});const bundle=await buildShellPreview('Tools/testing/loading-preview.tsx',{'next/link$':path.resolve('Tools/testing/loading-router-preview.tsx')});
 const css=await postcss([tailwind({base:process.cwd()})]).process(await readFile('src/app/globals.css','utf8'),{from:'src/app/globals.css'});
 server=createServer((req,res)=>{if(req.url==='/preview.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle);return;}res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.css}</style></head><body><div id="preview"></div><script src="/preview.js"></script></body></html>`);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;
 const profile=await mkdtemp(path.join(tmpdir(),'vicsi-loading-browser-'));browser=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let port;for(let i=0;i<100;i++){try{port=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await pause(100);}}
 const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
 await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});socket.addEventListener('message',event=>{const msg=JSON.parse(event.data);if(pending.has(msg.id)){const p=pending.get(msg.id);pending.delete(msg.id);if(msg.error)p.reject(msg.error);else p.resolve(msg.result);}});await call('Page.enable');
});
after(async()=>{socket?.close();browser?.kill();await new Promise(r=>server?.close(r));});
async function visit(width=375){await call('Emulation.setDeviceMetricsOverride',{width,height:800,deviceScaleFactor:1,mobile:width<640});await call('Page.navigate',{url:base});for(let i=0;i<100;i++){if(await evaluate(`!!document.querySelector('#loading-signin')`))return;await pause(20);}assert.fail('Loading fixture did not mount');}
test('form feedback lasts for the actual request, blocks repeat clicks, then clears on success and failure',async()=>{
 await visit();await evaluate(`document.querySelector('#loading-signin button').click()`);await pause(80);
 assert.deepEqual(await evaluate(`(()=>{const b=document.querySelector('#loading-signin button');return {disabled:b.disabled,busy:b.getAttribute('aria-busy'),text:b.textContent,count:document.documentElement.dataset.submissions??'0'}})()`),{disabled:true,busy:'true',text:'Signing in…',count:'1'});
 await evaluate(`document.querySelector('#loading-signin button').click()`);assert.equal(await evaluate(`document.documentElement.dataset.submissions??'0'`),'1');
 await evaluate(`window.finishSubmission()`);await pause(80);assert.equal(await evaluate(`document.querySelector('#loading-signin button').disabled`),false);
 await evaluate(`document.querySelector('#loading-signin button').click()`);await pause(60);await evaluate(`window.finishSubmission(false)`);await pause(80);assert.equal(await evaluate(`document.querySelector('#loading-signin button').textContent`),'Sign in');assert.match(await evaluate(`document.body.innerText`),/Save failed/);
});
test('class dialog footer observes its associated form and prevents dismissal while saving',async()=>{
 await visit();const rect=await evaluate(`(()=>{const r=document.querySelector('.manage-class-button').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...rect});await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...rect});await pause(40);
 await evaluate(`document.querySelector('dialog:modal button[type=submit]').click()`);await pause(100);
 assert.equal(await evaluate(`document.querySelector('dialog:modal button[type=submit]').textContent`),'Saving changes…');assert.equal(await evaluate(`document.querySelector('dialog:modal .app-modal-actions button').disabled`),true);
 await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await pause(30);assert.equal(await evaluate(`!!document.querySelector('dialog:modal')`),true);
 await evaluate(`window.finishSubmission()`);await pause(80);assert.equal(await evaluate(`document.querySelector('dialog:modal button[type=submit]').disabled`),false);await evaluate(`document.querySelector('dialog:modal .app-modal-actions button').click()`);await pause(40);assert.equal(await evaluate(`!!document.querySelector('dialog:modal')`),false);
});
test('logout waits for confirmation before showing real submission feedback',async()=>{
 await visit();await evaluate(`document.querySelector('.signout-button').click()`);await pause(40);assert.equal(await evaluate(`document.documentElement.dataset.submissions??'0'`),'0');
 await evaluate(`document.querySelector('dialog:modal .button-primary').click()`);await pause(80);assert.equal(await evaluate(`document.querySelector('.signout-button').textContent`),'Signing out…');assert.equal(await evaluate(`document.querySelector('.signout-button').disabled`),true);await evaluate(`window.finishSubmission()`);await pause(80);assert.equal(await evaluate(`document.querySelector('.signout-button').textContent`),'Sign out');
});
test('navigation feedback appears only while the link is pending and clears when navigation settles',async()=>{
 await visit();assert.equal(await evaluate(`!!document.querySelector('.route-loading')`),false);await evaluate(`document.querySelector('a[href="/destination"]').click()`);await pause(60);assert.match(await evaluate(`document.querySelector('.route-loading').textContent`),/Opening page/);await evaluate(`window.finishNavigation()`);await pause(60);assert.equal(await evaluate(`!!document.querySelector('.route-loading')`),false);
});
test('loading panels and pending buttons fit both viewports, every palette and both modes, with reduced motion support',async()=>{
 for(const width of [375,1440]){await visit(width);for(const palette of ['default','parsu','green','pink','monochrome'])for(const theme of ['light','dark']){
  await evaluate(`document.documentElement.dataset.palette='${palette}';document.documentElement.dataset.theme='${theme}'`);assert.equal(await evaluate(`document.documentElement.scrollWidth>innerWidth+1`),false);
  const ratio=await evaluate(`(()=>{const rgb=s=>s.match(/[\\d.]+/g).map(Number),lum=c=>c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0),style=getComputedStyle(document.querySelector('.loading-status')),a=lum(rgb(style.color)),b=lum(rgb(getComputedStyle(document.body).backgroundColor));return(Math.max(a,b)+.05)/(Math.min(a,b)+.05)})()`);assert.ok(ratio>=4.5,`${palette}/${theme}: ${ratio}`);
  if(palette==='default')await writeFile(path.join(output,`loading-${theme}-${width}.png`),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
 }}await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});assert.equal(await evaluate(`getComputedStyle(document.querySelector('.loading-spinner')).animationName`),'none');
});
