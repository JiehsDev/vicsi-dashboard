// Provider GET requests and non-persisted signature probes only. Never sends email.
import {Resend} from 'resend';
import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
process.loadEnvFile('.env.local');
const key=process.env.RESEND_API_KEY,secret=process.env.RESEND_WEBHOOK_SECRET;
let origin;
try{const parsed=new URL(process.env.DASHBOARD_APP_URL);if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.pathname!=='/'||parsed.search||parsed.hash)throw new Error();origin=parsed.origin;}catch{console.error('Public dashboard origin is not configured correctly.');process.exit(1);}
if(!key||!secret){console.error('Resend credentials are not configured.');process.exit(1);}
const endpoint=origin+'/api/webhooks/resend';
console.log('Configured dashboard origin:',origin);
const probeOrigin=process.argv.includes('--local')?'http://127.0.0.1:3100':origin;
const expectedEvents=['email.sent','email.delivered','email.delivery_delayed','email.failed','email.bounced','email.complained','email.suppressed'];
try{
 const resend=new Resend(key);
 const listed=await resend.webhooks.list({limit:100},{signal:AbortSignal.timeout(10000)});
 if(listed.error)console.log('Provider webhook metadata check:',listed.error.name==='restricted_api_key'?'sending-only key; reading webhook settings is not permitted':'unavailable', 'HTTP status:',listed.error.statusCode??'not supplied');
 else{
  console.log('Provider API credentials accepted: true');
  const matches=listed.data.data.filter(webhook=>webhook.endpoint===endpoint);
  console.log('Configured URL registered in Resend:',matches.length>0);
  if(matches.length){
   const match=matches.find(webhook=>webhook.status==='enabled')??matches[0];
   console.log('Registered webhook enabled:',match.status==='enabled');
   console.log('Required events selected:',expectedEvents.every(event=>match.events?.includes(event)));
   const details=await resend.webhooks.get(match.id,{signal:AbortSignal.timeout(10000)});
   if(details.error)console.log('Signing secret comparison: unavailable');
   else{const local=Buffer.from(secret),remote=Buffer.from(details.data.signing_secret);console.log('Local secret matches registered webhook:',local.length===remote.length&&timingSafeEqual(local,remote));}
  }else if(listed.data.has_more)console.log('More provider entries exist; first-page check is inconclusive.');
 }
}catch{console.log('Provider metadata check: connection unavailable');}
try{
 const page=await fetch(probeOrigin+'/login',{redirect:'manual',signal:AbortSignal.timeout(10000)});
 console.log('Configured origin responds:',page.status);
 console.log('Vercel hosting detected:',page.headers.has('x-vercel-id'));
 const html=await page.text();
 if(!page.ok||!html.includes('ViCSI')){console.log('Public signature probes skipped: ViCSI login page was not found.');process.exitCode=1;}
 else{
  const id='connection-check-'+randomUUID(),timestamp=String(Math.floor(Date.now()/1000));
  // The application explicitly ignores unsupported signed event types before accessing the database.
  const payload=JSON.stringify({type:'vicsi.connection_check',created_at:new Date().toISOString(),data:{}});
  const signed=createHmac('sha256',Buffer.from(secret.replace(/^whsec_/,''),'base64')).update(`${id}.${timestamp}.${payload}`).digest('base64');
  for(const [label,signature,expected] of [['invalid','v1,invalid',400],['valid','v1,'+signed,204]]){
   const result=await fetch(probeOrigin+'/api/webhooks/resend',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json','svix-id':id,'svix-timestamp':timestamp,'svix-signature':signature},body:payload,signal:AbortSignal.timeout(10000)});
   console.log(`${process.argv.includes('--local')?'Local':'Public'} endpoint ${label} signature: HTTP ${result.status} (expected ${expected})`);
   if(result.status!==expected)process.exitCode=1;await result.body?.cancel();
  }
 }
}catch{console.log('Public endpoint check: connection unavailable');process.exitCode=1;}
console.log('No emails sent; no application records intentionally written.');
