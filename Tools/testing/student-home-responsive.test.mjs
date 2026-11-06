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
 const modalBundle=await buildShellPreview('Tools/testing/modal-preview.tsx');
 const interactivePages=['modal-controls','pagination-controls','manage-class-controls','invite-controls','admin-access-controls','admin-user-controls','account-setup-controls'];
 server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(url.pathname==='/brand/vicsi-logo.png'){res.setHeader('Content-Type','image/png');res.end(await readFile('public/brand/vicsi-logo.png'));return;}if(url.pathname==='/modal-preview.js'){res.setHeader('Content-Type','text/javascript');res.end(modalBundle);return;}if(url.pathname==='/theme-preview.js'){res.setHeader('Content-Type','text/javascript');res.end(themeBundle);return;}const name=url.pathname==='/results/home'?'home-results':url.pathname==='/results/guide'?'guide':url.pathname==='/results'?'sessions-list':url.pathname==='/results/student-attempt'?'session-detail':url.pathname.slice(1).replace(/[^a-z-]/g,'');res.setHeader('Content-Type','text/html; charset=utf-8');const html=await readFile(path.join(out,`${name}.html`),'utf8');res.end(interactivePages.includes(name)?html.replace('</body>','<script src="/modal-preview.js" defer></script></body>'):html);}catch{res.statusCode=404;res.end('Fixture unavailable');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;
 const profile=await mkdtemp(path.join(tmpdir(),'vicsi-student-home-browser-'));
 browser=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let port;for(let n=0;n<100;n++){try{port=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await pause(100);}}
 assert.ok(port);const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
 await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});
 socket.addEventListener('message',event=>{const msg=JSON.parse(event.data);if(pending.has(msg.id)){const p=pending.get(msg.id);pending.delete(msg.id);if(msg.error)p.reject(msg.error);else p.resolve(msg.result);}});await call('Page.enable');await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]});
});
after(async()=>{socket?.close();browser?.kill();await new Promise(r=>server?.close(r));});
async function visit(page,width=1366){await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<640});await call('Page.navigate',{url:`${base}/${page}`});for(let n=0;n<100;n++){const ready=await call('Runtime.evaluate',{expression:`document.readyState==='complete'&&document.querySelector('.theme-control')?.dataset.themeReady==='true'`});if(ready.result.value)return;await pause(20);}assert.fail('Theme control did not hydrate');}
for(const role of ['student','instructor','admin'])for(const width of [375,1440])test(`logout confirmation for ${role} at ${width}px preserves the session until confirmed`,async()=>{
 await visit(`instructor-sidebar?role=${role}`,width);
 const evaluate=async expression=>(await call('Runtime.evaluate',{expression})).result.value;
 for(const theme of ['light','dark']){
  await evaluate(`document.documentElement.dataset.theme='${theme}';document.querySelector('.signout-button').click()`);await pause(30);
  let state=JSON.parse(await evaluate(`JSON.stringify({open:!!document.querySelector('dialog:modal'),title:document.querySelector('dialog:modal h2')?.textContent,count:document.querySelector('#signout-count').textContent,focus:document.activeElement?.textContent,overflow:document.documentElement.scrollWidth>innerWidth+1})`));
  assert.deepEqual(state,{open:true,title:'Sign out of ViCSI?',count:'0',focus:'Cancel',overflow:false});
  const contrast=await evaluate(`(()=>{const button=document.querySelector('dialog:modal .button-primary'),rgb=s=>s.match(/[\\d.]+/g).map(Number),lum=c=>c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0),style=getComputedStyle(button),a=lum(rgb(style.color)),b=lum(rgb(style.backgroundColor));return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);})()`);assert.ok(contrast>=4.5,`${theme}: ${contrast}`);
  if(role==='student'){const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(path.join(out,`logout-${theme}-${width}.png`),Buffer.from(shot.data,'base64'));}
  await evaluate(`document.querySelector('dialog:modal button').click()`);await pause(20);assert.equal(await evaluate(`document.querySelector('#signout-count').textContent`),'0');assert.equal(await evaluate(`document.activeElement===document.querySelector('.signout-button')`),true);
  await evaluate(`document.querySelector('.signout-button').click()`);await pause(20);await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await pause(20);assert.equal(await evaluate(`!!document.querySelector('dialog:modal')`),false);assert.equal(await evaluate(`document.querySelector('#signout-count').textContent`),'0');
 }
 await evaluate(`document.querySelector('.signout-button').click()`);await pause(20);await evaluate(`document.querySelector('dialog:modal .button-primary').click()`);await pause(100);assert.equal(await evaluate(`document.querySelector('#signout-count').textContent`),'1');assert.equal(await evaluate(`!!document.querySelector('dialog:modal')`),false);
});
for(const page of ['admin-users','admin-user-detail','admin-invitations'])for(const width of [375,768,1440,1920])test(`stage 2 ${page} at ${width}px uses readable responsive account controls`,async()=>{
 await visit(page,width);
 for(const theme of ['light','dark']){
  await call('Runtime.evaluate',{expression:`document.documentElement.dataset.theme='${theme}'`});
  const state=await call('Runtime.evaluate',{expression:`JSON.stringify((()=>{const rgb=s=>s.match(/[\\d.]+/g).map(Number),lum=c=>c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0),bg=e=>{while(e){const c=rgb(getComputedStyle(e).backgroundColor);if(c.length<4||c[3]>.99)return c;e=e.parentElement;}return [255,255,255]};return {overflow:document.documentElement.scrollWidth>innerWidth+1,pairs:[...document.querySelectorAll('.admin-name-link,.admin-copy-status,.admin-user-record dt,.admin-user-record dd,.admin-links-table .admin-cell-detail')].filter(e=>e.getBoundingClientRect().width).map(e=>{const a=lum(rgb(getComputedStyle(e).color)),b=lum(bg(e));return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);}),clipped:[...document.querySelectorAll('main .button,main input,main select')].filter(e=>e.getBoundingClientRect().width).some(e=>e.getBoundingClientRect().right>innerWidth+1),rows:document.querySelectorAll('tbody tr').length}})())`});
  const v=JSON.parse(state.result.value);assert.equal(v.overflow,false);assert.equal(v.clipped,false);for(const ratio of v.pairs)assert.ok(ratio>=4.5,`${page} ${theme} contrast ${ratio}`);if(page==='admin-users')assert.equal(v.rows,20);
  if(width===375||width===1440){const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(path.join(out,`${page}-${theme}-${width}.png`),Buffer.from(shot.data,'base64'));}
 }
});
test('stage 2 invite dialog validates, closes on Escape and submits through the custom modal',async()=>{
 await visit('admin-user-controls',375);await pause(100);
 await call('Runtime.evaluate',{expression:`document.querySelector('#admin-user-test-root button').click()`});await pause(40);
 let state=await call('Runtime.evaluate',{expression:`JSON.stringify({open:!!document.querySelector('dialog[open]'),required:document.querySelectorAll('dialog[open] input[required]').length,overflow:document.documentElement.scrollWidth>innerWidth+1})`});assert.deepEqual(JSON.parse(state.result.value),{open:true,required:2,overflow:false});
 await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await pause(40);state=await call('Runtime.evaluate',{expression:`!!document.querySelector('dialog[open]')`});assert.equal(state.result.value,false);
 await call('Runtime.evaluate',{expression:`document.querySelector('#admin-user-test-root button').click()`});await pause(40);
 await call('Runtime.evaluate',{expression:`(()=>{const f=document.querySelector('dialog[open] form');f.elements.fullName.value='New Instructor';f.elements.email.value='instructor@example.edu';f.requestSubmit();})()`});await pause(100);
 state=await call('Runtime.evaluate',{expression:`JSON.stringify({saved:document.documentElement.dataset.adminSaved,refresh:document.documentElement.dataset.routerRefreshed,open:!!document.querySelector('dialog[open]')})`});assert.deepEqual(JSON.parse(state.result.value),{saved:'invite',refresh:'true',open:false});
});
test('stage 2 public setup works from a copied fragment and requires matching passwords',async()=>{
 const added=await call('Page.addScriptToEvaluateOnNewDocument',{source:`if(location.pathname==='/account-setup-controls'){window.__setupRequests=[];window.fetch=async(url,options)=>{window.__setupRequests.push({url,body:JSON.parse(options.body)});return Response.json(url.endsWith('/preview')?{name:'Professor Maria Santos',purpose:'instructor_invitation',expiresAt:'2099-11-08',suspended:false}:{ok:true});};}`});
 try{
  for(const width of [375,768,1440]){
   await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<640});await call('Page.navigate',{url:`${base}/account-setup-controls?viewport=${width}#invite=${'x'.repeat(43)}`});
   for(let i=0;i<100;i++){const r=await call('Runtime.evaluate',{expression:`!!document.querySelector('input[name=password]')`});if(r.result.value)break;await pause(20);}
   const layout=await call('Runtime.evaluate',{expression:`JSON.stringify({overflow:document.documentElement.scrollWidth>innerWidth+1,heading:document.querySelector('h1').textContent,preview:window.__setupRequests.length})`});assert.deepEqual(JSON.parse(layout.result.value),{overflow:false,heading:'Set up your instructor account',preview:1});
   const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(path.join(out,`account-setup-${width}.png`),Buffer.from(shot.data,'base64'));
   await call('Runtime.evaluate',{expression:`(()=>{const f=document.querySelector('form');f.elements.password.value='A long unique passphrase';f.elements.confirm.value='A different passphrase';f.requestSubmit();})()`});await pause(30);
   let state=await call('Runtime.evaluate',{expression:`document.querySelector('[role=alert]')?.textContent`});assert.match(state.result.value,/do not match/);
   await call('Runtime.evaluate',{expression:`(()=>{const f=document.querySelector('form');f.elements.confirm.value='A long unique passphrase';f.requestSubmit();})()`});await pause(80);
   state=await call('Runtime.evaluate',{expression:`JSON.stringify({done:document.querySelector('h1').textContent,hash:location.hash,count:window.__setupRequests.length,token:window.__setupRequests[1]?.body.token,link:document.querySelector('section a')?.getAttribute('href')})`});assert.deepEqual(JSON.parse(state.result.value),{done:'Your password is ready',hash:'',count:2,token:'x'.repeat(43),link:'/login'});
  }
 }finally{await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:added.identifier});}
});
for(const width of [375,1440])for(const outcome of ['sent','failed','unknown'])test(`stage 3 email ${outcome} at ${width}px keeps Copy link available`,async()=>{
 await visit('admin-user-controls',width);await pause(80);
 await call('Runtime.evaluate',{expression:`document.documentElement.dataset.emailResult='${outcome}';document.querySelector('#email-send-preview button').click()`});await pause(30);
 let state=await call('Runtime.evaluate',{expression:`JSON.stringify({text:document.querySelector('dialog[open]').innerText,overflow:document.documentElement.scrollWidth>innerWidth+1})`});const modal=JSON.parse(state.result.value);assert.match(modal.text,/teacher@example.edu/);assert.equal(modal.overflow,false);
 await call('Runtime.evaluate',{expression:`document.querySelector('dialog[open] .button-primary').click()`});await pause(30);
 state=await call('Runtime.evaluate',{expression:`document.querySelector('dialog[open] .button-primary').disabled`});assert.equal(state.result.value,true);
 await pause(150);state=await call('Runtime.evaluate',{expression:`JSON.stringify({open:!!document.querySelector('dialog[open]'),notice:document.querySelector('#email-send-preview [role=status]')?.textContent,copy:[...document.querySelectorAll('#admin-user-test-root button')].some(b=>b.textContent==='Copy link'&&!b.disabled)})`});const result=JSON.parse(state.result.value);assert.equal(result.open,false);assert.equal(result.copy,true);assert.match(result.notice,outcome==='sent'?/Email sent/:outcome==='failed'?/Email failed/:/unconfirmed/);
});
for(const page of ['instructor-overview','instructor-empty'])for(const width of [375,768,1366,1920])test(`${page} at ${width}px has actionable review and versioned performance`,async()=>{
 await visit(page,width);
 const state=await call('Runtime.evaluate',{expression:`JSON.stringify({overflow:document.documentElement.scrollWidth>innerWidth+1,text:document.querySelector('.instructor-overview').innerText,links:[...document.querySelectorAll('.review-open')].map(a=>a.getAttribute('href')),groups:document.querySelectorAll('#performance-group option').length,controls:[...document.querySelectorAll('.review-open,.performance-filter button,.performance-filter select')].map(e=>({height:e.getBoundingClientRect().height,right:e.getBoundingClientRect().right})),panels:[...document.querySelector('.instructor-overview').children].map(e=>({left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right,top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom}))})`});
 const v=JSON.parse(state.result.value);assert.equal(v.overflow,false);assert.match(v.text,/Needs review/);assert.match(v.text,/Class performance/);
 if(page==='instructor-overview'){assert.equal(v.groups,2);assert.equal(v.links.length,3);assert.ok(v.links.some(h=>h.endsWith('/weak#deduction-score')));assert.match(v.text,/2 students represented/);assert.match(v.text,/not pass\/fail grades/);assert.ok(v.controls.every(c=>c.height>=44&&c.right<=width+1));}
 else{assert.match(v.text,/No completed, verified student results/);assert.equal(v.links.length,0);assert.doesNotMatch(v.text,/Average deduction score/);}
 if(width<=1100)assert.ok(v.panels[1].top>=v.panels[0].bottom);else assert.ok(v.panels[1].left>=v.panels[0].right);
 if(width===375||width===1366){const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(path.join(out,`${page}-${width}.png`),Buffer.from(shot.data,'base64'));}
});
for(const page of ['instructor-sessions-first','instructor-sessions-last'])for(const width of [375,768,1366,1920])test(`${page} at ${width}px shows recent attempts and usable pagination`,async()=>{
 await visit(page,width);
 const state=await call('Runtime.evaluate',{expression:`JSON.stringify({width:innerWidth,scroll:document.documentElement.scrollWidth,text:document.querySelector('main').innerText,rows:document.querySelectorAll('tbody tr').length,links:[...document.querySelectorAll('a')].map(a=>a.getAttribute('href')),controls:[...document.querySelectorAll('.session-pagination .button')].map(a=>({width:a.getBoundingClientRect().width,height:a.getBoundingClientRect().height}))})`});
 const v=JSON.parse(state.result.value);assert.ok(v.scroll<=v.width+1);assert.equal(v.rows,page.endsWith('first')?5:2);assert.match(v.text,/Recent Sessions/);assert.doesNotMatch(v.text,/Latest matching|Assignments/);assert.ok(!v.links.some(h=>h?.startsWith('/assignments')));assert.ok(v.links.some(h=>h?.startsWith('/class-results?page=')));assert.ok(v.controls.every(b=>b.height>=44&&b.width>=44));
 if(width===1366||width===375){const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(path.join(out,`${page}-${width}.png`),Buffer.from(shot.data,'base64'));}
});
for(const page of ['home-empty','home-results','home-review','home-tests','home-historical','home-long','guide','sessions-list','sessions-page-first','sessions-page-middle','sessions-page-last','session-detail','sessions-empty','sessions-filtered','sessions-tests','sessions-invalid-date','load-error'])for(const width of [375,768,1024,1366,1920,2560])test(`${page} at ${width}px has readable guidance, named navigation and no page overflow`,async()=>{
 await visit(page,width);
 const state=await call('Runtime.evaluate',{expression:`JSON.stringify({width:innerWidth,scroll:document.documentElement.scrollWidth,text:document.body.innerText,nav:[...document.querySelectorAll('nav[aria-label="Student pages"] a')].map(e=>({name:e.getAttribute('aria-label'),visible:e.getBoundingClientRect().width>0,current:e.getAttribute('aria-current')})),h1:document.querySelectorAll('h1').length,primary:document.querySelector('.next-action')?.innerText,links:[...document.querySelectorAll('main a')].map(a=>a.getAttribute('href'))})`});
 const v=JSON.parse(state.result.value);assert.ok(v.scroll<=v.width+1,`${page}: ${v.scroll}/${v.width}`);assert.equal(v.h1,page==='load-error'?0:1);assert.deepEqual(v.nav.map(n=>n.name),['Home','My Sessions','My Classes','How to Play']);assert.equal(v.nav.filter(n=>n.current==='page').length,1);assert.ok(v.nav.every(n=>n.visible));assert.doesNotMatch(v.text,/NaN|undefined/);
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
 if(['home-empty','home-results','guide','sessions-list','sessions-page-first','session-detail'].includes(page)){const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(path.join(out,`${page}-${width}.png`),Buffer.from(shot.data,'base64'));}
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
for(const page of ['home-results','guide','sessions-list','session-detail','instructor-overview'])for(const width of [375,768,1920])test(`dark ${page} at ${width}px retains layout and readable text contrast`,async()=>{
 await visit(page,width);await call('Runtime.evaluate',{expression:`localStorage.setItem('vicsi-theme','dark');window.dispatchEvent(new StorageEvent('storage',{key:'vicsi-theme'}))`});await pause(25);
 const state=await call('Runtime.evaluate',{expression:`JSON.stringify((()=>{const color=s=>s.match(/[\\d.]+/g)?.map(Number),rgb=s=>{const c=color(s);return c&&c.length>=3?c:null},luminance=c=>c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0),background=e=>{while(e){const c=rgb(getComputedStyle(e).backgroundColor);if(c&&(c.length<4||c[3]>=.99))return c;e=e.parentElement;}return [255,255,255]};const selectors=['h1','.next-copy>p:not(.eyebrow)','.latest-score strong','.student-text-link','.home-components dt','.home-components dd','.score-guide p','.headset-steps p','.answer-options p','.answer-weight','.selected-answer-label','.record-final-score','.product-table td','.theme-toggle','.record-filters input','.instructor-section-heading p','.instructor-method','.review-student','.review-open','.performance-components dt','.performance-components dd','.performance-total strong'];const pairs=selectors.flatMap(s=>[...document.querySelectorAll(s)].filter(e=>e.getBoundingClientRect().width>0).map(e=>{const f=luminance(rgb(getComputedStyle(e).color)),b=luminance(background(e));return {selector:s,ratio:(Math.max(f,b)+.05)/(Math.min(f,b)+.05)};}));return {theme:document.documentElement.dataset.theme,overflow:document.documentElement.scrollWidth>innerWidth+1,pairs,toggle:document.querySelector('.theme-toggle').getBoundingClientRect().height}})())`});
 const v=JSON.parse(state.result.value);assert.equal(v.theme,'dark');assert.equal(v.overflow,false);assert.ok(v.toggle>=44);for(const p of v.pairs)assert.ok(p.ratio>=4.5,`${p.selector}: ${p.ratio}`);
 if(width!==768){const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(path.join(out,`${page}-dark-${width}.png`),Buffer.from(shot.data,'base64'));}
});

for(const page of ['auth-login','auth-signup'])for(const width of [375,768,1920])test(`${page} at ${width}px uses the supplied logo and readable brand actions in both themes`,async()=>{
 await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<640});
 await call('Page.navigate',{url:process.env.VICSI_LIVE_BRAND_URL?new URL(page==='auth-login'?'/login':'/signup',process.env.VICSI_LIVE_BRAND_URL).href:`${base}/${page}`});
 for(let n=0;n<100;n++){const r=await call('Runtime.evaluate',{expression:`document.readyState==='complete'&&!!document.querySelector('form')`});if(r.result.value)break;await pause(20);}
 for(const theme of ['light','dark']){
  await call('Runtime.evaluate',{expression:`document.documentElement.dataset.theme='${theme}'`});await pause(40);
  const r=await call('Runtime.evaluate',{expression:`JSON.stringify((()=>{const rgb=s=>s.match(/[\\d.]+/g).map(Number),lum=c=>c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0),bg=e=>{while(e){const c=rgb(getComputedStyle(e).backgroundColor);if(c.length<4||c[3]>.99)return c;e=e.parentElement;}return [255,255,255]};return {overflow:document.documentElement.scrollWidth>innerWidth+1,logo:!!document.querySelector('.vicsi-logo image[href="/brand/vicsi-logo.png?v=5.5"]'),pairs:[...document.querySelectorAll('.auth-brand-description,.auth-brand-panel>div:last-child,.auth-brand-switcher a,button[type=submit]')].filter(e=>e.getBoundingClientRect().width>0).map(e=>{const a=lum(rgb(getComputedStyle(e).color)),b=lum(bg(e));return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);})}})())`});
  const v=JSON.parse(r.result.value);assert.equal(v.overflow,false);assert.equal(v.logo,true);for(const ratio of v.pairs)assert.ok(ratio>=4.5,`${page} ${theme}: ${ratio}`);
  if(width!==768){const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(path.join(out,`${page}-${theme}-${width}.png`),Buffer.from(shot.data,'base64'));}
 }
});

