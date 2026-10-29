import { notFound,redirect } from "next/navigation";
import { getMyProfile } from "@/lib/supabaseClient";
import { getResultDetail } from "@/lib/results";
import { SessionRecord } from "@/components/SessionRecord";
export default async function ResultPage({params}:{params:Promise<{sessionId:string}>}){
 const profile=await getMyProfile();if(!profile)redirect("/login");if(profile.role!=="student")redirect("/class-results");
 const {sessionId}=await params,result=await getResultDetail(sessionId,{educationalOnly:true});if(!result)notFound();
 return <SessionRecord result={result}/>;
}
