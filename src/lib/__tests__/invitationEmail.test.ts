import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newSetupToken,decryptSetupToken} from '../accountSetupCrypto';
import {invitationEmailConfig,invitationEmailV1,deliverInvitationEmail} from '../invitationEmail';
import {emailStatusDetail,emailStatusLabel} from '../invitationEmailPresentation';
process.env.DASHBOARD_SESSION_SECRET='local-email-test-secret';
const secret=newSetupToken();
const job={id:'11111111-1111-4111-8111-111111111111',link_id:'22222222-2222-4222-8222-222222222222',token_hash:secret.hash,token_ciphertext:secret.ciphertext,recipient:'teacher@example.edu',recipient_name:'Maria Santos',sender:'onboarding@resend.dev',app_origin:'https://dashboard.example'};
function backend(stale=false,saveError=false){const saved:Record<string,unknown>[]=[];const db={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{token_hash:stale?'replaced':job.token_hash,accepted_at:null,revoked_at:null,expires_at:'2099-01-01'},error:null})})})}),rpc:async(_name:string,args:Record<string,unknown>)=>{saved.push(args);return {data:!saveError,error:saveError?{}:null};}};return {saved,db:db as never};}
test('Resend defaults to its sender, requires a public configured origin and exposes no key to presentation',()=>{
 const names=['RESEND_API_KEY','RESEND_FROM_EMAIL','DASHBOARD_APP_URL'];const before=names.map(name=>process.env[name]);
 try{for(const name of names)delete process.env[name];assert.equal(invitationEmailConfig().sender,'onboarding@resend.dev');assert.equal(invitationEmailConfig().ready,false);
  process.env.RESEND_API_KEY='local-fixture';for(const url of ['http://localhost:3000','https://example.edu/path','https://user:pass@example.edu','not-a-url']){process.env.DASHBOARD_APP_URL=url;assert.equal(invitationEmailConfig().ready,false);}
  process.env.DASHBOARD_APP_URL='https://dashboard.example';assert.equal(invitationEmailConfig().ready,true);
  process.env.RESEND_FROM_EMAIL='bad\r\nHeader: value';assert.equal(invitationEmailConfig().ready,false);
 }finally{names.forEach((name,i)=>{if(before[i]===undefined)delete process.env[name];else process.env[name]=before[i];});}
});
test('email contains the original one-use link, actual recipient and stable retry payload',()=>{
 const first=invitationEmailV1(job);assert.deepEqual(first,invitationEmailV1(job));assert.deepEqual(first.to,['teacher@example.edu']);assert.ok(first.text.includes(`/account/setup#invite=${decryptSetupToken(secret.ciphertext)}`));assert.match(first.text,/Maria Santos/);assert.match(first.text,/48 hours/);
});
test('only provider acceptance becomes Sent; retries preserve idempotency key',async()=>{
 const {db,saved}=backend();const keys:string[]=[];
 const transport={send:async(_payload:unknown,key:string)=>{keys.push(key);return {data:{id:job.id},error:null};}};
 assert.equal((await deliverInvitationEmail(job,'fixture',db,transport)).state,'sent');assert.equal((await deliverInvitationEmail(job,'fixture',db,transport)).state,'sent');assert.equal(keys[0],keys[1]);assert.equal(saved[0].p_provider_id,job.id);
 assert.match(emailStatusDetail({state:'sent',error_code:null,updated_at:''}),/not been confirmed/);assert.equal(emailStatusLabel.delivered,'Delivered');
});
test('restricted sender and rejected requests become Failed; ambiguous errors stay unconfirmed',async()=>{
 for(const [status,state,code] of [[403,'failed','restricted_sender'],[429,'failed','rate_limit'],[500,'unknown','unconfirmed'],[409,'unknown','unconfirmed']] as const){const {db,saved}=backend();const transport={send:async()=>({data:null,error:{statusCode:status,name:'provider-error'}})};assert.equal((await deliverInvitationEmail(job,'fixture',db,transport)).state,state);assert.equal(saved[0].p_error_code,code);}
 const {db,saved}=backend();assert.equal((await deliverInvitationEmail(job,'fixture',db,{send:async()=>{throw new Error('private key or URL must not appear in results');}})).state,'unknown');assert.equal(saved[0].p_state,'unknown');assert.doesNotMatch(JSON.stringify(saved),/private key|invite=/);
});
test('replaced links are never submitted; unsaved provider results are never reported as success',async()=>{
 const stale=backend(true);let sent=0;const transport={send:async()=>{sent++;return {data:{id:job.id},error:null};}};assert.equal((await deliverInvitationEmail(job,'fixture',stale.db,transport)).state,'failed');assert.equal(sent,0);
 const unavailable=backend(false,true);const result=await deliverInvitationEmail(job,'fixture',unavailable.db,transport);assert.equal(result.state,'unknown');assert.match(result.error!,/could not be saved/);
});
