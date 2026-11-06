"use server";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {createSupabaseServerClient} from "@/lib/supabaseServer";
import {classJoinReturnPath,classInviteMessage} from "@/lib/classInvites";

export async function joinClassAction(form:FormData){
  const destination=classJoinReturnPath(String(form.get("returnTo")??""));
  if(!destination)redirect("/results/classes?error=Invalid+class+invitation.");
  const url=new URL(destination,"https://vicsi.invalid");
  const db=await createSupabaseServerClient();
  const {data:{user}}=await db.auth.getUser();
  if(!user)redirect(`/login?next=${encodeURIComponent(destination)}`);
  const {data,error}=await db.rpc("student_class_invitation",{p_code:url.searchParams.get("code"),p_token:url.searchParams.get("invite"),p_join:true});
  const row=Array.isArray(data)?data[0]:data;
  if(error||!row||!["joined","already_enrolled"].includes(row.status)){
    redirect(`${destination}&error=${encodeURIComponent(classInviteMessage(error?"unavailable":row?.status??"unavailable"))}`);
  }
  revalidatePath("/","layout");
  redirect(`/results/classes?${row.status==="already_enrolled"?"already":"joined"}=1`);
}
