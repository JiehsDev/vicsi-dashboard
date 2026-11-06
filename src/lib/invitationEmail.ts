import 'server-only';
import {Resend} from 'resend';
import {decryptSetupToken} from './accountSetupCrypto';
import {createSupabaseAdminClient} from './supabaseAdmin';
export function invitationEmailConfig(){
 const apiKey=process.env.RESEND_API_KEY?.trim(),sender=process.env.RESEND_FROM_EMAIL?.trim()||'onboarding@resend.dev';
 let origin='';try{const url=new URL(process.env.DASHBOARD_APP_URL??'');if(url.protocol==='https:'&&!url.username&&!url.password&&url.pathname==='/'&&!url.search&&!url.hash&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))origin=url.origin;}catch{/* Operator supplies the public origin. */}
 const validSender=/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(sender)&&sender.length<=254;
 return {apiKey,sender,origin,ready:!!apiKey&&!!origin&&validSender,webhooks:!!process.env.RESEND_WEBHOOK_SECRET};
}
type EmailJob={id:string;link_id:string;token_hash:string;token_ciphertext:string;recipient:string;recipient_name:string;sender:string;app_origin:string};
// Keep this v1 payload stable: uncertain retries reuse the same idempotency key and payload.
export function invitationEmailV1(job:EmailJob){
 const url=`${job.app_origin}/account/setup#invite=${decryptSetupToken(job.token_ciphertext)}`;
 return {from:`ViCSI <${job.sender}>`,to:[job.recipient],subject:'Your ViCSI instructor invitation',text:`Hello ${job.recipient_name},\n\nYou have been invited to the ViCSI instructor workspace at Partido State University. Set your password using this private, one-use link:\n\n${url}\n\nYour invitation expires 48 hours after it was created or replaced. Opening the link will not activate your account; finish choosing your password to continue.\n\nOnce your account is ready, sign in to review student investigations and manage your classes. If you were not expecting this invitation, you can ignore this email.\n\nViCSI — Virtual Crime Scene Investigation`};
}
export function safeEmailError(status:number,name?:string){
 if(status===403)return 'restricted_sender';if(status===429)return 'rate_limit';
 if(status===422&&name==='validation_error')return 'invalid_recipient';return 'provider_rejected';
}
export async function deliverInvitationEmail(job:EmailJob,apiKey:string,db=createSupabaseAdminClient(),transport?:{send:(payload:ReturnType<typeof invitationEmailV1>,key:string)=>Promise<{data:{id:string}|null;error:{statusCode?:number;name?:string}|null}>}){
 let state:'sent'|'failed'|'unknown'='unknown',providerId:string|null=null,errorCode:string|null='network';
 try{
  const current=await db.from('account_setup_links').select('token_hash,accepted_at,revoked_at,expires_at').eq('id',job.link_id).maybeSingle();
  if(current.error)throw new Error('UNAVAILABLE');
  if(!current.data||current.data.token_hash!==job.token_hash||current.data.accepted_at||current.data.revoked_at||Date.parse(current.data.expires_at)<=Date.now()){state='failed';errorCode='stale_link';}
  else{
   const payload=invitationEmailV1(job),key=`vicsi-instructor/${job.id}`;
   const result=transport?await transport.send(payload,key):await new Resend(apiKey).emails.send(payload,{idempotencyKey:key,signal:AbortSignal.timeout(12000)});
   if(result.data?.id){state='sent';providerId=result.data.id;errorCode=null;}
   else if(result.error){const status=result.error.statusCode??500;if(status>=500||status===409){state='unknown';errorCode='unconfirmed';}else{state='failed';errorCode=safeEmailError(status,result.error.name);}}
  }
 }catch{/* Do not log the payload, setup link, provider response, or credentials. */}
 const saved=await db.rpc('finish_invitation_email',{p_id:job.id,p_state:state,p_provider_id:providerId,p_error_code:errorCode});
 if(saved.error||saved.data!==true)return {state:'unknown' as const,error:'The email result could not be saved. Refresh before trying again; Copy link is still available.'};
 return {state};
}
