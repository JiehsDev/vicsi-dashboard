import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import {THEME_INIT_SCRIPT,PALETTES} from '../../src/lib/theme.ts';
import {buildShellPreview} from './build-shell-preview.mjs';
let server,browser,socket,base,id=0;const pending=new Map();
const output=path.join(tmpdir(),'vicsi-palette-preview');const pause=ms=>new Promise(r=>setTimeout(r,ms));
function call(method,params={}){return new Promise((resolve,reject)=>{const requestId=++id;pending.set(requestId,{resolve,reject});socket.send(JSON.stringify({id:requestId,method,params}));});}
async function evaluate(expression){const response=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(response.exceptionDetails)throw Error(JSON.stringify(response.exceptionDetails));return response.result.value;}
before(async()=>{
 await mkdir(output,{recursive:true});
 const bundle=await buildShellPreview('Tools/testing/profile-preview.tsx',{'@/app/profile/actions$':path.resolve('Tools/testing/profile-action-preview.ts')});
 const css=await postcss([tailwind({base:process.cwd()})]).process(await readFile('src/app/globals.css','utf8'),{from:'src/app/globals.css'});
 server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/preview.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle);return;}
  if(/^\/brand\/[a-zA-Z0-9_.-]+$/.test(url.pathname)){res.setHeader('Content-Type',url.pathname.endsWith('.svg')?'image/svg+xml':'image/png');res.end(await readFile('public'+url.pathname));return;}
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="/brand/favicon.svg"><script>${THEME_INIT_SCRIPT}</script><style>${css.css}</style></head><body><div id="preview"></div><script src="/preview.js"></script></body></html>`);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;
 const profile=await mkdtemp(path.join(tmpdir(),'vicsi-palette-browser-'));
 browser=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let port;for(let n=0;n<100;n++){try{port=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await pause(100);}}
 const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
 await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});
 socket.addEventListener('message',event=>{const msg=JSON.parse(event.data);if(pending.has(msg.id)){const p=pending.get(msg.id);pending.delete(msg.id);if(msg.error)p.reject(msg.error);else p.resolve(msg.result);}});await call('Page.enable');
});
after(async()=>{socket?.close();browser?.kill();await new Promise(r=>server?.close(r));});
async function visit(role,width,tab='profile'){
 await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<640});
 await call('Page.navigate',{url:`${base}/profile?role=${role}&tab=${tab}&previewPath=/profile`});
 for(let i=0;i<100;i++){if(await evaluate(`!!document.querySelector('.profile-content')`))return;await pause(30);}assert.fail('Profile did not render');
}
async function choose(palette){
 await evaluate(`document.querySelector('.palette-toggle').click()`);await pause(20);
 await evaluate(`document.querySelector('input[name="color-palette"][value="${palette}"]').click()`);await pause(20);
}
const measurements=`(()=>{const rgb=s=>s.match(/[\\d.]+/g).map(Number),lum=c=>c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0),bg=e=>{while(e){const c=rgb(getComputedStyle(e).backgroundColor);if(c.length<4||c[3]>.99)return c;e=e.parentElement;}return [255,255,255]},contrast=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);return {overflow:document.documentElement.scrollWidth>innerWidth+1,clipped:[...document.querySelectorAll('input,button')].filter(e=>e.getBoundingClientRect().width).some(e=>e.getBoundingClientRect().right>innerWidth+1),pairs:[...document.querySelectorAll('.profile-help,.profile-details dt,.profile-details dd,.profile-security-row p,.profile-recovery,.button,.sidebar-link,.header-name,.header-context,.palette-option-copy strong,.palette-option-copy>span')].filter(e=>e.getBoundingClientRect().width).map(e=>({text:e.textContent,ratio:contrast(rgb(getComputedStyle(e).color),bg(e))})),logoContrast:contrast(rgb(getComputedStyle(document.querySelector('.vicsi-logo-art')).backgroundColor),rgb(getComputedStyle(document.querySelector('.app-sidebar')).backgroundColor)),logoMask:getComputedStyle(document.querySelector('.vicsi-logo-art')).maskImage,palette:document.documentElement.dataset.palette,theme:document.documentElement.dataset.theme,icon:document.querySelector('link[rel=icon]').getAttribute('href')}})()`;
for(const role of ['student','instructor','admin'])for(const width of [375,768,1440])test(`${role} at ${width}px: all palettes and both modes remain readable`,async()=>{
 await visit(role,width,role==='student'?'security':'profile');
 for(const palette of PALETTES)for(const theme of ['light','dark']){
  await evaluate(`if(document.documentElement.dataset.theme!=='${theme}')document.querySelector('.theme-toggle').click()`);
  await choose(palette.id);
  let state=await evaluate(measurements);assert.equal(state.palette,palette.id);assert.equal(state.theme,theme);assert.equal(state.overflow,false);assert.equal(state.clipped,false);
  assert.ok(state.logoContrast>=3,`${palette.id} logo contrast ${state.logoContrast}`);assert.match(state.logoMask,/logo-mask.svg/);
  for(const pair of state.pairs)assert.ok(pair.ratio>=4.5,`${palette.id}/${theme}: ${pair.text}: ${pair.ratio}`);
  assert.match(state.icon,new RegExp(`favicon${palette.id==='default'?'':`-${palette.id}`}\\.svg`));
  await evaluate(`document.querySelector('dialog:modal .app-modal-actions button').click()`);await pause(20);
  if(role==='student'&&(width===375||width===1440))await writeFile(path.join(output,`${palette.id}-${theme}-${width}.png`),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
 }
});
test('palette selection persists through reload, uses keyboard radios, and leaves mode unchanged',async()=>{
 await visit('student',375);await choose('green');
 const before=await evaluate(`document.documentElement.dataset.theme`);
 await call('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40});await pause(30);
 // Move from the checked green option to pink using native radio keyboard behavior.
 if(await evaluate(`document.documentElement.dataset.palette`)!=='pink'){
  await evaluate(`document.querySelector('input[value=green]').focus()`);await call('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40});await pause(30);
 }
 assert.equal(await evaluate(`document.documentElement.dataset.palette`),'pink');
 await call('Page.reload');await pause(300);assert.equal(await evaluate(`document.documentElement.dataset.palette`),'pink');assert.equal(await evaluate(`document.documentElement.dataset.theme`),before);
});
