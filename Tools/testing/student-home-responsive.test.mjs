import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {buildShellPreview} from './build-shell-preview.mjs';
const out=process.env.VICSI_STUDENT_PREVIEW_DIR??path.join(tmpdir(),'vicsi-student-home-preview');
let server,browser,socket,base,id=0;const pending=new Map();
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function call(method,params={}){return new Promise((resolve,reject)=>{const requestId=++id;pending.set(requestId,{resolve,reject});socket.send(JSON.stringify({id:requestId,method,params}));});}
before(async()=>{
 const themeBundle=await buildShellPreview('Tools/testing/theme-preview.tsx');
 server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(url.pathname==='/theme-preview.js'){res.setHeader('Content-Type','text/javascript');res.end(themeBundle);return;}const name=url.pathname==='/results/home'?'home-results':url.pathname==='/results/guide'?'guide':url.pathname==='/results'?'sessions-list':url.pathname==='/results/student-attempt'?'session-detail':url.pathname.slice(1).replace(/[^a-z-]/g,'');res.setHeader('Content-Type','text/html; charset=utf-8');res.end(await readFile(path.join(out,`${name}.html`)));}catch{res.statusCode=404;res.end('Fixture unavailable');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;
 const profile=await mkdtemp(path.join(tmpdir(),'vicsi-student-home-browser-'));
 browser=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let port;for(let n=0;n<100;n++){try{port=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await pause(100);}}
 assert.ok(port);const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
 await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});
 socket.addEventListener('message',event=>{const msg=JSON.parse(event.data);if(pending.has(msg.id)){const p=pending.get(msg.id);pending.delete(msg.id);if(msg.error)p.reject(msg.error);else p.resolve(msg.result);}});await call('Page.enable');
});
after(async()=>{socket?.close();browser?.kill();await new Promise(r=>server?.close(r));});
async function visit(page,width=1366){await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<640});await call('Page.navigate',{url:`${base}/${page}`});for(let n=0;n<100;n++){const ready=await call('Runtime.evaluate',{expression:`document.readyState==='complete'&&document.querySelector('.theme-control')?.dataset.themeReady==='true'`});if(ready.result.value)return;await pause(20);}assert.fail('Theme control did not hydrate');}
for(const page of ['home-empty','home-results','home-review','home-tests','home-historical','home-long','guide','sessions-list','session-detail','sessions-empty','sessions-filtered','sessions-tests','sessions-invalid-date','load-error'])for(const width of [375,768,1024,1366,1920,2560])test(`${page} at ${width}px has readable guidance, named navigation and no page overflow`,async()=>{
 await visit(page,width);
 const state=await call('Runtime.evaluate',{expression:`JSON.stringify({width:innerWidth,scroll:document.documentElement.scrollWidth,text:document.body.innerText,nav:[...document.querySelectorAll('nav[aria-label="Student pages"] a')].map(e=>({name:e.getAttribute('aria-label'),visible:e.getBoundingClientRect().width>0,current:e.getAttribute('aria-current')})),h1:document.querySelectorAll('h1').length,primary:document.querySelector('.next-action')?.innerText,links:[...document.querySelectorAll('main a')].map(a=>a.getAttribute('href'))})`});
 const v=JSON.parse(state.result.value);assert.ok(v.scroll<=v.width+1,`${page}: ${v.scroll}/${v.width}`);assert.equal(v.h1,page==='load-error'?0:1);assert.deepEqual(v.nav.map(n=>n.name),['Home','My Sessions','How to Play']);assert.equal(v.nav.filter(n=>n.current==='page').length,1);assert.ok(v.nav.every(n=>n.visible));assert.doesNotMatch(v.text,/NaN|undefined/);
 const geometry=await call('Runtime.evaluate',{expression:`JSON.stringify((()=>{const main=document.querySelector('.app-main'),box=main.getBoundingClientRect(),css=getComputedStyle(main),root=main.querySelector('.student-home,.student-guide,.academic-record'),navigation=document.querySelector('.app-sidebar').getBoundingClientRect();return {viewport:document.documentElement.clientWidth,mainLeft:box.left,mainRight:box.right,innerWidth:box.width-parseFloat(css.paddingLeft)-parseFloat(css.paddingRight),rootWidth:root?.getBoundingClientRect().width,navBottom:navigation.bottom,headingTop:document.querySelector('h1')?.getBoundingClientRect().top,gradient:getComputedStyle(document.querySelector('.student-next')??main).backgroundImage}})())`});
 const g=JSON.parse(geometry.result.value);assert.ok(Math.abs(g.viewport-g.mainRight)<2,JSON.stringify(g));if(g.rootWidth)assert.ok(Math.abs(g.innerWidth-g.rootWidth)<2,JSON.stringify(g));
 if(width<=780){assert.ok(g.mainLeft<1,'Mobile navigation must leave full reading width');if(g.headingTop)assert.ok(g.headingTop>=g.navBottom,'Navigation must not cover the heading');}
 if(page.startsWith('home-'))assert.equal(g.gradient,'none');
 if(page==='home-empty')assert.equal(v.primary,'View headset instructions');
 if(page==='home-review'){assert.match(v.text,/Instructor review needed/);assert.doesNotMatch(v.text,/0 \/ 100|Review this answer/);}
 if(page==='home-tests'){assert.match(v.text,/View test sessions/);assert.doesNotMatch(v.text,/91.67 \/ 100/);}
 if(page==='sessions-filtered')assert.match(v.text,/No sessions match these filters/);
 if(page==='sessions-invalid-date')assert.doesNotMatch(v.text,/Your first investigation/);
 if(page==='load-error')assert.match(v.text,/Try again/);
 if(page==='sessions-list'&&width<=600){const table=await call('Runtime.evaluate',{expression:`JSON.stringify((()=>{const container=document.querySelector('.table-scroll'),link=document.querySelector('.session-view a').getBoundingClientRect();return {visible:link.left>=0&&link.right<=document.documentElement.clientWidth,scrolls:container.scrollWidth>container.clientWidth+1,height:link.height}})())`});const t=JSON.parse(table.result.value);assert.equal(t.visible,true);assert.equal(t.scrolls,false);assert.ok(t.height>=44);}
 if(['home-empty','home-results','guide','sessions-list','session-detail'].includes(page)){const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(path.join(out,`${page}-${width}.png`),Buffer.from(shot.data,'base64'));}
});
test('review suggestions land on the exact saved answer and score-summary links resolve',async()=>{
 await visit('home-results');const result=await call('Runtime.evaluate',{expression:`JSON.stringify([...document.querySelectorAll('a')].filter(a=>a.textContent.includes('Review this answer')).map(a=>a.getAttribute('href')))`});
 const links=JSON.parse(result.result.value);assert.ok(links.length>0);
 for(const href of links){await call('Page.navigate',{url:base+href});await pause(100);const found=await call('Runtime.evaluate',{expression:`!!document.getElementById(decodeURIComponent(location.hash.slice(1)))`});assert.equal(found.result.value,true);}
 await call('Page.navigate',{url:base+'/results/student-attempt#deduction-score'});await pause(100);const score=await call('Runtime.evaluate',{expression:`document.getElementById('deduction-score').innerText`});assert.match(score.result.value,/Final Deduction Score/);
});

