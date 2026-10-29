import { notFound } from "next/navigation";
import { getResultDetail,getInstructorSessionIdentity } from "@/lib/results";
import { SessionRecord } from "@/components/SessionRecord";
export default async function InstructorResultPage({params}:{params:Promise<{sessionId:string}>}){
 const {sessionId}=await params,result=await getResultDetail(sessionId,{educationalOnly:true});if(!result)notFound();
 const identity=await getInstructorSessionIdentity(sessionId);
 return <SessionRecord result={result} instructor studentName={identity?.studentDisplayName} className={identity?.classDisplayName}/>;
}
