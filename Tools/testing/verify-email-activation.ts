// Read-only live checks. No email, invitation or user records are created.
import {createClient} from '@supabase/supabase-js';
import {invitationEmailConfig} from '../../src/lib/invitationEmail';
const url=process.env.SUPABASE_URL,anonKey=process.env.SUPABASE_ANON_KEY,serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!anonKey||!serviceKey)throw new Error('Configure the existing server environment before checking activation.');
const options={auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input:RequestInfo|URL,init?:RequestInit)=>fetch(input,{...init,signal:AbortSignal.timeout(10000)})}};
const anon=createClient(url,anonKey,options),service=createClient(url,serviceKey,options);
function check(label:string,passed:boolean){console.log(`${passed?'PASS':'FAIL'}: ${label}`);if(!passed)process.exitCode=1;}
try{
 for(const table of ['invitation_email_deliveries','invitation_email_events']){
  const result=await service.from(table).select('*').limit(0);check(`${table} installed`,!result.error);
  const denied=await anon.from(table).select('*').limit(0);check(`${table} denies anonymous reads`,denied.error?.code==='42501');
 }
 const id='00000000-0000-4000-8000-000000000000';
 for(const [name,args] of [
  ['admin_begin_invitation_email',{p_link_id:id,p_sender:'onboarding@resend.dev',p_app_origin:'https://example.invalid'}],
  ['admin_invitation_email_status',{p_ids:[]}],
  ['finish_invitation_email',{p_id:id,p_state:'unknown'}],
  ['record_invitation_email_event',{p_event_id:'readonly-permission-probe',p_provider_id:id,p_state:'sent',p_occurred_at:'2026-01-01T00:00:00Z'}],
 ] as const){
  // These calls must be rejected by EXECUTE permissions, before their function bodies run.
  const result=await anon.rpc(name,args);check(`${name} denies anonymous execution`,result.error?.code==='42501');
 }
}catch{console.error('Live verification could not finish: database connection unavailable.');process.exitCode=1;}
const config=invitationEmailConfig();
console.log('Resend API key present:',!!config.apiKey);
console.log('Public dashboard origin configured:',!!config.origin);
console.log('Webhook signing secret present:',config.webhooks);
console.log('Live email sending configured:',config.ready);
console.log('No emails sent; no application records changed.');
