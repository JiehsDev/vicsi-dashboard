import {Resend} from 'resend';
import {createSupabaseAdminClient} from '@/lib/supabaseAdmin';
export const runtime='nodejs';
export async function POST(request:Request){
 const secret=process.env.RESEND_WEBHOOK_SECRET;if(!secret)return new Response('Webhook unavailable',{status:503});
 const reader=request.body?.getReader();if(!reader)return new Response('Invalid request',{status:400});
 let payload='',size=0;const decoder=new TextDecoder();
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536){await reader.cancel();return new Response('Payload too large',{status:413});}payload+=decoder.decode(value,{stream:true});}payload+=decoder.decode();
 let event;
 try{event=new Resend(process.env.RESEND_API_KEY||'verification-only').webhooks.verify({payload,headers:{id:request.headers.get('svix-id')??'',timestamp:request.headers.get('svix-timestamp')??'',signature:request.headers.get('svix-signature')??''},webhookSecret:secret});}catch{return new Response('Invalid signature',{status:400});}
 const states:Record<string,string>={'email.sent':'sent','email.delivered':'delivered','email.delivery_delayed':'delayed','email.bounced':'bounced','email.failed':'failed','email.complained':'complained','email.suppressed':'suppressed'};
 const state=states[event.type];if(!state)return new Response(null,{status:204});
 const emailId=event.data&&typeof event.data==='object'&&'email_id' in event.data?event.data.email_id:null;
 if(typeof emailId!=='string'||!/^[0-9a-f-]{36}$/i.test(emailId)||!Number.isFinite(Date.parse(event.created_at)))return new Response('Invalid event',{status:400});
 const result=await createSupabaseAdminClient().rpc('record_invitation_email_event',{p_event_id:request.headers.get('svix-id'),p_provider_id:emailId,p_state:state,p_occurred_at:event.created_at});
 return result.error?new Response('Event could not be saved',{status:503}):new Response(null,{status:204});
}
