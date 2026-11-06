import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newSetupToken,decryptSetupToken,hashSetupToken,validSetupToken} from '../accountSetupCrypto';
import {completeAccountSetup} from '../completeAccountSetup';
import {readSetupRequest} from '../accountSetupRequest';
process.env.DASHBOARD_SESSION_SECRET='local-unit-tests-only-key-not-a-production-secret';
test('setup tokens are unique, authenticated and recoverable without storing plaintext',()=>{
 const first=newSetupToken(),second=newSetupToken(),token=decryptSetupToken(first.ciphertext);
 assert.ok(validSetupToken(token));assert.equal(hashSetupToken(token),first.hash);assert.notEqual(first.hash,second.hash);assert.ok(!first.ciphertext.includes(token));
 assert.throws(()=>decryptSetupToken('A'+first.ciphertext.slice(1)));
 const old=process.env.DASHBOARD_SESSION_SECRET;process.env.DASHBOARD_SESSION_SECRET='different-key';assert.throws(()=>decryptSetupToken(first.ciphertext));process.env.DASHBOARD_SESSION_SECRET=old;
 assert.equal(validSetupToken('short'),false);
});
function backend(options:{purpose?:string;claim?:string;authError?:boolean;finalError?:boolean;persisted?:boolean;lookupError?:boolean;deleteError?:boolean}={}){
 const calls:string[]=[];const db={
  rpc:async(name:string,args:Record<string,unknown>)=>{calls.push(args.p_release?'release':name);if(name==='claim_account_setup')return {data:options.claim==='invalid'?null:options.claim==='busy'?{busy:true}:{id:'link',purpose:options.purpose??'instructor_invitation',email:'teacher@example.edu',name:'Professor',target_user_id:'existing-user'},error:null};return {data:!options.finalError,error:options.finalError?{message:'private database details'}:null};},
  auth:{admin:{createUser:async()=>{calls.push('create');return {data:{user:options.authError?null:{id:'new-user'}},error:options.authError?{message:'private auth details'}:null};},updateUserById:async()=>{calls.push('update');return {error:options.authError?{}:null};},deleteUser:async(id:string)=>{calls.push('delete:'+id);return {error:options.deleteError?{}:null};}}},
  from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{accepted_at:options.persisted?'2026-11-06':null},error:options.lookupError?{}:null})})})})
 };return {calls,db:db as never};
}
const token='x'.repeat(43),password='A long unique passphrase';
test('invalid, expired or busy links never change credentials',async()=>{
 for(const claim of ['invalid','busy']){const {db,calls}=backend({claim});assert.ok((await completeAccountSetup(token,password,db)).error);assert.equal(calls.length,1);}
 const {db,calls}=backend();assert.equal((await completeAccountSetup(token,'short',db)).status,400);assert.equal(calls.length,0);
});
test('invitation creates a new identity while recovery only updates its bound identity',async()=>{
 const invited=backend();assert.equal((await completeAccountSetup(token,password,invited.db)).ok,true);assert.deepEqual(invited.calls,['claim_account_setup','create','finish_account_setup']);
 const recovered=backend({purpose:'password_recovery'});assert.equal((await completeAccountSetup(token,password,recovered.db)).ok,true);assert.deepEqual(recovered.calls,['claim_account_setup','update','finish_account_setup']);
});
test('Auth rejection releases the claim without deleting or overwriting existing users',async()=>{
 const {db,calls}=backend({authError:true});const result=await completeAccountSetup(token,password,db);assert.equal(result.status,503);assert.deepEqual(calls,['claim_account_setup','create','release']);assert.doesNotMatch(result.error!,/private/);
});
test('failed finalization rolls back only the newly created account',async()=>{
 const {db,calls}=backend({finalError:true});assert.equal((await completeAccountSetup(token,password,db)).status,503);assert.deepEqual(calls,['claim_account_setup','create','finish_account_setup','delete:new-user','release']);
 const recovery=backend({purpose:'password_recovery',finalError:true});assert.match((await completeAccountSetup(token,password,recovery.db)).error!,/password changed/);assert.ok(!recovery.calls.some(call=>call.startsWith('delete')));
});
test('ambiguous successful commits and unavailable reconciliation never delete accounts',async()=>{
 const committed=backend({finalError:true,persisted:true});assert.equal((await completeAccountSetup(token,password,committed.db)).ok,true);assert.ok(!committed.calls.some(call=>call.startsWith('delete')));
 const unavailable=backend({finalError:true,lookupError:true});assert.equal((await completeAccountSetup(token,password,unavailable.db)).status,503);assert.ok(!unavailable.calls.some(call=>call.startsWith('delete')));
});
test('public setup rejects cross-origin and oversized input; limiter errors fail closed',async()=>{
 const request=(body:string,origin='https://dashboard.example')=>new Request('https://dashboard.example/api/account/setup/preview',{method:'POST',headers:{origin,'Content-Type':'application/json'},body});
 assert.equal((await readSetupRequest(request('{}','https://outside.example'))).response?.status,403);
 assert.equal((await readSetupRequest(request('x'.repeat(2049)))).response?.status,413);
 const failed={rpc:async()=>({data:null,error:{message:'private database details'}})} as never;
 const fail=await readSetupRequest(request('{}'),failed);assert.equal(fail.response?.status,503);assert.doesNotMatch(await fail.response!.text(),/private/);
 const limited={rpc:async()=>({data:[{allowed:false}],error:null})} as never;assert.equal((await readSetupRequest(request('{}'),limited)).response?.status,429);
 const allowed={rpc:async()=>({data:[{allowed:true}],error:null})} as never;assert.deepEqual((await readSetupRequest(request('{"token":"value"}'),allowed)).body,{token:'value'});
 assert.equal((await readSetupRequest(request('not json'),allowed)).response?.status,400);
 const proxied=new Request('http://localhost:3000/api/account/setup/preview',{method:'POST',headers:{origin:'https://dashboard.example','x-forwarded-host':'dashboard.example','Content-Type':'application/json'},body:'{}'});assert.deepEqual((await readSetupRequest(proxied,allowed)).body,{});
});
