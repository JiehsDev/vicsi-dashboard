import 'server-only';
import {createHmac} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {DashboardSession} from './dashboardSession';
import {canonicalJsonStringify} from './assessmentCrypto';

type Client=Pick<SupabaseClient,'auth'|'rpc'|'from'>;
type TableWatch={table:string;columns:string;order:string[]};
const academic:TableWatch[]=[
  {table:'assessment_sessions',columns:'session_id,student_id,class_id,verification_status,verified_score,verified_at_utc,server_received_at_utc,is_test_session',order:['session_id']},
  {table:'classes',columns:'id,name,section,academic_year,semester,archived_at,updated_at',order:['id']},
  {table:'class_enrollments',columns:'class_id,student_id,enrolled_at',order:['class_id','student_id']},
  {table:'profiles',columns:'id,full_name,role,student_id,section,updated_at,suspended_at',order:['id']},
  {table:'class_join_invites',columns:'class_id,enabled,updated_at',order:['class_id']},
];
const administrative:TableWatch[]=[
  {table:'system_administrators',columns:'user_id,full_name,active,updated_at',order:['user_id']},
  {table:'account_setup_links',columns:'id,purpose,full_name,expires_at,accepted_at,revoked_at',order:['id']},
  {table:'invitation_email_deliveries',columns:'id,state,updated_at',order:['id']},
];
export class RevisionError extends Error{constructor(public status:401|503){super(status===401?'Sign-in required':'Updates unavailable');}}
function digest(value:unknown){
  const key=process.env.DASHBOARD_SESSION_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!key)throw new RevisionError(503);
  return createHmac('sha256',key).update('dashboard-revision-v1:').update(canonicalJsonStringify(value)).digest('hex');
}
async function metadata(db:Client,watch:TableWatch):Promise<[string,unknown[]]>{
  const rows:unknown[]=[];
  for(let offset=0;;offset+=1000){
    let query=db.from(watch.table).select(watch.columns);
    for(const column of watch.order)query=query.order(column);
    const {data,error}=await query.range(offset,offset+999);
    if(error?.code==='42501')throw new RevisionError(401);
    if(error||!data)throw new RevisionError(503);
    rows.push(...data);if(data.length<1000)break;
  }
  return [watch.table,rows];
}
/** Reauthorize every check. Only HMAC digests leave the server; no rows or tokens. */
export async function getDashboardRevision(lease:DashboardSession|null,db:Client,adminClient:()=>Client){
  if(!lease)throw new RevisionError(401);
  const auth=await db.auth.getUser();
  if(auth.error){
    if(auth.error.name==='AuthRetryableFetchError'||!auth.error.status||auth.error.status>=500)throw new RevisionError(503);
    throw new RevisionError(401);
  }
  if(auth.data.user?.id!==lease.userId)throw new RevisionError(401);
  const identity=await db.rpc('get_my_account_profile');
  if(identity.error)throw new RevisionError(identity.error.code==='42501'?401:503);
  const profile=Array.isArray(identity.data)?identity.data[0]:identity.data;
  if(!profile||profile.id!==lease.userId||!['student','instructor','admin'].includes(profile.role))throw new RevisionError(401);
  // Service access is only constructed AFTER current admin membership is checked
  // by get_my_account_profile. Academic requests always use their own RLS client.
  const source=profile.role==='admin'?adminClient():db;
  const watched:Array<[string,unknown]>=await Promise.all([...academic,...(profile.role==='admin'?administrative:[])].map(watch=>metadata(source,watch)));
  if(profile.role==='admin'){
    const users:unknown[]=[];
    for(let page=1;;page++){
      const result=await db.rpc('admin_list_users',{p_page:page});
      if(result.error||!result.data||!Array.isArray(result.data.users))throw new RevisionError(503);
      users.push(...result.data.users);if(users.length>=result.data.total)break;
      if(!result.data.users.length)throw new RevisionError(503);
    }
    const audit=await db.from('system_audit_events').select('id,occurred_at',{count:'exact'}).order('occurred_at',{ascending:false}).order('id').limit(1);
    if(audit.error)throw new RevisionError(503);
    watched.push(['admin-users',users],['audit',{count:audit.count,latest:audit.data}]);
    const links=watched.find(([name])=>name==='account_setup_links')?.[1] as Array<{id:string;expires_at:string}>;
    watched.push(['link-expiration',links.map(link=>({id:link.id,expired:Date.parse(link.expires_at)<=Date.now()}))]);
  }
  const classRows=watched.find(([name])=>name==='classes')?.[1] as Array<{id:string}>;
  const scope=digest({user:lease.userId,startedAt:lease.startedAt,role:profile.role,classes:profile.role==='admin'?null:classRows.map(row=>row.id)});
  return {scope,revision:digest({scope,profile,watched})};
}
