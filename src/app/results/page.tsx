import {redirect} from "next/navigation";
import {getMyProfile} from "@/lib/supabaseClient";
import {getMyResultSummaries,applyResultFilters,validateDateRange} from "@/lib/results";
import {PageHeading,Section} from "@/components/AnalyticsUI";
import {ResultFilters,type DashboardQuery} from "@/components/ResultFilters";
import {SessionTable} from "@/components/SessionTable";
export default async function MyResultsPage({searchParams}:{searchParams:Promise<DashboardQuery>}) {
 const profile=await getMyProfile();if(!profile)redirect("/login");if(profile.role!=="student")redirect("/class-results");
 const query=await searchParams,all=await getMyResultSummaries(),dates=validateDateRange(query.dateFrom,query.dateTo);
 const rows=dates.error?[]:applyResultFilters(all,{...query,...dates,includeTests:query.includeTests==="true"});
 return <><PageHeading eyebrow="Student workspace" title="My Sessions" description="Your investigation activity, answers and deduction results."/><ResultFilters query={query} rows={all}/>{dates.error&&<p className="notice" role="alert">{dates.error}</p>}<Section title="Sessions"><SessionTable rows={rows}/></Section></>;
}
