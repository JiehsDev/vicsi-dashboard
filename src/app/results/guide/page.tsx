import {redirect} from "next/navigation";
import {getMyProfile} from "@/lib/supabaseClient";
import {HeadsetGuide} from "@/components/StudentGuidance";
import {PageHeading} from "@/components/AnalyticsUI";

export default async function StudentGuidePage() {
 const profile=await getMyProfile();
 if(!profile)redirect("/login");
 if(profile.role!=="student")redirect("/class-results");
 return <><PageHeading eyebrow="How to Play" title="From the headset to your results" description="A short guide to getting started, completing your investigation and finding your learning record."/><HeadsetGuide/></>;
}
