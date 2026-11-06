import {test} from 'node:test';
import assert from 'node:assert/strict';
import {performProfileAction,type ProfileBackend,type AccountProfile} from '../profileManagement';
const user:AccountProfile={id:'trusted-user',fullName:'Ana Reyes',role:'student',studentId:'2026-001',section:'A',email:'internal@students.traceboard.internal'};
function setup(overrides:Partial<ProfileBackend>={}){
  const calls:unknown[][]=[];
  const backend:ProfileBackend={
    identity:async()=>user,allow:async id=>{calls.push(['limit',id]);return true;},
    verifyPassword:async(...args)=>{calls.push(['verify',...args]);return true;},
    changeName:async name=>{calls.push(['name',name]);return true;},
    changePassword:async(...args)=>{calls.push(['password',...args]);return true;},
    changePin:async(...args)=>{calls.push(['pin',...args]);return true;},
    revoke:async scope=>{calls.push(['revoke',scope]);return true;},
    audit:async(...args)=>{calls.push(['audit',...args]);return true;},
    clearBrowserSession:async()=>{calls.push(['clear']);},...overrides,
  };
  const run=async(operation:string,fields:Record<string,string>={})=>{
    const form=new FormData();Object.entries({operation,currentPassword:'old password',...fields}).forEach(([key,value])=>form.set(key,value));
    return performProfileAction(form,backend);
  };
  return {calls,run};
}
test('signed-out callers and invalid operations cannot mutate accounts',async()=>{
  const a=setup({identity:async()=>null});assert.equal((await a.run('name',{fullName:'Intruder'})).ok,false);assert.deepEqual(a.calls,[]);
  const b=setup();assert.equal((await b.run('role',{role:'admin'})).ok,false);assert.deepEqual(b.calls,[]);
});
test('form-supplied identity and privilege fields never reach the backend',async()=>{
  const s=setup();assert.equal((await s.run('name',{fullName:' Ana Santos ',userId:'victim',role:'admin',section:'Z',studentId:'stolen'})).ok,true);
  assert.deepEqual(s.calls,[['limit',user.id],['name','Ana Santos']]);
});
test('all mutations fail closed when the shared limiter is unavailable or exhausted',async()=>{
  for(const op of ['name','password','pin','sessions']){
    const s=setup({allow:async()=>false});const result=await s.run(op,{fullName:'Ana',newPassword:'A fresh unique passphrase',confirmPassword:'A fresh unique passphrase',newPin:'5729',confirmPin:'5729'});
    assert.equal(result.ok,false);assert.deepEqual(s.calls,[]);
  }
});
test('wrong current password blocks every credential and session operation',async()=>{
  for(const op of ['password','pin','sessions']){
    const s=setup({verifyPassword:async()=>false});assert.equal((await s.run(op,{newPassword:'A fresh unique passphrase',confirmPassword:'A fresh unique passphrase',newPin:'5729',confirmPin:'5729'})).ok,false);
    assert.deepEqual(s.calls,[['limit',user.id]]);
  }
});
test('password validation rejects mismatch, short, overlong and unchanged secrets',async()=>{
  for(const [password,confirm] of [['tiny','tiny'],['valid long password','different'],['x'.repeat(129),'x'.repeat(129)],['old password','old password']]){
    const s=setup();assert.equal((await s.run('password',{newPassword:password,confirmPassword:confirm})).ok,false);assert.deepEqual(s.calls,[]);
  }
});
test('successful password change revokes global sessions, audits and clears browser cookies',async()=>{
  const s=setup();const result=await s.run('password',{newPassword:'A fresh unique passphrase',confirmPassword:'A fresh unique passphrase'});
  assert.equal(result.ok,true);assert.equal(result.signedOut,true);
  assert.deepEqual(s.calls.map(c=>c[0]),['limit','verify','password','revoke','audit','clear']);
  assert.deepEqual(s.calls[3],['revoke','global']);assert.deepEqual(s.calls[4],['audit',user.id,'password']);
});
test('partial failure after a password change never tells users the password was unchanged',async()=>{
  const s=setup({revoke:async()=>false,audit:async()=>{throw Error('outage');}});
  const result=await s.run('password',{newPassword:'A fresh unique passphrase',confirmPassword:'A fresh unique passphrase'});
  assert.equal(result.ok,true);assert.equal(result.signedOut,true);assert.match(result.message,/password changed/);assert.match(result.message,/could not be confirmed/);assert.deepEqual(s.calls.at(-1),['clear']);
});
test('provider rejection does not sign out the user or record a successful change',async()=>{
  const s=setup({changePassword:async()=>false});assert.equal((await s.run('password',{newPassword:'A fresh unique passphrase',confirmPassword:'A fresh unique passphrase'})).ok,false);
  assert.deepEqual(s.calls.map(c=>c[0]),['limit','verify']);
});
test('PIN changes are student-only and reject malformed, mismatched and trivial PINs',async()=>{
  for(const role of ['admin','instructor'] as const){const s=setup({identity:async()=>({...user,role})});assert.equal((await s.run('pin',{newPin:'5729',confirmPin:'5729'})).ok,false);assert.deepEqual(s.calls,[]);}
  for(const pin of ['1234','0000','4321','12','abcd','12345']){const s=setup();assert.equal((await s.run('pin',{newPin:pin,confirmPin:pin})).ok,false);assert.deepEqual(s.calls,[]);}
});
test('PIN changes use the authenticated UUID and do not rotate VR access codes or delete history',async()=>{
  const s=setup();const result=await s.run('pin',{userId:'victim',email:'victim@example.edu',newPin:'5729',confirmPin:'5729'});
  assert.equal(result.ok,true);assert.deepEqual(s.calls,[['limit',user.id],['verify',user.email,'old password',user.id],['pin',user.id,'5729']]);
});
test('other-session signout keeps this browser signed in and explains token expiry',async()=>{
  const s=setup();const result=await s.run('sessions');assert.equal(result.ok,true);assert.match(result.message,/until they expire/);
  assert.deepEqual(s.calls.at(-2),['revoke','others']);assert.deepEqual(s.calls.at(-1),['audit',user.id,'sessions']);assert.ok(!s.calls.some(c=>c[0]==='clear'));
});
