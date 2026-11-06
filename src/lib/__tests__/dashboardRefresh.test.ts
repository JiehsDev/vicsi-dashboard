import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DashboardRefreshState,isPublicDashboardPath,validRevisionSnapshot} from '../dashboardRefresh';
import {getDashboardRevision,RevisionError} from '../dashboardRevision';
process.env.DASHBOARD_SESSION_SECRET='isolated-cache-test-secret';
const a={scope:'a'.repeat(64),revision:'1'.repeat(64)},b={...a,revision:'2'.repeat(64)};
test('unchanged data reuses views; changes remain dirty until applied and cached tabs refresh separately',()=>{
 const state=new DashboardRefreshState();assert.equal(state.accept(a,'/results'),'baseline');assert.equal(state.accept(a,'/profile'),'unchanged');
 assert.equal(state.accept(b,'/profile'),'changed');assert.equal(state.accept(b,'/profile'),'changed');
 state.applied(b,'/profile');assert.equal(state.accept(b,'/profile'),'unchanged');assert.equal(state.accept(b,'/results'),'changed');
 state.applied(b,'/results');assert.equal(state.accept(b,'/results'),'unchanged');
 assert.equal(state.accept({...b,scope:'b'.repeat(64)}),'identity-changed');state.clear();assert.equal(state.scope,null);assert.equal(state.accept(a),'baseline');
});
test('authentication and account setup are public; only opaque valid snapshots are accepted',()=>{
 for(const path of ['/login','/signup','/account/setup'])assert.equal(isPublicDashboardPath(path),true);
 for(const path of ['/results','/profile','/admin'])assert.equal(isPublicDashboardPath(path),false);
 assert.equal(validRevisionSnapshot(a),true);for(const value of [null,{},'scope',{scope:'user-id',revision:'cache'},{scope:a.scope,revision:22}])assert.equal(validRevisionSnapshot(value),false);
});
type Client=Parameters<typeof getDashboardRevision>[1];
function fixture(role='student',overrides:{authError?:{name:string;status:number};mismatch?:boolean;missing?:boolean;rpcError?:boolean}={}){
 const reads:Array<{table:string;columns:string}>=[];let adminReads=0;
 const tables:Record<string,Record<string,unknown>[]>={assessment_sessions:[{session_id:'s',verified_score:1}],classes:[{id:'class-a',name:'Owned class'}],class_enrollments:[],profiles:[{id:'own-user',updated_at:'2026-11-06'}],system_administrators:[],account_setup_links:[],invitation_email_deliveries:[]};
 const base={auth:{getUser:async()=>({data:{user:{id:overrides.mismatch?'other-user':'own-user'}},error:overrides.authError??null})},rpc:async(name:string)=>name==='get_my_account_profile'?{data:overrides.missing?[]:[{id:'own-user',role}],error:overrides.rpcError?{code:'offline'}:null}:{data:{total:0,users:[]},error:null},from:(table:string)=>({select:(columns:string)=>{
  reads.push({table,columns});const query={order:()=>query,range:async()=>({data:tables[table]??[],error:null}),limit:async()=>({data:[],count:0,error:null})};return query;
 }})};
 const db=base as unknown as Client;return {db,tables,reads,admin:()=>{adminReads++;return db;},adminCount:()=>adminReads};
}
const lease={userId:'own-user',startedAt:100,activeAt:100};
test('academic revision reads use the user-scoped client and never request secrets or service access',async()=>{
 const f=fixture();const first=await getDashboardRevision(lease,f.db,f.admin);const second=await getDashboardRevision(lease,f.db,f.admin);
 assert.deepEqual(first,second);assert.deepEqual(Object.keys(first).sort(),['revision','scope']);assert.equal(f.adminCount(),0);
 assert.ok(f.reads.every(r=>!/(pin_hash|ciphertext|token_hash|access_code|password)/.test(r.columns)));
 f.tables.assessment_sessions[0].verified_score=.5;const changed=await getDashboardRevision(lease,f.db,f.admin);assert.equal(first.scope,changed.scope);assert.notEqual(first.revision,changed.revision);
});
test('a new signed-in session, identity, role or allowed-class set changes the cache scope',async()=>{
 const f=fixture();const first=await getDashboardRevision(lease,f.db,f.admin);
 const renewed=await getDashboardRevision({...lease,activeAt:200},f.db,f.admin);assert.equal(first.scope,renewed.scope);
 const fresh=await getDashboardRevision({...lease,startedAt:101},f.db,f.admin);assert.notEqual(first.scope,fresh.scope);
 f.tables.classes=[];const unenrolled=await getDashboardRevision(lease,f.db,f.admin);assert.notEqual(first.scope,unenrolled.scope);
});
test('invalid sessions, suspended identities and unavailable auth cannot populate a cache',async()=>{
 const signedOut=fixture();await assert.rejects(getDashboardRevision(null,signedOut.db,signedOut.admin),(e:unknown)=>e instanceof RevisionError&&e.status===401);assert.equal(signedOut.reads.length,0);
 for(const overrides of [{mismatch:true},{missing:true}]){const f=fixture('student',overrides);await assert.rejects(getDashboardRevision(lease,f.db,f.admin),(e:unknown)=>e instanceof RevisionError&&e.status===401);assert.equal(f.reads.length,0);assert.equal(f.adminCount(),0);}
 const unavailable=fixture('student',{authError:{name:'AuthRetryableFetchError',status:503}});await assert.rejects(getDashboardRevision(lease,unavailable.db,unavailable.admin),(e:unknown)=>e instanceof RevisionError&&e.status===503);assert.equal(unavailable.reads.length,0);
});
test('privileged metadata is restricted to a current administrator; failed role checks never construct it',async()=>{
 const allowed=fixture('admin');await getDashboardRevision(lease,allowed.db,allowed.admin);assert.equal(allowed.adminCount(),1);assert.ok(allowed.reads.some(r=>r.table==='invitation_email_deliveries'));
 const denied=fixture('admin',{rpcError:true});await assert.rejects(getDashboardRevision(lease,denied.db,denied.admin));assert.equal(denied.adminCount(),0);
});
test('invitation expiry changes the revision even without a database write',async()=>{
 const f=fixture('admin'),now=Date.now();f.tables.account_setup_links=[{id:'link',expires_at:new Date(now+60000).toISOString()}];
 const before=await getDashboardRevision(lease,f.db,f.admin);const original=Date.now;
 try{Date.now=()=>now+120000;const after=await getDashboardRevision(lease,f.db,f.admin);assert.equal(before.scope,after.scope);assert.notEqual(before.revision,after.revision);}finally{Date.now=original;}
});
