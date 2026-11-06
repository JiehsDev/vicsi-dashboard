import "server-only";
import {createSupabaseServerClient} from "./supabaseServer";
export type ClassInvite={join_code:string;invite_token:string;enabled:boolean};
export async function getClassInvite(classId:string):Promise<{invite:ClassInvite|null;unavailable:boolean}>{
  const db=await createSupabaseServerClient();
  const {data,error}=await db.from("class_join_invites").select("join_code,invite_token,enabled").eq("class_id",classId).maybeSingle();
  return {invite:error?null:data,unavailable:!!error};
}
