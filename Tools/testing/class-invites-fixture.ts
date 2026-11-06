// Synthetic invitation/student views; no database access.
const globals=globalThis as unknown as {__vicsiInviteStatus?:string;__vicsiInviteEmpty?:boolean};
export async function getClassInvite(){return {invite:globals.__vicsiInviteEmpty?null:{join_code:"ABCDE23456",invite_token:"a".repeat(64),enabled:true},unavailable:false};}
export async function createSupabaseServerClient(){return {
  auth:{getUser:async()=>({data:{user:{id:"student"}}})},
  rpc:async()=>({error:null,data:[{status:globals.__vicsiInviteStatus??"ready",class_id:"class-a",class_name:"Forensic investigation",class_section:"A",instructor_name:"Professor Reyes",academic_year:"2026-2027",semester:"1st"}]}),
  from:()=>({select:()=>({order:async()=>({error:null,data:[{id:"class-a",name:"Forensic investigation",section:"A",academic_year:"2026-2027",semester:"1st",archived_at:null}]})})}),
};}
