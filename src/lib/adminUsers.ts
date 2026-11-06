import 'server-only';
import {requireSystemAdmin} from './admin';
import {createSupabaseAdminClient} from './supabaseAdmin';
import type {InvitationEmailStatus} from './invitationEmailPresentation';
export type ManagedUser={user_id:string;full_name:string;role:'student'|'instructor'|'administrator';email:string|null;student_id:string|null;section:string|null;suspended_at:string|null;created_at:string;last_sign_in_at:string|null;classes?:{id:string;name:string;section:string|null}[]};
export type SetupLink={id:string;purpose:'instructor_invitation'|'password_recovery';full_name:string;email:string;target_user_id:string|null;created_at:string;expires_at:string;accepted_at:string|null;revoked_at:string|null};
export function userFilters(query:Record<string,string|undefined>){
 const page=Number(query.page);return {search:(query.q??'').trim().slice(0,100),role:['student','instructor','administrator'].includes(query.role??'')?query.role!:'',status:['active','suspended'].includes(query.status??'')?query.status!:'',page:Number.isSafeInteger(page)&&page>0?Math.min(page,100000):1};
}
export async function getManagedUsers(query:Record<string,string|undefined>={}){
 const {db}=await requireSystemAdmin(),filters=userFilters(query);
 const {data,error}=await db.rpc('admin_list_users',{p_search:filters.search,p_role:filters.role,p_status:filters.status,p_page:filters.page});
 return {users:(data?.users??[]) as ManagedUser[],total:Number(data?.total??0),unavailable:!!error,filters};
}
export async function getManagedUser(id:string){
 const {db}=await requireSystemAdmin();if(!/^[0-9a-f-]{36}$/i.test(id))return {user:null,unavailable:false};
 const {data,error}=await db.rpc('admin_get_user',{p_user_id:id});return {user:data as ManagedUser|null,unavailable:!!error};
}
export async function getSetupLinks(purpose:SetupLink['purpose'],target?:string,page=1){
 const {db}=await requireSystemAdmin();
 page=Number.isSafeInteger(page)&&page>0?Math.min(page,100000):1;
 let request=createSupabaseAdminClient().from('account_setup_links').select('id,purpose,full_name,email,target_user_id,created_at,expires_at,accepted_at,revoked_at',{count:'exact'}).eq('purpose',purpose).order('created_at',{ascending:false}).order('id').range((page-1)*20,page*20-1);
 if(target)request=request.eq('target_user_id',target);
 const {data,error,count}=await request;
 const emails:Record<string,InvitationEmailStatus>={};let emailUnavailable=false;
 if(purpose==='instructor_invitation'&&data?.length){
  const result=await db.rpc('admin_invitation_email_status',{p_ids:data.map(row=>row.id)});
  emailUnavailable=!!result.error;
  for(const row of result.data??[])emails[row.link_id]=row as InvitationEmailStatus;
 }
 return {links:(data??[]) as SetupLink[],unavailable:!!error,total:count??0,page,emails,emailUnavailable};
}
export function setupLinkStatus(row:SetupLink){return row.accepted_at?'Completed':row.revoked_at?'Revoked':Date.parse(row.expires_at)<=Date.now()?'Expired':'Active';}
