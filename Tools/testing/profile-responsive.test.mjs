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
let server,browser,socket,base,id=0;const pending=new Map();
const output=path.join(tmpdir(),'vicsi-profile-preview');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function call(method,params={}){return new Promise((resolve,reject)=>{const requestId=++id;pending.set(requestId,{resolve,reject});socket.send(JSON.stringify({id:requestId,method,params}));});}
async function evaluate(expression){const response=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(response.exceptionDetails)throw Error(response.exceptionDetails.text);return response.result.value;}
before(async()=>{
 await mkdir(output,{recursive:true});
 const bundle=await buildShellPreview('Tools/testing/profile-preview.tsx',{'@/app/profile/actions$':path.resolve('Tools/testing/profile-action-preview.ts')});
 const css=await postcss([tailwind({base:process.cwd()})]).process(await readFile('src/app/globals.css','utf8'),{from:'src/app/globals.css'});
 server=createServer(async(req,res)=>{
  if(req.url==='/preview.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle);return;}
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname.startsWith('/brand/') && /^\/brand\/[a-zA-Z0-9_.-]+$/.test(pathname)){res.setHeader('Content-Type','image/png');res.end(await readFile('public'+pathname));return;}
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.css}</style></head><body><div id="preview"></div><script src="/preview.js"></script></body></html>`);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;
 const profile=await mkdtemp(path.join(tmpdir(),'vicsi-profile-browser-'));
 browser=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let port;for(let n=0;n<100;n++){try{port=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await pause(100);}}
 const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
 await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});
 socket.addEventListener('message',event=>{const msg=JSON.parse(event.data);if(pending.has(msg.id)){const p=pending.get(msg.id);pending.delete(msg.id);if(msg.error)p.reject(msg.error);else p.resolve(msg.result);}});
 await call('Page.enable');
});
after(async()=>{socket?.close();browser?.kill();await new Promise(r=>server?.close(r));});
async function visit(role,width,tab='profile'){
 await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<640});
 await call('Page.navigate',{url:`${base}/profile?role=${role}&tab=${tab}&previewPath=/profile`});
 for(let i=0;i<100;i++){if(await evaluate(`!!document.querySelector('.profile-content')`))return;await pause(30);}assert.fail('Profile did not render');
}
for(const role of ['student','instructor','admin'])for(const width of [375,768,1440])for(const tab of ['profile','security'])test(`${role} ${tab} at ${width}px: layout, role fields and both themes`,async()=>{
 await visit(role,width,tab);
 for(const theme of ['light','dark']){
  await evaluate(`document.documentElement.dataset.theme='${theme}'`);
  const state=await evaluate(`(()=>{const rgb=s=>s.match(/[\\d.]+/g).map(Number),lum=c=>c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0),bg=e=>{while(e){const c=rgb(getComputedStyle(e).backgroundColor);if(c.length<4||c[3]>.99)return c;e=e.parentElement;}return [255,255,255]};return {overflow:document.documentElement.scrollWidth>innerWidth+1,clipped:[...document.querySelectorAll('main input,main button')].some(e=>e.getBoundingClientRect().right>innerWidth+1),text:document.querySelector('main').innerText,active:document.querySelector('.profile-nav [aria-current=page]').textContent,ratios:[...document.querySelectorAll('.profile-help,.profile-details dt,.profile-details dd,.profile-security-row p,.profile-recovery')].map(e=>{const a=lum(rgb(getComputedStyle(e).color)),b=lum(bg(e));return(Math.max(a,b)+.05)/(Math.min(a,b)+.05)})}})()`);
  assert.equal(state.overflow,false);assert.equal(state.clipped,false);assert.equal(state.active,tab==='profile'?'Profile':'Security');for(const ratio of state.ratios)assert.ok(ratio>=4.5,`contrast ${ratio}`);
  if(tab==='profile')assert.match(state.text,role==='student'?/Student ID/:/Sign-in email/);
  if(tab==='security')assert.equal(state.text.includes('Legacy four-digit PIN'),role==='student');
  if(role==='student'&&(width===375||width===1440))await writeFile(path.join(output,`${tab}-${theme}-${width}.png`),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
 }
});
test('security dialogs trap focus, cancel safely, validate, mask secrets and clear them after saving',async()=>{
 await visit('student',375,'security');
 await evaluate(`document.querySelector('.profile-security-row button').click()`);await pause(50);
 assert.equal(await evaluate(`document.querySelector('dialog:modal').contains(document.activeElement)`),true);
 assert.equal(await evaluate(`document.querySelector('input[name=currentPassword]').type`),'password');
 await evaluate(`document.querySelector('.profile-secret button').click()`);assert.equal(await evaluate(`document.querySelector('input[name=currentPassword]').type`),'text');
 await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await pause(30);assert.equal(await evaluate(`!!document.querySelector('dialog:modal')`),false);
 assert.equal(await evaluate(`document.documentElement.dataset.profileSaved`),undefined);
 await evaluate(`document.querySelector('.profile-security-row button').click()`);await pause(30);
 await evaluate(`(()=>{const f=document.querySelector('#profile-security-form');f.elements.currentPassword.value='wrong';f.elements.newPassword.value='My new passphrase is long';f.elements.confirmPassword.value='My new passphrase is long';f.requestSubmit();})()`);await pause(220);
 assert.match(await evaluate(`document.querySelector('[role=alert]').textContent`),/could not be verified/);
 await evaluate(`(()=>{const f=document.querySelector('#profile-security-form');f.elements.currentPassword.value='correct';f.elements.newPassword.value='My new passphrase is long';f.elements.confirmPassword.value='My new passphrase is long';f.requestSubmit();})()`);await pause(30);
 assert.equal(await evaluate(`document.querySelector('dialog:modal button[type=submit]').disabled`),true);await pause(220);
 assert.equal(await evaluate(`document.documentElement.dataset.profileSaved`),'password');assert.equal(await evaluate(`document.querySelectorAll('dialog:modal input[type=password]').length`),0);assert.match(await evaluate(`document.querySelector('[role=status]').textContent`),/saved/);
});
test('name change stays in place and provides accessible save feedback',async()=>{
 await visit('student',1440);
 await evaluate(`(()=>{const f=document.querySelector('.profile-name-form');f.elements.fullName.value='Updated learner';f.requestSubmit();})()`);await pause(220);
 assert.equal(await evaluate(`document.documentElement.dataset.profileSaved`),'name');assert.match(await evaluate(`document.querySelector('[role=status]').textContent`),/name has been updated/);assert.equal(await evaluate(`location.pathname`),'/profile');
});
