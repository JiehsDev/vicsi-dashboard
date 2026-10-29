import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
let server,browser,socket,base,id=0;
const pending=new Map();
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function call(method,params={}) {
  return new Promise((resolve,reject)=>{const requestId=++id;pending.set(requestId,{resolve,reject});socket.send(JSON.stringify({id:requestId,method,params}));});
}
before(async()=>{
  server=createServer(async(req,res)=>{
    const file=req.url?.includes('instructor')?'instructor-fixture.html':'student-fixture.html';
    res.setHeader('Content-Type','text/html; charset=utf-8');res.end(await readFile(path.join('docs/evidence/assessment-phase5',file)));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  base=`http://127.0.0.1:${server.address().port}`;
  const profile=await mkdtemp(path.join(tmpdir(),'vicsi-phase5-browser-'));
  browser=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
  let port;
  for(let n=0;n<100;n++) {try {port=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await pause(100);}}
  assert.ok(port,'Edge remote debugging started');
  const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});
  socket.addEventListener('message',event=>{const msg=JSON.parse(event.data);if(pending.has(msg.id)){const p=pending.get(msg.id);pending.delete(msg.id);if(msg.error)p.reject(msg.error);else p.resolve(msg.result);}});
  await call('Page.enable');
});
after(async()=>{socket?.close();browser?.kill();await new Promise(r=>server?.close(r));});
for(const view of ['student','instructor'])for(const width of [375,390,768,1366])test(`${view} fixture at ${width}px wraps without horizontal overflow`,async()=>{
  await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<640});
  await call('Page.navigate',{url:`${base}/${view}?width=${width}`});
  for(let n=0;n<100;n++){const state=await call('Runtime.evaluate',{expression:'document.readyState'});if(state.result.value==='complete')break;await pause(20);}
  const metrics=await call('Runtime.evaluate',{returnByValue:true,expression:`JSON.stringify({viewport:innerWidth,scroll:document.documentElement.scrollWidth,cards:[...document.querySelectorAll('section')].map(s=>s.getBoundingClientRect().width),scoreSize:getComputedStyle(document.querySelector('section p')).fontSize,gridColumns:getComputedStyle(document.querySelector('section .grid')).gridTemplateColumns,tables:document.querySelectorAll('table').length})`});
  const values=JSON.parse(metrics.result.value);
  assert.ok(values.scroll<=values.viewport,JSON.stringify(values));
  assert.ok(values.cards.every(w=>w<=width));
  assert.ok(parseFloat(values.scoreSize)>=36);
  assert.equal(values.tables,0);
  assert.equal(values.gridColumns.split(' ').length,width<640?1:3);
  if(width===375 || width===1366){const screenshot=await call('Page.captureScreenshot',{format:'png'});await writeFile(`docs/evidence/assessment-phase5/${view}-${width}.png`,Buffer.from(screenshot.data,'base64'));}
});
