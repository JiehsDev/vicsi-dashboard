'use server';
import {revalidatePath} from 'next/cache';
import {requireSystemAdmin} from '@/lib/admin';
import {createSupabaseAdminClient} from '@/lib/supabaseAdmin';
import {decryptSetupToken,newSetupToken} from '@/lib/accountSetupCrypto';
import {sendInstructorInvitation} from '@/app/admin/invitations/actions';
import {invitationEmailConfig} from '@/lib/invitationEmail';
export type AdminUserResult={ok?:boolean;error?:string;token?:string;origin?:string;notice?:string};
const uuid=(value:unknown)=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function errorMessage(message:string){
 for(const [prefix,text] of Object.entries({ACCOUNT_EXISTS:'This email already has an account. Open Users to manage it.',DUPLICATE_INVITE:'An unfinished link already exists. Replace or revoke it in the list.',SETUP_BUSY:'The recipient is completing setup. Please try again in a few minutes.',PROTECTED_ACCOUNT:'Use Administrator access to manage this account.',LINK_UNAVAILABLE:'This link is no longer active. Refresh the page.',VALIDATION_ERROR:'Check the details and enter a reason of 10–500 characters where requested.',UNAUTHORIZED:'Your administrator access is no longer active.'}))if(message.startsWith(prefix+':'))return text;
 return 'The change could not be saved. Refresh and try again.';
}
export async function updateManagedUser(form:FormData):Promise<AdminUserResult>{
 const {db}=await requireSystemAdmin();const id=form.get('userId'),operation=form.get('operation'),reason=String(form.get('reason')??'').trim();
 if(!uuid(id)||reason.length<10||reason.length>500)return {error:'Choose a valid user and enter a reason of 10–500 characters.'};
 let result;
 if(operation==='edit'){
  const name=String(form.get('fullName')??'').trim(),section=String(form.get('section')??'').trim().toUpperCase();
  if(!name||name.length>200)return {error:'Enter a name of 1–200 characters.'};
  result=await db.rpc('admin_update_user_profile',{p_user_id:id,p_full_name:name,p_section:section,p_reason:reason});
 }else if(operation==='suspend'||operation==='restore')result=await db.rpc('admin_set_user_suspended',{p_user_id:id,p_suspended:operation==='suspend',p_reason:reason});
 else return {error:'Choose a valid action.'};
 if(result.error)return {error:errorMessage(result.error.message)};
 revalidatePath('/admin','layout');return {ok:true};
}
export async function manageSetupLink(form:FormData):Promise<AdminUserResult>{
 const {db}=await requireSystemAdmin();const operation=String(form.get('operation')??''),id=form.get('id'),target=form.get('userId');
 if(!['invite','recover','replace','revoke','copy'].includes(operation))return {error:'Choose a valid action.'};
 if(['copy','replace','revoke'].includes(operation)&&!uuid(id))return {error:'Choose a valid link.'};
 if(operation==='copy'){
  const {data,error}=await createSupabaseAdminClient().from('account_setup_links').select('token_ciphertext,accepted_at,revoked_at,expires_at').eq('id',id).maybeSingle();
  if(error||!data||data.accepted_at||data.revoked_at||Date.parse(data.expires_at)<=Date.now())return {error:'This link is no longer active. Refresh the page.'};
  try{return {ok:true,token:decryptSetupToken(data.token_ciphertext),origin:invitationEmailConfig().origin||undefined};}catch{return {error:'The link could not be opened. Replace it to create a new link.'};}
 }
 if(operation==='recover'&&!uuid(target))return {error:'Choose a valid user.'};
 const secret=operation==='revoke'?null:newSetupToken();
 const {data,error}=await db.rpc('admin_account_setup',{p_operation:operation,p_id:uuid(id)?id:null,p_email:String(form.get('email')??'').trim(),p_full_name:String(form.get('fullName')??'').trim(),p_target_user_id:operation==='recover'?target:null,p_token_hash:secret?.hash??null,p_ciphertext:secret?.ciphertext??null,p_reason:String(form.get('reason')??'').trim()});
 if(error)return {error:errorMessage(error.message)};
 if((operation==='invite'||operation==='replace')&&form.get('sendEmail')==='true'){
  let notice='Invitation saved. The email result could not be confirmed. Copy link is still available.';
  try{const email=await sendInstructorInvitation(String(data));notice=email.error?`Invitation saved. ${email.error}`:email.state==='sent'?'Invitation saved. Email sent through Resend. Copy link remains available.':email.state==='failed'?'Invitation saved, but the email failed. Check the email status or use Copy link.':'Invitation saved. The email result is unconfirmed. Check its status before trying again.';}catch{/* Preserve a successfully-created link even when transport fails. */}
  revalidatePath('/admin','layout');return {ok:true,notice};
 }
 revalidatePath('/admin','layout');return {ok:true};
}
