// Synthetic admin presentation only. No network, accounts, secrets or production reads.
import {auditFilters,type AuditEvent,type Administrator} from '../../src/lib/adminPresentation';
export const previewIdentity={user_id:'11111111-1111-4111-8111-111111111111',full_name:'ViCSI Administrator'};
const globals=globalThis as unknown as {__adminPreviewMode?:'empty'|'error'|'normal';__adminPreviewSignedIn?:boolean};
export async function getAdminIdentity(){return globals.__adminPreviewSignedIn?previewIdentity:null;}
export async function requireSystemAdmin(){return {identity:previewIdentity,db:{}};}
export async function getAdministratorList(){return {unavailable:globals.__adminPreviewMode==='error',rows:[
 {...previewIdentity,active:true,created_at:'2026-11-06T00:00:00Z',updated_at:'2026-11-06T00:00:00Z'},
 {user_id:'22222222-2222-4222-8222-222222222222',full_name:'Department Administrator with a longer display name',active:true,created_at:'2026-11-06T01:00:00Z',updated_at:'2026-11-06T01:00:00Z'},
 {user_id:'33333333-3333-4333-8333-333333333333',full_name:'Previous Administrator',active:false,created_at:'2026-11-01T00:00:00Z',updated_at:'2026-11-05T00:00:00Z'},
 ] as Administrator[]};}
export async function getAuditEvents(query:Record<string,string|undefined>={},size=20){
 const filters=auditFilters(query);const empty=globals.__adminPreviewMode==='empty'||!!filters.error;
 const all=Array.from({length:27},(_,i)=>({id:`event-${i}`,occurred_at:new Date(Date.UTC(2026,10,6,3,30-i)).toISOString(),actor_name:i%3?'Professor Reyes':'ViCSI Administrator',action:i%3?'class.updated':'admin.access.disabled',resource_type:i%3?'class':'administrator',resource_name:i%3?'Forensic investigation, documentation and evidence handling / Section A':'Department Administrator',reason:i%3?null:'Staff access changed following departmental reassignment.',changes:{before:i%3?{section:'A'}:{active:true},after:i%3?{section:'B'}:{active:false}}} as AuditEvent));
 const matching=empty?[]:all.filter(row=>!filters.type||row.resource_type===filters.type);
 return {filters,unavailable:globals.__adminPreviewMode==='error',total:matching.length,rows:matching.slice((filters.page-1)*size,filters.page*size)};
}
