import {cookies} from 'next/headers';
import {NextResponse} from 'next/server';
import {createSupabaseServerClient} from '@/lib/supabaseServer';
import {createSupabaseAdminClient} from '@/lib/supabaseAdmin';
import {DASHBOARD_SESSION_COOKIE,readDashboardSession,isSupabaseAuthCookie} from '@/lib/dashboardSession';
import {getDashboardRevision,RevisionError} from '@/lib/dashboardRevision';
export async function GET(){
  const headers={'Cache-Control':'private, no-store','Vary':'Cookie'};
  try{
    const lease=readDashboardSession((await cookies()).get(DASHBOARD_SESSION_COOKIE)?.value);
    const snapshot=await getDashboardRevision(lease,await createSupabaseServerClient(),createSupabaseAdminClient);
    return NextResponse.json(snapshot,{headers});
  }catch(error){
    const status=error instanceof RevisionError?error.status:503;
    const response=NextResponse.json({error:status===401?'Sign-in required':'Updates unavailable'},{status,headers});
    if(status===401)for(const {name} of (await cookies()).getAll()){
      if(name===DASHBOARD_SESSION_COOKIE||isSupabaseAuthCookie(name))response.cookies.set(name,'',{path:'/',maxAge:0});
    }
    return response;
  }
}
