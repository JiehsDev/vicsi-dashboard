import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {POST} from '../../app/api/webhooks/resend/route';
import {resetWebhookBackend,webhookWrites} from '../../../Tools/testing/email-webhook-backend';
const key=Buffer.from('local-signature-test-secret-value');process.env.RESEND_WEBHOOK_SECRET='whsec_'+key.toString('base64');
function request(type='email.delivered',options:{tamper?:boolean;old?:boolean}={}){
 const id='evt_example',timestamp=String(Math.floor(Date.now()/1000)-(options.old?600:0)),payload=JSON.stringify({type,created_at:new Date().toISOString(),data:{email_id:'11111111-1111-4111-8111-111111111111',to:['private@example.edu']}});
 const signature=createHmac('sha256',key).update(`${id}.${timestamp}.${payload}`).digest('base64');
 return new Request('https://dashboard.example/api/webhooks/resend',{method:'POST',headers:{'svix-id':id,'svix-timestamp':timestamp,'svix-signature':'v1,'+signature},body:options.tamper?payload+' ':payload});
}
test('unsigned, modified and old callbacks cannot write email state',async()=>{
 resetWebhookBackend();assert.equal((await POST(new Request('https://dashboard.example/api/webhooks/resend',{method:'POST',body:'{}'}))).status,400);
 for(const options of [{tamper:true},{old:true}])assert.equal((await POST(request('email.delivered',options))).status,400);assert.equal(webhookWrites.length,0);
});
test('verified callbacks persist only allowlisted status identifiers; DB failures ask Resend to retry',async()=>{
 resetWebhookBackend();assert.equal((await POST(request())).status,204);assert.equal(webhookWrites[0].p_state,'delivered');assert.doesNotMatch(JSON.stringify(webhookWrites),/private@example|invite=/);
 assert.equal((await POST(request('email.opened'))).status,204);assert.equal(webhookWrites.length,1);
 resetWebhookBackend(true);assert.equal((await POST(request())).status,503);
});
