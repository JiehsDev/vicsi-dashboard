import 'server-only';
import {redirect} from 'next/navigation';
import {createSupabaseServerClient} from './supabaseServer';
import {auditFilters,type Administrator,type AuditEvent} from './adminPresentation';
export type AdminIdentity={user_id:string;full_name:string};
export async function getAdminIdentity():Promise<AdminIdentity|null>{
 const db=await createSupabaseServerClient();
 const {data,error}=await db.rpc('get_system_admin_identity');
 const row=Array.isArray(data)?data[0]:data;return error||!row?null:row;
}
export async function requireSystemAdmin(){
 const db=await createSupabaseServerClient();const {data:{user}}=await db.auth.getUser();
 if(!user)redirect('/login');
 const identity=await getAdminIdentity();if(!identity||identity.user_id!==user.id)redirect('/');
 return {identity,db};
}
export async function getAdministratorList(){
 const {db}=await requireSystemAdmin();
 const {data,error}=await db.from('system_administrators').select('user_id,full_name,active,created_at,updated_at').order('created_at');
 return {rows:(data??[]) as Administrator[],unavailable:!!error};
}
export async function getAuditEvents(query:Record<string,string|undefined>={},size=20){
 const {db}=await requireSystemAdmin();const filters=auditFilters(query);
 if(filters.error)return {rows:[] as AuditEvent[],total:0,unavailable:false,filters};
 let request=db.from('system_audit_events').select('id,occurred_at,actor_name,action,resource_type,resource_name,reason,changes',{count:'exact'});
 if(filters.type)request=request.eq('resource_type',filters.type);
 // The UI labels Philippine time; use the same timezone boundaries for date filtering.
 if(filters.from)request=request.gte('occurred_at',`${filters.from}T00:00:00+08:00`);
 if(filters.to){const end=new Date(`${filters.to}T00:00:00+08:00`);end.setTime(end.getTime()+86400000);request=request.lt('occurred_at',end.toISOString());}
 const {data,error,count}=await request.order('occurred_at',{ascending:false}).order('id',{ascending:false}).range((filters.page-1)*size,filters.page*size-1);
 return {rows:(data??[]) as AuditEvent[],total:count??0,unavailable:!!error,filters};
}
