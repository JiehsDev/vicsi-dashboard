import 'server-only';
import {randomUUID} from 'node:crypto';
import {hashSetupToken,validSetupToken} from './accountSetupCrypto';
import {createSupabaseAdminClient} from './supabaseAdmin';
type Backend=ReturnType<typeof createSupabaseAdminClient>;
/** A database lease serializes setup across app instances. Only our newly-created Auth account may be rolled back. */
export async function completeAccountSetup(token:unknown,password:unknown,db:Backend=createSupabaseAdminClient()){
 if(!validSetupToken(token)||typeof password!=='string'||password.length<12||password.length>128)return {error:'Use a valid setup link and a password of 12–128 characters.',status:400};
 const claimId=randomUUID();
 const {data:claim,error}=await db.rpc('claim_account_setup',{p_token_hash:hashSetupToken(token),p_claim_id:claimId});
 if(error)return {error:'Account setup is temporarily unavailable. Try again shortly.',status:503};
 if(!claim)return {error:'This link has expired, was revoked, or has already been used. Ask your administrator for a new link.',status:410};
 if(claim.busy)return {error:'Setup is already in progress. Wait a moment before trying again.',status:409};
 let newUserId:string|null=null,credentialsChanged=false;
 const finish=(userId:string|null,release=false)=>db.rpc('finish_account_setup',{p_id:claim.id,p_claim_id:claimId,p_user_id:userId,p_release:release});
 try{
  let userId=claim.target_user_id as string|null;
  if(claim.purpose==='instructor_invitation'){
   const created=await db.auth.admin.createUser({email:claim.email,password,email_confirm:true});
   if(created.error||!created.data.user)throw new Error('AUTH_FAILED');
   userId=created.data.user.id;newUserId=userId;
  }else{
   if(!userId)throw new Error('INVALID_TARGET');
   const changed=await db.auth.admin.updateUserById(userId,{password});
   if(changed.error)throw new Error('AUTH_FAILED');credentialsChanged=true;
  }
  const completed=await finish(userId);
  if(completed.error||completed.data!==true)throw new Error('FINALIZE_FAILED');
  return {ok:true,status:200};
 }catch{
  // A thrown transport error can also hide a committed transaction. Reconcile
  // every post-Auth failure before rolling back or releasing the claim.
  if(newUserId||credentialsChanged){
   try{
    const state=await db.from('account_setup_links').select('accepted_at').eq('id',claim.id).maybeSingle();
    if(state.error||!state.data)throw new Error('UNCONFIRMED');
    if(state.data.accepted_at)return {ok:true,status:200};
   }catch{return {error:'Your password may have been saved. Try signing in or contact your administrator before retrying.',status:503};}
  }
  if(newUserId){
   const removed=await db.auth.admin.deleteUser(newUserId);
   if(removed.error)return {error:'Account setup needs administrator assistance. Do not submit again; contact your administrator.',status:503};
  }
  try{await finish(null,true);}catch{/* A lost connection leaves the short claim lease to expire. */}
  return {error:credentialsChanged?'Your password changed, but the setup confirmation could not be saved. Try signing in, or ask your administrator for assistance.':'Setup could not be completed. Your link remains available; try again or contact your administrator.',status:503};
 }
}
