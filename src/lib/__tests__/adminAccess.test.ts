import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resetAdminGuard} from '../../../Tools/testing/admin-guard-backend';
import {requireSystemAdmin} from '../admin';
import {changeAdminAccess} from '../../app/admin/access/actions';
import {updateManagedUser,manageSetupLink} from '../../app/admin/users/actions';
import {sendInstructorInvitation} from '../../app/admin/invitations/actions';
async function redirectOf(fn:()=>Promise<unknown>){try{await fn();}catch(error){const digest=(error as {digest?:string}).digest;if(digest?.startsWith('NEXT_REDIRECT;'))return new URL(digest.split(';')[2],'https://dashboard.invalid');throw error;}throw new Error('Expected redirect');}
test('anonymous users go to login; academic users cannot open admin data/actions',async()=>{
 const state=resetAdminGuard();state.userId=null;assert.equal((await redirectOf(requireSystemAdmin)).pathname,'/login');assert.equal(state.identityCalls,0);
 state.userId='student';assert.equal((await redirectOf(requireSystemAdmin)).pathname,'/');
 const form=new FormData();assert.equal((await redirectOf(()=>changeAdminAccess(form))).pathname,'/');assert.equal(state.writes.length,0);
 assert.equal((await redirectOf(()=>updateManagedUser(form))).pathname,'/');assert.equal((await redirectOf(()=>manageSetupLink(form))).pathname,'/');assert.equal(state.writes.length,0);
 assert.equal((await redirectOf(()=>sendInstructorInvitation('33333333-3333-4333-8333-333333333333'))).pathname,'/');assert.equal(state.writes.length,0);
});
test('user edits send only permitted fields and require a reason; invitations reject invalid operations',async()=>{
 const state=resetAdminGuard();state.identity={user_id:state.userId!,full_name:'Administrator'};
 const form=new FormData();form.set('userId','33333333-3333-4333-8333-333333333333');form.set('operation','edit');form.set('fullName','Ana Reyes');form.set('section','b');form.set('reason','Corrected official roster details');form.set('role','administrator');form.set('email','replacement@example.edu');
 assert.equal((await updateManagedUser(form)).ok,true);assert.deepEqual(state.writes[0],{p_user_id:'33333333-3333-4333-8333-333333333333',p_full_name:'Ana Reyes',p_section:'B',p_reason:'Corrected official roster details'});
 const before=state.writes.length;form.set('reason','short');assert.ok((await updateManagedUser(form)).error);form.set('operation','promote');assert.ok((await manageSetupLink(form)).error);assert.equal(state.writes.length,before);
});
test('identity must match the signed-in user; revocation is checked on the next request',async()=>{
 const state=resetAdminGuard();state.identity={user_id:'other-user',full_name:'Other'};assert.equal((await redirectOf(requireSystemAdmin)).pathname,'/');
 state.identity={user_id:state.userId!,full_name:'Administrator'};assert.equal((await requireSystemAdmin()).identity.full_name,'Administrator');
 state.identity=null;assert.equal((await redirectOf(requireSystemAdmin)).pathname,'/');assert.equal(state.identityCalls,3);
});
test('access mutations require valid fields, safe errors and the scoped database RPC',async()=>{
 const state=resetAdminGuard();state.identity={user_id:state.userId!,full_name:'Administrator'};
 const form=new FormData();form.set('userId','22222222-2222-4222-8222-222222222222');form.set('active','false');form.set('reason','Staff member reassigned to another department.');
 assert.equal((await redirectOf(()=>changeAdminAccess(form))).searchParams.get('updated'),'1');assert.equal(state.writes.length,1);assert.equal(state.writes[0].p_active,false);assert.deepEqual(state.invalidated,['/admin']);
 state.error='LAST_ADMIN: private SQL implementation';const failure=await redirectOf(()=>changeAdminAccess(form));assert.match(failure.searchParams.get('error')!,/last active/);assert.doesNotMatch(failure.href,/private|SQL/);
 form.set('reason','short');const before=state.writes.length;await redirectOf(()=>changeAdminAccess(form));assert.equal(state.writes.length,before);
});
