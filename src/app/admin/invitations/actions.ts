'use server';
import {revalidatePath} from 'next/cache';
import {requireSystemAdmin} from '@/lib/admin';
import {createSupabaseAdminClient} from '@/lib/supabaseAdmin';
import {deliverInvitationEmail,invitationEmailConfig} from '@/lib/invitationEmail';
export async function sendInstructorInvitation(id:string){
 const {db}=await requireSystemAdmin();
 if(!/^[0-9a-f-]{36}$/i.test(id))return {error:'Choose a valid invitation.'};
 const config=invitationEmailConfig();
 if(!config.ready||!config.apiKey)return {error:'Email sending is not configured. Copy the invitation link to share it now.'};
 const started=await db.rpc('admin_begin_invitation_email',{p_link_id:id,p_sender:config.sender,p_app_origin:config.origin});
 if(started.error){const message=started.error.message;return {error:message.startsWith('LINK_UNAVAILABLE:')?'This invitation is no longer active. Refresh the page.':message.startsWith('STATUS_UNKNOWN:')?'The previous send is too old to retry safely. Replace the link before sending another email.':message.startsWith('RATE_LIMITED:')?'Please wait before sending more invitations.':'Email sending is unavailable. Check migration 024, or copy the link to share it.'};}
 if(started.data?.busy)return {error:'A recent send is still being processed. Wait one minute and refresh before trying again.'};
 const admin=createSupabaseAdminClient();const job=await admin.from('invitation_email_deliveries').select('*').eq('id',started.data?.id).maybeSingle();
 if(job.error||!job.data)return {error:'The send request could not be opened. Refresh before trying again.'};
 const result=await deliverInvitationEmail(job.data,config.apiKey,admin);revalidatePath('/admin','layout');
 return result.error?{error:result.error}:{ok:true,state:result.state};
}