for(const page of ['admin-overview','admin-activity','admin-access'])for(const width of [375,1440])test(`admin text contrast for ${page} at ${width}px`,async()=>{
 await visit(page,width);
 for(const theme of ['light','dark']){
  const result=await call('Runtime.evaluate',{expression:`document.documentElement.dataset.theme='${theme}';JSON.stringify((()=>{
   const rgb=value=>value.slice(value.indexOf('(')+1,value.indexOf(')')).split(',').map(Number);
   const luminance=c=>c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
   const background=element=>{while(element){const color=rgb(getComputedStyle(element).backgroundColor);if(color.length===3||color[3]>=.99)return color;element=element.parentElement;}return [255,255,255];};
   return [...document.querySelectorAll('.admin-intro,.admin-context-strip p,.admin-table th,.admin-table time,.admin-cell-detail,.admin-scope-note,.admin-access-status,.admin-filter-bar label')].filter(e=>e.getBoundingClientRect().width>0).map(e=>{const f=luminance(rgb(getComputedStyle(e).color)),b=luminance(background(e));return {text:e.textContent,ratio:(Math.max(f,b)+.05)/(Math.min(f,b)+.05)};});
  })())`});
  const pairs=JSON.parse(result.result.value);assert.ok(pairs.length>0);for(const pair of pairs)assert.ok(pair.ratio>=4.5,`${theme}: ${pair.text}: ${pair.ratio}`);
 }
});