test('theme toggle works with keyboard input and persists through navigation and reload',async()=>{
 await visit('home-results',375);
 await call('Runtime.evaluate',{expression:`localStorage.setItem('vicsi-theme','light');document.documentElement.dataset.theme='light';window.dispatchEvent(new Event('vicsi-theme-change'))`});await pause(30);
 await call('Page.bringToFront');await call('Runtime.evaluate',{expression:`document.querySelector('.theme-toggle').focus()`});
 await call('Input.dispatchKeyEvent',{type:'rawKeyDown',key:' ',code:'Space',windowsVirtualKeyCode:32,nativeVirtualKeyCode:32});await call('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32,nativeVirtualKeyCode:32});await pause(80);
 let state=await call('Runtime.evaluate',{expression:`JSON.stringify({theme:document.documentElement.dataset.theme,saved:localStorage.getItem('vicsi-theme'),label:document.querySelector('.theme-toggle').getAttribute('aria-label')})`});assert.deepEqual(JSON.parse(state.result.value),{theme:'dark',saved:'dark',label:'Switch to light mode'});
 await visit('guide',375);state=await call('Runtime.evaluate',{expression:`document.documentElement.dataset.theme`});assert.equal(state.result.value,'dark');
 await call('Page.reload');await pause(100);state=await call('Runtime.evaluate',{expression:`document.documentElement.dataset.theme`});assert.equal(state.result.value,'dark');
 await call('Runtime.evaluate',{expression:`document.querySelector('.theme-toggle').click()`});await pause(30);state=await call('Runtime.evaluate',{expression:`localStorage.getItem('vicsi-theme')`});assert.equal(state.result.value,'light');
});
test('device preference is used until an explicit choice is saved',async()=>{
 await visit('home-results');await call('Runtime.evaluate',{expression:`localStorage.removeItem('vicsi-theme')`});
 await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'}]});await visit('home-results');
 let state=await call('Runtime.evaluate',{expression:`document.documentElement.dataset.theme`});assert.equal(state.result.value,'dark');
 await call('Runtime.evaluate',{expression:`document.querySelector('.theme-toggle').click()`});await pause(30);
 await visit('home-results');state=await call('Runtime.evaluate',{expression:`document.documentElement.dataset.theme`});assert.equal(state.result.value,'light');
 await call('Runtime.evaluate',{expression:`localStorage.removeItem('vicsi-theme')`});await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]});await visit('home-results');state=await call('Runtime.evaluate',{expression:`document.documentElement.dataset.theme`});assert.equal(state.result.value,'light');
});
for(const page of ['home-results','guide','sessions-list','session-detail'])for(const width of [375,768,1920])test(`dark ${page} at ${width}px retains layout and readable text contrast`,async()=>{
 await visit(page,width);await call('Runtime.evaluate',{expression:`localStorage.setItem('vicsi-theme','dark');window.dispatchEvent(new StorageEvent('storage',{key:'vicsi-theme'}))`});await pause(25);
 const state=await call('Runtime.evaluate',{expression:`JSON.stringify((()=>{const color=s=>s.match(/[\\d.]+/g)?.map(Number),rgb=s=>{const c=color(s);return c&&c.length>=3?c:null},luminance=c=>c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0),background=e=>{while(e){const c=rgb(getComputedStyle(e).backgroundColor);if(c&&(c.length<4||c[3]>=.99))return c;e=e.parentElement;}return [255,255,255]};const selectors=['h1','.next-copy>p:not(.eyebrow)','.latest-score strong','.student-text-link','.home-components dt','.home-components dd','.score-guide p','.headset-steps p','.answer-options p','.answer-weight','.selected-answer-label','.record-final-score','.product-table td','.theme-toggle','.record-filters input'];const pairs=selectors.flatMap(s=>[...document.querySelectorAll(s)].filter(e=>e.getBoundingClientRect().width>0).map(e=>{const f=luminance(rgb(getComputedStyle(e).color)),b=luminance(background(e));return {selector:s,ratio:(Math.max(f,b)+.05)/(Math.min(f,b)+.05)};}));return {theme:document.documentElement.dataset.theme,overflow:document.documentElement.scrollWidth>innerWidth+1,pairs,toggle:document.querySelector('.theme-toggle').getBoundingClientRect().height}})())`});
 const v=JSON.parse(state.result.value);assert.equal(v.theme,'dark');assert.equal(v.overflow,false);assert.ok(v.toggle>=44);for(const p of v.pairs)assert.ok(p.ratio>=4.5,`${p.selector}: ${p.ratio}`);
 if(width!==768){const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(path.join(out,`${page}-dark-${width}.png`),Buffer.from(shot.data,'base64'));}
});
