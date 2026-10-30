import {redirect} from "next/navigation";
import {getMyProfile} from "@/lib/supabaseClient";
import {getMyResultSummaries,getResultDetail} from "@/lib/results";
import {studentHomeState} from "@/lib/studentHome";
import {StudentHome} from "@/components/StudentHome";

export default async function StudentHomePage() {
 const profile=await getMyProfile();
 if(!profile)redirect("/login");
 if(profile.role!=="student")redirect("/class-results");
 const rows=await getMyResultSummaries();
 const {latest}=studentHomeState(rows);
 const detail=latest?await getResultDetail(latest.sessionId,{educationalOnly:true}):null;
 return <StudentHome name={profile.fullName??"Investigator"} rows={rows} latestDetail={detail}/>;
}
