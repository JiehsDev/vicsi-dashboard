import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {readFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import {buildShellPreview} from './build-shell-preview.mjs';
let server,browser,socket,base,id=0,revision='1'.repeat(64),status=200,requests=0;const pending=new Map();const pause=ms=>new Promise(r=>setTimeout(r,ms));
function call(method,params={}){return new Promise((resolve,reject)=>{const requestId=++id;pending.set(requestId,{resolve,reject});socket.send(JSON.stringify({id:requestId,method,params}));});}
async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
before(async()=>{
 const bundle=await buildShellPreview('Tools/testing/cache-preview.tsx',{'next/navigation$':path.resolve('Tools/testing/cache-router-preview.tsx')});
 const css=await postcss([tailwind({base:process.cwd()})]).process(await readFile('src/app/globals.css','utf8'),{from:'src/app/globals.css'});
 server=createServer((req,res)=>{if(req.url==='/preview.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle);return;}if(req.url==='/api/dashboard/revision'){requests++;res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({scope:'a'.repeat(64),revision}));return;}res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.css}</style></head><body><div id="preview"></div><script src="/preview.js"></script></body></html>`);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;
 const profile=await mkdtemp(path.join(tmpdir(),'vicsi-cache-browser-'));browser=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let port;for(let i=0;i<100;i++){try{port=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await pause(100);}}
 const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});socket.addEventListener('message',event=>{const msg=JSON.parse(event.data);if(pending.has(msg.id)){const p=pending.get(msg.id);pending.delete(msg.id);if(msg.error)p.reject(msg.error);else p.resolve(msg.result);}});await call('Page.enable');
});
after(async()=>{socket?.close();browser?.kill();await new Promise(r=>server?.close(r));});
async function visit(){revision='1'.repeat(64);status=200;requests=0;await call('Emulation.setDeviceMetricsOverride',{width:375,height:800,deviceScaleFactor:1,mobile:true});await call('Page.navigate',{url:base+'/results'});for(let i=0;i<100;i++){if(requests)break;await pause(30);}await pause(80);}
test('stable fingerprints keep the existing view and do not trigger refreshes; changed data refreshes without blanking',async()=>{
 await visit();await evaluate(`window.dispatchEvent(new Event('focus'))`);await pause(80);assert.equal(await evaluate(`document.documentElement.dataset.refreshCalls`),undefined);
 revision='2'.repeat(64);await evaluate(`window.dispatchEvent(new Event('focus'))`);await pause(80);assert.equal(await evaluate(`document.documentElement.dataset.refreshCalls`),'1');assert.match(await evaluate(`document.querySelector('#cached-record').textContent`),/100%/);assert.match(await evaluate(`document.querySelector('.dashboard-sync-status').textContent`),/Updating/);
 await evaluate(`window.finishRefresh()`);await pause(80);await evaluate(`window.dispatchEvent(new Event('focus'))`);await pause(80);assert.equal(await evaluate(`document.documentElement.dataset.refreshCalls`),'1');assert.equal(await evaluate(`!!document.querySelector('.dashboard-sync-status')`),false);
});
test('updates wait until editing and dialogs finish, then apply the still-dirty version',async()=>{
 await visit();await evaluate(`document.querySelector('#editing-note').focus()`);revision='2'.repeat(64);await evaluate(`window.dispatchEvent(new Event('focus'))`);await pause(80);assert.equal(await evaluate(`document.documentElement.dataset.refreshCalls`),undefined);
 await evaluate(`document.querySelector('#editing-note').blur();document.querySelector('#editing-dialog').showModal();window.dispatchEvent(new Event('focus'))`);await pause(80);assert.equal(await evaluate(`document.documentElement.dataset.refreshCalls`),undefined);
 await evaluate(`document.querySelector('#editing-dialog').close();document.querySelector('#editing-note').blur();window.dispatchEvent(new Event('focus'))`);await pause(80);assert.equal(await evaluate(`document.documentElement.dataset.refreshCalls`),'1');assert.equal(await evaluate(`document.querySelector('#editing-note').value`),'Unsaved note');await evaluate(`window.finishRefresh()`);await pause(60);
});
test('failed change checks keep records visible, explain staleness, and recover on Retry',async()=>{
 await visit();status=503;await evaluate(`window.dispatchEvent(new Event('focus'))`);await pause(80);assert.match(await evaluate(`document.querySelector('.dashboard-sync-status').textContent`),/Showing last loaded data/);assert.match(await evaluate(`document.querySelector('#cached-record').textContent`),/100%/);assert.equal(await evaluate(`document.documentElement.scrollWidth>innerWidth+1`),false);
 status=200;await evaluate(`document.querySelector('.dashboard-sync-status button').click()`);await pause(80);assert.equal(await evaluate(`!!document.querySelector('.dashboard-sync-status')`),false);
});
test('hidden tabs stop polling; returning to the tab checks immediately',async()=>{
 await visit();await evaluate(`Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))`);const before=requests;await pause(5200);assert.equal(requests,before);
 await evaluate(`Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'))`);await pause(80);assert.ok(requests>before);
});