test('admin activity details support native keyboard activation with visible focus',async()=>{
 await visit('admin-activity',1440);await call('Page.bringToFront');
 await call('Runtime.evaluate',{expression:`document.querySelector('.admin-event-details summary').focus()`});
 await call('Input.dispatchKeyEvent',{type:'rawKeyDown',key:' ',code:'Space',windowsVirtualKeyCode:32,nativeVirtualKeyCode:32});await call('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32,nativeVirtualKeyCode:32});await pause(30);
 const result=await call('Runtime.evaluate',{expression:`JSON.stringify({open:document.querySelector('.admin-event-details').open,top:document.activeElement.getBoundingClientRect().top,header:document.querySelector('.app-header').getBoundingClientRect().bottom})`});
 const state=JSON.parse(result.result.value);assert.equal(state.open,true);assert.ok(state.top>=state.header);
});

for(const page of ['admin-overview','admin-activity','admin-access','admin-empty','admin-unavailable','admin-activity-invalid'])for(const width of [375,768,1440,1920])test(`${page} admin foundation at ${width}px uses the workspace and supports both themes`,async()=>{
 await visit(page,width);
 for(const theme of ['light','dark']){
  await call('Runtime.evaluate',{expression:`document.documentElement.dataset.theme='${theme}'`});
  const result=await call('Runtime.evaluate',{expression:`JSON.stringify({overflow:document.documentElement.scrollWidth>innerWidth+1,text:document.querySelector('main').innerText,nav:[...document.querySelectorAll('nav[aria-label=Administration] a')].map(a=>({label:a.textContent,current:a.getAttribute('aria-current')})),h1:document.querySelectorAll('h1').length,main:document.querySelector('main').getBoundingClientRect().right,viewport:document.documentElement.clientWidth,gradient:getComputedStyle(document.querySelector('main')).backgroundImage,controls:[...document.querySelectorAll('main button,main select,main input,main .button')].filter(e=>e.getBoundingClientRect().width>0).map(e=>({h:e.getBoundingClientRect().height,w:e.getBoundingClientRect().width}))})`});
  const state=JSON.parse(result.result.value);assert.equal(state.overflow,false);assert.equal(state.h1,1);assert.ok(Math.abs(state.main-state.viewport)<2);assert.equal(state.gradient,'none');assert.deepEqual(state.nav.map(a=>a.label),['Overview','Users','Instructor invitations','Administrator access','Activity log']);assert.equal(state.nav.filter(a=>a.current==='page').length,1);assert.ok(state.controls.every(c=>c.h>=44&&c.w>=24));
  assert.doesNotMatch(state.text,/NaN|undefined|secret|JWT|service_role/);
  if(page==='admin-overview'){assert.match(state.text,/Recent activity/);assert.match(state.text,/27/);assert.match(state.text,/Access & accountability/);}
  if(page==='admin-activity'){assert.match(state.text,/Page 1 of 2/);assert.match(state.text,/View change/);}
  if(page==='admin-access'){assert.match(state.text,/Your account/);assert.match(state.text,/last active administrator/);}
  if(page==='admin-empty')assert.match(state.text,/No recorded changes yet/);
  if(page==='admin-unavailable'){assert.match(state.text,/could not be loaded/);assert.match(state.text,/Unavailable/);assert.doesNotMatch(state.text,/No recorded changes yet/);}
  if(page==='admin-activity-invalid')assert.match(state.text,/valid dates/);
  if(page==='admin-activity'){
   await call('Runtime.evaluate',{expression:`document.querySelector('.admin-event-details').open=true`});
   const detail=await call('Runtime.evaluate',{expression:`document.querySelector('.admin-event-details').innerText`});assert.match(detail.result.value,/Reason:/);
  }
  if(width!==768){const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(path.join(out,`${page}-${theme}-${width}.png`),Buffer.from(shot.data,'base64'));}
 }
});

for(const width of [375,768,1440])for(const theme of ['light','dark'])test(`admin access confirmation at ${width}px in ${theme} supports cancellation, validation and one submit`,async()=>{
 await visit('admin-access-controls',width);
 const evaluate=async expression=>(await call('Runtime.evaluate',{expression})).result.value;
 for(let n=0;n<50;n++){if(await evaluate(`!!document.querySelector('#admin-access-test-root>button')`))break;await pause(20);}
 await evaluate(`document.documentElement.dataset.theme='${theme}';document.querySelector('#admin-access-test-root>button').click()`);await pause(30);
 assert.equal(await evaluate(`document.activeElement.tagName`),'TEXTAREA');assert.equal(await evaluate(`document.querySelector('dialog:modal h2').textContent`),'Suspend administrator access?');
 await evaluate(`document.querySelector('dialog:modal button[type=submit]').click()`);await pause(30);assert.equal(await evaluate(`document.querySelector('#admin-access-count').textContent`),'0');
 await evaluate(`document.querySelector('dialog:modal textarea').value='Unsaved reason';document.querySelector('.admin-dialog-actions button[type=button]').click()`);await pause(30);
 assert.equal(await evaluate(`document.body.style.overflow`),'');assert.equal(await evaluate(`document.activeElement.textContent`),'Suspend access');
 await evaluate(`document.querySelector('#admin-access-test-root>button').click()`);await pause(30);assert.equal(await evaluate(`document.querySelector('dialog:modal textarea').value`),'');
 await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await pause(30);
 assert.equal(await evaluate(`!!document.querySelector('dialog:modal')`),false);
 await evaluate(`document.querySelector('#admin-access-test-root>button').click()`);await pause(30);
 await evaluate(`document.querySelector('dialog:modal textarea').value='Staff member reassigned to another department.'`);
 const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(path.join(out,`admin-access-modal-${theme}-${width}.png`),Buffer.from(shot.data,'base64'));
 assert.equal(await evaluate(`document.documentElement.scrollWidth>innerWidth+1`),false);
 await evaluate(`document.querySelector('dialog:modal button[type=submit]').click()`);await pause(20);
 assert.equal(await evaluate(`document.querySelector('dialog:modal button[type=submit]').disabled`),true);
 await pause(150);assert.equal(await evaluate(`document.querySelector('#admin-access-count').textContent`),'1');assert.match(await evaluate(`document.querySelector('#admin-access-reason').textContent`),/reassigned/);assert.equal(await evaluate(`document.body.style.overflow`),'');
});

for(const page of ['classes-directory','class-editor','class-overview','class-student','class-student-empty','class-session'])for(const width of [375,768,1440])test(`${page} at ${width}px keeps the class workflow readable in both themes`,async()=>{
 await visit(page,width);
 for(const theme of ['light','dark']){
  await call('Runtime.evaluate',{expression:`document.documentElement.dataset.theme='${theme}'`});
  const state=await call('Runtime.evaluate',{expression:`JSON.stringify({overflow:document.documentElement.scrollWidth>innerWidth+1,text:document.querySelector('main').innerText,links:[...document.querySelectorAll('main a')].map(a=>a.getAttribute('href')),rows:document.querySelectorAll('.class-roster li').length,clipped:[...document.querySelectorAll('.class-roster a')].filter(e=>e.scrollWidth>e.clientWidth+1).length})`});
  const v=JSON.parse(state.result.value);assert.equal(v.overflow,false);assert.equal(v.clipped,0);assert.doesNotMatch(v.text,/NaN|undefined/);
  if(page==='class-overview'){assert.equal(v.rows,2);assert.doesNotMatch(v.text,/No session received|Latest status|Latest upload|deduction score|Enroll a student|Manage enrollment/);assert.match(v.text,/Ana Reyes/);assert.ok(v.links.some(h=>h.includes('/students/no-upload')));}
  if(page==='class-student'){assert.match(v.text,/Next/);assert.ok(v.links.some(h=>h.includes('/sessions/student-attempt')));assert.ok(v.links.some(h=>h.includes('page=2')));}
  if(page==='class-student-empty')assert.match(v.text,/No session received/);
  if(page==='class-session'){assert.match(v.text,/Back to student sessions/);assert.match(v.text,/Score summary/);}
  if(page==='classes-directory'){assert.ok(v.links.some(h=>h==='/classes/class-a'));assert.match(v.text,/Active/);assert.match(v.text,/Archived/);}
  if(page==='class-editor'){assert.match(v.text,/Edit class/);assert.match(v.text,/Save/);}
  if(width!==768){const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(path.join(out,`${page}-${theme}-${width}.png`),Buffer.from(shot.data,'base64'));}
 }
});

for(const width of [375,768,1440])for(const theme of ['light','dark'])test(`class sidebar at ${width}px in ${theme} lists classes, highlights nested routes and scrolls independently`,async()=>{
 await visit('instructor-sidebar?previewPath=/classes/class-1/students/student-a',width);
 await call('Runtime.evaluate',{expression:`document.documentElement.dataset.theme='${theme}'`});
 if(width<=780){await call('Runtime.evaluate',{expression:`document.querySelector('.class-group-toggle').click()`});await pause(20);}
 const inspect=async()=>JSON.parse((await call('Runtime.evaluate',{expression:`JSON.stringify((()=>{const sidebar=document.querySelector('.app-sidebar'),list=document.querySelector('.sidebar-class-list'),pane=document.querySelector('.sidebar-scroll'),button=document.querySelector('.class-group-toggle');return {width:sidebar.getBoundingClientRect().width,overflow:document.documentElement.scrollWidth>innerWidth+1,sidebarOverflow:sidebar.scrollWidth>sidebar.clientWidth+1,visible:list.getBoundingClientRect().height>0,expanded:button.getAttribute('aria-expanded'),links:[...list.querySelectorAll('a')].map(a=>({href:a.getAttribute('href'),current:a.getAttribute('aria-current')})),scrollable:pane.scrollHeight>pane.clientHeight+1,footerBottom:document.querySelector('.collapse-button').getBoundingClientRect().bottom}})())`})).result.value);
 let state=await inspect();assert.equal(state.visible,true);assert.equal(state.expanded,'true');assert.equal(state.overflow,false);assert.equal(state.sidebarOverflow,false);assert.equal(state.links.length,19);assert.equal(state.links.find(a=>a.href==='/classes/class-1').current,'page');assert.equal(state.links.filter(a=>a.current==='page').length,1);assert.equal(state.scrollable,true);assert.ok(state.footerBottom<=1000);
 await call('Runtime.evaluate',{expression:`document.querySelector('.class-group-toggle').click()`});await pause(20);assert.equal((await inspect()).visible,false);
 await call('Page.bringToFront');await call('Runtime.evaluate',{expression:`document.querySelector('.class-group-toggle').focus()`});
 await call('Input.dispatchKeyEvent',{type:'rawKeyDown',key:' ',code:'Space',windowsVirtualKeyCode:32,nativeVirtualKeyCode:32});await call('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32,nativeVirtualKeyCode:32});await pause(40);state=await inspect();assert.equal(state.visible,true,JSON.stringify(state));
 const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(path.join(out,`sidebar-classes-${theme}-${width}.png`),Buffer.from(shot.data,'base64'));
 await call('Runtime.evaluate',{expression:`document.querySelector('.sidebar-scroll').scrollTop=100000`});await pause(20);
 const end=await call('Runtime.evaluate',{expression:`JSON.stringify((()=>{const pane=document.querySelector('.sidebar-scroll').getBoundingClientRect(),last=[...document.querySelectorAll('.sidebar-class-list li a')].at(-1).getBoundingClientRect();return {visible:last.top>=pane.top&&last.bottom<=pane.bottom+1,y:scrollY}})())`});assert.equal(JSON.parse(end.result.value).visible,true);assert.equal(JSON.parse(end.result.value).y,0);
 await call('Runtime.evaluate',{expression:`document.querySelector('.collapse-button').click()`});await pause(20);state=await inspect();assert.ok(state.width<100);assert.equal(state.visible,false);
 await call('Runtime.evaluate',{expression:`document.querySelector('.class-group-toggle').click()`});await pause(20);assert.equal((await inspect()).visible,true);
});

for(const width of [375,768,1440])test(`pagination interaction at ${width}px keeps scroll and filters without refreshing and supports browser history`,async()=>{
 await visit('pagination-controls',width);
 for(let n=0;n<50;n++){const r=await call('Runtime.evaluate',{expression:`!!document.querySelector('#pagination-test-root .session-pagination')`});if(r.result.value)break;await pause(20);}
 await call('Runtime.evaluate',{expression:`window.__paginationSentinel='same-document';window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'})`});await pause(30);
 const state=async()=>JSON.parse((await call('Runtime.evaluate',{expression:`JSON.stringify({y:scrollY,text:document.querySelector('#pagination-test-root').innerText,url:location.search,sentinel:window.__paginationSentinel,overflow:document.documentElement.scrollWidth>innerWidth+1})`})).result.value);
 const initial=await state();assert.ok(initial.y>100);assert.equal(initial.overflow,false);
 const click=async label=>{await call('Runtime.evaluate',{expression:`[...document.querySelectorAll('#pagination-test-root .session-pagination a')].find(a=>a.textContent.includes('${label}')).click()`});await pause(40);};
 await click('Next');let current=await state();assert.match(current.text,/Session 6/);assert.match(current.text,/Page 2 of 3/);assert.equal(current.sentinel,'same-document');assert.ok(Math.abs(current.y-initial.y)<2);assert.match(current.url,/dateFrom=2026-10-01/);assert.match(current.url,/includeTests=true/);
 await click('Next');current=await state();assert.match(current.text,/Session 12/);assert.match(current.text,/Page 3 of 3/);assert.ok(Math.abs(current.y-initial.y)<2,'Last page must not shrink the document and move the viewport');
 await click('Previous');assert.match((await state()).text,/Page 2 of 3/);
 await call('Runtime.evaluate',{expression:`history.back()`});await pause(80);assert.match((await state()).text,/Page 3 of 3/);
 await call('Runtime.evaluate',{expression:`history.forward()`});await pause(80);assert.match((await state()).text,/Page 2 of 3/);
 assert.equal((await state()).sentinel,'same-document');
 const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(path.join(out,`pagination-${width}.png`),Buffer.from(shot.data,'base64'));
});

for(const width of [375,768,1440])test(`class invitation sharing at ${width}px generates a scannable local QR and copies the join link`,async()=>{
 await visit('invite-controls',width);
 const evaluate=async expression=>(await call('Runtime.evaluate',{expression})).result.value;
 for(let n=0;n<50;n++){if(await evaluate(`!!document.querySelector('.enroll-student-button')`))break;await pause(20);}
 await evaluate(`Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copied=text;}}});document.querySelector('.enroll-student-button').click()`);await pause(50);
 for(let n=0;n<100;n++){if(await evaluate(`!!document.querySelector('.invite-qr img')`))break;await pause(20);}
 const qr=await evaluate(`document.querySelector('.invite-qr img')?.src`);assert.ok(qr?.startsWith('data:image/png;base64,'));
 const url=await evaluate(`document.querySelector('#class-invite-link').value`);assert.equal(url,`${base}/results/classes/join?invite=${'a'.repeat(64)}`);
 if(process.env.QR_DECODER_MODULE_PATH){
   const decoder=await import(process.env.QR_DECODER_MODULE_PATH);const jsQR=decoder.default;
   const {PNG}=await import('pngjs');const png=PNG.sync.read(Buffer.from(qr.split(',')[1],'base64'));
   assert.equal(jsQR(new Uint8ClampedArray(png.data),png.width,png.height)?.data,url);
 }
 await evaluate(`document.querySelector('.class-invite-share>.button').click()`);await pause(30);assert.equal(await evaluate(`window.__copied`),url);
 assert.equal(await evaluate(`document.querySelector('.invite-qr a').download`),'vicsi-class-invite.png');
 for(const theme of ['light','dark']){
   await evaluate(`document.documentElement.dataset.theme='${theme}'`);
   assert.equal(await evaluate(`document.documentElement.scrollWidth>innerWidth+1`),false);
   assert.equal(await evaluate(`document.querySelector('dialog:modal').getBoundingClientRect().bottom<=innerHeight`),true);
   const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(path.join(out,`class-invite-${theme}-${width}.png`),Buffer.from(shot.data,'base64'));
 }
 await evaluate(`document.querySelector('.class-enrollment-dialog>.app-modal-actions button').click()`);await pause(25);assert.equal(await evaluate(`document.body.style.overflow`),'');
});

for(const page of ['student-classes','class-join','class-join-invalid'])for(const width of [375,768,1440])test(`${page} self enrollment at ${width}px remains readable and requires confirmation`,async()=>{
 await visit(page,width);
 for(const theme of ['light','dark']){
   const result=await call('Runtime.evaluate',{expression:`document.documentElement.dataset.theme='${theme}';JSON.stringify({overflow:document.documentElement.scrollWidth>innerWidth+1,text:document.querySelector('main').innerText,form:document.querySelector('main form')?.getAttribute('action'),confirm:document.querySelector('main input[name=returnTo]')?.value})`});
   const state=JSON.parse(result.result.value);assert.equal(state.overflow,false);
   if(page==='class-join'){assert.match(state.text,/Professor Reyes/);assert.match(state.text,/Join class/);assert.equal(state.confirm,'/results/classes/join?code=ABCDE23456');}
   if(page==='student-classes')assert.equal(state.form,'/results/classes/join');
   if(page==='class-join-invalid')assert.match(state.text,/unavailable/);
   const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(path.join(out,`${page}-${theme}-${width}.png`),Buffer.from(shot.data,'base64'));
 }
});

for(const width of [375,768,1440])for(const theme of ['light','dark'])test(`enroll student at ${width}px in ${theme} opens a separate modal, validates, cancels and submits`,async()=>{
 await visit('manage-class-controls',width);
 const evaluate=async expression=>(await call('Runtime.evaluate',{expression})).result.value;
 for(let n=0;n<50;n++){if(await evaluate(`!!document.querySelector('.enroll-student-button')`))break;await pause(20);}
 await evaluate(`document.documentElement.dataset.theme='${theme}';document.querySelector('.enroll-student-button').click()`);await pause(30);
 assert.equal(await evaluate(`document.querySelector('dialog:modal h2').textContent`),'Enroll student');
 assert.equal(await evaluate(`document.querySelectorAll('dialog:modal').length`),1);
 assert.equal(await evaluate(`document.documentElement.scrollWidth>innerWidth+1`),false);
 await evaluate(`document.querySelector('.class-enrollment-dialog .button-primary').click()`);await pause(30);
 assert.equal(await evaluate(`document.querySelector('#enrollment-count').textContent`),'0');
 await evaluate(`document.querySelector('#studentNumber').value='Unsaved';document.querySelector('.class-enrollment-dialog>.app-modal-actions button').click()`);await pause(30);
 assert.equal(await evaluate(`document.body.style.overflow`),'');
 assert.equal(await evaluate(`document.activeElement.classList.contains('enroll-student-button')`),true);
 await evaluate(`document.querySelector('.enroll-student-button').click()`);await pause(30);
 assert.equal(await evaluate(`document.querySelector('#studentNumber').value`),'');
 await evaluate(`document.querySelector('#studentNumber').value='2026-001'`);
 const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(path.join(out,`enroll-student-${theme}-${width}.png`),Buffer.from(shot.data,'base64'));
 await evaluate(`document.querySelector('.class-enrollment-dialog .button-primary').click()`);await pause(100);
 assert.equal(await evaluate(`document.querySelector('#enrolled-number').textContent`),'2026-001');
 assert.equal(await evaluate(`document.querySelector('#enrollment-count').textContent`),'1');
 assert.equal(await evaluate(`!!document.querySelector('dialog:modal')`),false);
 assert.equal(await evaluate(`document.body.style.overflow`),'');
});

for(const width of [375,768,1440])for(const theme of ['light','dark'])test(`manage class at ${width}px in ${theme} edits, cancels and preserves nested dialog locks`,async()=>{
 await visit('manage-class-controls',width);
 for(let n=0;n<50;n++){const r=await call('Runtime.evaluate',{expression:`!!document.querySelector('.manage-class-button')`});if(r.result.value)break;await pause(20);}
 const evaluate=async expression=>(await call('Runtime.evaluate',{expression})).result.value;
 await evaluate(`document.documentElement.dataset.theme='${theme}';document.querySelector('.manage-class-button').click()`);await pause(40);
 assert.equal(await evaluate(`document.querySelector('#name').value`),'Forensic investigation');
 assert.equal(await evaluate(`document.documentElement.scrollWidth>innerWidth+1`),false);
 assert.equal(await evaluate(`document.querySelector('dialog:modal').getBoundingClientRect().right<=innerWidth`),true);
 const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(path.join(out,`manage-class-${theme}-${width}.png`),Buffer.from(shot.data,'base64'));
 await evaluate(`document.querySelector('#name').value='Unsaved';document.querySelector('.class-management-dialog>.app-modal-actions button').click()`);await pause(30);
 assert.equal(await evaluate(`!!document.querySelector('dialog:modal')`),false);
 assert.equal(await evaluate(`document.body.style.overflow`),'');
 assert.equal(await evaluate(`document.activeElement.classList.contains('manage-class-button')`),true);
 await evaluate(`document.querySelector('.manage-class-button').click()`);await pause(30);
 assert.equal(await evaluate(`document.querySelector('#name').value`),'Forensic investigation');
 await evaluate(`document.querySelector('#name').value='';document.querySelector('.class-management-dialog>.app-modal-actions .button-primary').click()`);await pause(30);
 assert.equal(await evaluate(`document.querySelector('#class-save-count').textContent`),'0');
 await evaluate(`document.querySelector('#name').value='Edited class';document.querySelector('.class-management-dialog>.app-modal-actions .button-primary').click()`);await pause(100);
 assert.equal(await evaluate(`document.querySelector('#class-saved-name').textContent`),'Edited class');
 assert.equal(await evaluate(`!!document.querySelector('dialog:modal')`),false);
 await evaluate(`document.querySelector('.manage-class-button').click()`);await pause(30);
 await evaluate(`document.querySelector('.class-management-more').open=true;document.querySelector('.class-management-more button').click()`);await pause(30);
 assert.equal(await evaluate(`document.querySelectorAll('dialog:modal').length`),2);
 await evaluate(`document.querySelector('dialog:modal:not(.class-management-dialog) button').click()`);await pause(30);
 assert.equal(await evaluate(`document.body.style.overflow`),'hidden');
 await evaluate(`document.querySelector('.class-management-more button').click()`);await pause(30);
 await evaluate(`document.querySelector('dialog:modal:not(.class-management-dialog) .button-primary').click()`);await pause(100);
 assert.equal(await evaluate(`document.querySelectorAll('dialog:modal').length`),0);
 assert.equal(await evaluate(`document.body.style.overflow`),'');
});

for(const width of [375,768,1440])for(const theme of ['light','dark'])test(`modal confirmations at ${width}px in ${theme} support cancel, keyboard, one submit and notifications`,async()=>{
 await visit('modal-controls',width);
 for(let n=0;n<50;n++){const r=await call('Runtime.evaluate',{expression:`!!document.querySelector('#modal-test-root button')`});if(r.result.value)break;await pause(20);}
 await call('Runtime.evaluate',{expression:`document.documentElement.dataset.theme='${theme}';window.__nativeDialogs=0;window.alert=window.confirm=()=>{window.__nativeDialogs++;return false;};document.querySelector('#modal-test-root button').click()`});await pause(30);
 let r=await call('Runtime.evaluate',{expression:`JSON.stringify({open:!!document.querySelector('dialog:modal'),focus:document.activeElement?.textContent,count:document.querySelector('#submission-count').textContent,overflow:document.documentElement.scrollWidth>innerWidth+1,label:document.querySelector('dialog:modal')?.getAttribute('aria-labelledby')})`});
 let v=JSON.parse(r.result.value);assert.equal(v.open,true);assert.equal(v.focus,'Cancel');assert.equal(v.count,'Submissions: 0');assert.equal(v.overflow,false);assert.ok(v.label);
 await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await pause(30);
 r=await call('Runtime.evaluate',{expression:`JSON.stringify({open:!!document.querySelector('dialog:modal'),focus:document.activeElement?.textContent})`});v=JSON.parse(r.result.value);assert.equal(v.open,false);assert.equal(v.focus,'Remove');
 await call('Runtime.evaluate',{expression:`document.querySelector('#modal-test-root button').click()`});await pause(20);
 await call('Runtime.evaluate',{expression:`document.querySelector('dialog:modal button').click()`});await pause(20);
 r=await call('Runtime.evaluate',{expression:`document.querySelector('#submission-count').textContent`});assert.equal(r.result.value,'Submissions: 0');
 await call('Runtime.evaluate',{expression:`history.replaceState(null,'','/modal-controls?removed=1&keep=yes');document.querySelector('#modal-test-root button').click()`});await pause(20);
 await call('Runtime.evaluate',{expression:`document.querySelector('dialog:modal .button-primary').click()`});await pause(250);
 r=await call('Runtime.evaluate',{expression:`JSON.stringify({count:document.querySelector('#submission-count').textContent,received:document.querySelector('#received').textContent,title:document.querySelector('dialog:modal h2')?.textContent,native:window.__nativeDialogs,scroll:document.body.style.overflow})`});v=JSON.parse(r.result.value);assert.equal(v.count,'Submissions: 1');assert.equal(v.received,'student-42');assert.equal(v.title,'Student removed');assert.equal(v.native,0);assert.equal(v.scroll,'hidden');
 const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(path.join(out,`modal-${theme}-${width}.png`),Buffer.from(shot.data,'base64'));
 await call('Runtime.evaluate',{expression:`document.querySelector('dialog:modal button').click()`});await pause(25);
 r=await call('Runtime.evaluate',{expression:`JSON.stringify({open:!!document.querySelector('dialog:modal'),query:location.search,overflow:document.body.style.overflow})`});v=JSON.parse(r.result.value);assert.equal(v.open,false);assert.equal(v.query,'?keep=yes');assert.equal(v.overflow,'');
});
