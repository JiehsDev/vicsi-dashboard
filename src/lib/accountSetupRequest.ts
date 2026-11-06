import 'server-only';
import {createSupabaseAdminClient} from './supabaseAdmin';
import {ipRateLimitKey} from './rateLimit';
export function setupResponse(body:unknown,status=200){return Response.json(body,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});}
export async function readSetupRequest(request:Request,backend?:ReturnType<typeof createSupabaseAdminClient>){
 let sameOrigin=false;
 try{const origin=new URL(request.headers.get('origin')??'');const host=request.headers.get('x-forwarded-host')??request.headers.get('host')??new URL(request.url).host;sameOrigin=['http:','https:'].includes(origin.protocol)&&origin.host===host;}catch{/* A missing or malformed Origin cannot submit setup. */}
 if(!sameOrigin)return {response:setupResponse({error:'Open this form on the ViCSI website.'},403)};
 if(!request.headers.get('content-type')?.startsWith('application/json'))return {response:setupResponse({error:'Invalid request.'},400)};
 // Bound memory before parsing untrusted password/token input, including chunked requests.
 const reader=request.body?.getReader();if(!reader)return {response:setupResponse({error:'Invalid request.'},400)};
 let content='',size=0;const decoder=new TextDecoder();
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2048){await reader.cancel();return {response:setupResponse({error:'Request is too large.'},413)};}content+=decoder.decode(value,{stream:true});}
 content+=decoder.decode();
 const db=backend??createSupabaseAdminClient();
 try{
  const {data,error}=await db.rpc('check_rate_limit',{p_bucket_key:ipRateLimitKey(request,'account-setup')??'account-setup:unknown',p_limit:20,p_window_seconds:60});
  const row=Array.isArray(data)?data[0]:data;
  if(error||typeof row?.allowed!=='boolean')return {response:setupResponse({error:'Account setup is temporarily unavailable.'},503)};
  if(!row.allowed)return {response:setupResponse({error:'Too many attempts. Please wait a minute.'},429)};
  let body;
  try{body=JSON.parse(content);if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('INVALID_BODY');}catch{return {response:setupResponse({error:'Invalid request.'},400)};}
  return {body,db};
 }catch{return {response:setupResponse({error:'Account setup is temporarily unavailable. Try again shortly.'},503)};}
}
