"use server";
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {requireSystemAdmin} from '@/lib/admin';
export async function changeAdminAccess(form:FormData){
 const {db}=await requireSystemAdmin();
 const active=form.get('active');const reason=String(form.get('reason')??'').trim();const userId=String(form.get('userId')??'');
 let message:string|undefined;
 if(!['true','false'].includes(String(active))||reason.length<10||reason.length>500||!/^[0-9a-f-]{36}$/i.test(userId))message='Enter a valid account and a reason between 10 and 500 characters.';
 if(!message){
  const {error}=await db.rpc('set_system_admin_access',{p_user_id:userId,p_active:active==='true',p_reason:reason});
  if(error)message=error.message.startsWith('LAST_ADMIN:')?'The last active administrator must retain access.':error.message.startsWith('UNAUTHORIZED:')?'Your administrator access is no longer active.':"Access couldn't be changed. Please try again.";
 }
 if(message)redirect(`/admin/access?error=${encodeURIComponent(message)}`);
 revalidatePath('/admin','layout');redirect('/admin/access?updated=1');
}
