import 'server-only';
import {createClient} from '@supabase/supabase-js';
import {cookies} from 'next/headers';
import {createSupabaseServerClient} from './supabaseServer';
import {createSupabaseAdminClient} from './supabaseAdmin';
import {DASHBOARD_SESSION_COOKIE,isSupabaseAuthCookie,readDashboardSession} from './dashboardSession';
import {timeoutFetch} from './timeoutFetch';
import type {AccountProfile,ProfileBackend} from './profileManagement';

export async function createProfileBackend():Promise<ProfileBackend> {
  const db=await createSupabaseServerClient();
  const admin=createSupabaseAdminClient();
  return {
    async identity(){
      const {data:{user},error}=await db.auth.getUser();
      const lease=readDashboardSession((await cookies()).get(DASHBOARD_SESSION_COOKIE)?.value);
      if(error || !user || lease?.userId!==user.id)return null;
      const {data,error:profileError}=await db.rpc('get_my_account_profile');
      const row=Array.isArray(data)?data[0]:data;
      if(profileError || !row || row.id!==user.id || !['student','instructor','admin'].includes(row.role))return null;
      return {id:user.id,fullName:row.full_name,role:row.role,studentId:row.student_id,section:row.section,email:user.email??null} as AccountProfile;
    },
    async allow(id){
      // Fail closed; do not reuse the gameplay limiter's fail-open behavior.
      const {data,error}=await admin.rpc('check_rate_limit',{p_bucket_key:`profile-security:${id}`,p_limit:5,p_window_seconds:600});
      const row=Array.isArray(data)?data[0]:data;
      return !error && row?.allowed===true;
    },
    async verifyPassword(email,password,id){
      // Never replace browser cookies while verifying credentials. Respect existing MFA assurance.
      const assurance=await db.auth.mfa.getAuthenticatorAssuranceLevel();
      if(assurance.error || (assurance.data?.nextLevel==='aal2' && assurance.data.currentLevel!=='aal2'))return false;
      const verifier=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{
        auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:timeoutFetch},
      });
      try{
        const {data,error}=await verifier.auth.signInWithPassword({email,password});
        return !error && data.user?.id===id;
      }finally{await verifier.auth.signOut({scope:'local'}).catch(()=>{});}
    },
    async changeName(name){const {data,error}=await db.rpc('update_my_account_name',{p_full_name:name});return !error&&data===true;},
    async changePassword(password,currentPassword){const {error}=await db.auth.updateUser({password,current_password:currentPassword});return !error;},
    async changePin(id,pin){const {data,error}=await admin.rpc('change_verified_student_pin',{p_user_id:id,p_pin:pin});return !error&&data===true;},
    async revoke(scope){const {error}=await db.auth.signOut({scope});return !error;},
    async audit(id,event){const {data,error}=await admin.rpc('record_account_security_event',{p_user_id:id,p_event:event});return !error&&data===true;},
    async clearBrowserSession(){
      const store=await cookies();
      for(const {name} of store.getAll())if(name===DASHBOARD_SESSION_COOKIE||isSupabaseAuthCookie(name))store.set(name,'',{path:'/',maxAge:0});
    },
  };
}
