import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
let server,browser,socket,base,id=0;const pending=new Map();
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function call(method,params={}){return new Promise((resolve,reject)=>{const requestId=++id;pending.set(requestId,{resolve,reject});socket.send(JSON.stringify({id:requestId,method,params}));});}
before(async()=>{
 server=createServer(async(req,res)=>{try{const name=new URL(req.url,'http://localhost').pathname.slice(1).replace(/[^a-z-]/g,'');res.setHeader('Content-Type','text/html; charset=utf-8');res.end(await readFile(`docs/evidence/session-simplification/browser/${name}.html`));}catch{res.statusCode=404;res.end('Fixture unavailable');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;
 const profile=await mkdtemp(path.join(tmpdir(),'vicsi-record-browser-'));
 browser=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let port;for(let n=0;n<100;n++){try{port=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await pause(100);}}
 assert.ok(port);const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
 await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});
 socket.addEventListener('message',event=>{const msg=JSON.parse(event.data);if(pending.has(msg.id)){const p=pending.get(msg.id);pending.delete(msg.id);if(msg.error)p.reject(msg.error);else p.resolve(msg.result);}});await call('Page.enable');
});
after(async()=>{socket?.close();browser?.kill();await new Promise(r=>server?.close(r));});
for(const page of ['student-list','student-detail','instructor-list','instructor-detail','historical','empty','loading'])for(const width of [375,768,1366])test(`${page} at ${width}px is readable without charts or horizontal page overflow`,async()=>{
 await call('Emulation.setDeviceMetricsOverride',{width,height:940,deviceScaleFactor:1,mobile:width<640});await call('Page.navigate',{url:`${base}/${page}`});
 for(let n=0;n<100;n++){const ready=await call('Runtime.evaluate',{expression:`document.readyState==='complete'&&!!document.querySelector('.app-main')`});if(ready.result.value)break;await pause(20);}
 const result=await call('Runtime.evaluate',{expression:`JSON.stringify({width:innerWidth,scroll:document.documentElement.scrollWidth,questions:document.querySelectorAll('.assessment-question').length,selected:document.querySelectorAll('.student-answer').length,overflow:[...document.querySelectorAll('.answer-options p')].filter(e=>e.scrollWidth>e.clientWidth+1).length,charts:document.querySelectorAll('.bar-list,.metric-strip,.recharts-wrapper').length,nav:[...document.querySelectorAll('.app-sidebar nav[aria-label="Course management"]~nav')].length,body:document.body.innerText,links:[...document.querySelectorAll('tbody a')].map(a=>a.getAttribute('href'))})`});
 const v=JSON.parse(result.result.value);assert.ok(v.scroll<=v.width+1,JSON.stringify(v));assert.equal(v.overflow,0);assert.equal(v.charts,0);assert.doesNotMatch(v.body,/NaN|undefined|Score distribution|Training Analytics/);
 assert.doesNotMatch(v.body,/EVD-\d+|BODY-A|HYP-[A-Za-z0-9-]+|REL-[A-Za-z0-9-]+|RC-\d+-[A-Z-]+/,'Educational pages must show mapped evidence labels, including historical sessions.');
 if(page.endsWith('detail')){assert.equal(v.questions,13);assert.equal(v.selected,13);assert.match(v.body,/Final Deduction Score: 100%/);assert.match(v.body,/Recorder Documentation Score: 18 \/ 24/);}
 if(page.endsWith('list'))assert.ok(v.links.some(h=>h.startsWith(page.startsWith('student')?'/results/':'/class-results/')));
 if(page==='historical'){assert.equal(v.questions,0);assert.match(v.body,/Recorded historical score: 72%/);}
 if(['student-list','student-detail','instructor-list','instructor-detail','historical'].includes(page)&&width!==768){
   const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(`docs/evidence/session-simplification/browser/${page}-${width}.png`,Buffer.from(shot.data,'base64'));
   if(page.endsWith('detail'))for(const [section,selector] of [['recorder','.recorder-subject'],['recorder-total','.recorder-subject:last-of-type'],['questions','.assessment-question'],['score','.deduction-components']]){
     await call('Runtime.evaluate',{expression:`document.querySelector('${selector}').scrollIntoView({block:'start'})`});
     const detail=await call('Page.captureScreenshot',{format:'png'});await writeFile(`docs/evidence/session-simplification/browser/${page}-${section}-${width}.png`,Buffer.from(detail.data,'base64'));
   }
 }
});
