import {redirect} from "next/navigation";
import {getMyProfile} from "@/lib/supabaseClient";
import {getMyResultSummaries,applyResultFilters,validateDateRange} from "@/lib/results";
import {PageHeading,Section} from "@/components/AnalyticsUI";
import {ResultFilters,type DashboardQuery} from "@/components/ResultFilters";
import {PaginatedSessions} from "@/components/PaginatedSessions";
import {StudentSessionsEmpty} from "@/components/StudentGuidance";
export default async function MyResultsPage({searchParams}:{searchParams:Promise<DashboardQuery>}) {
 const profile=await getMyProfile();if(!profile)redirect("/login");if(profile.role!=="student")redirect("/class-results");
 const query=await searchParams,all=await getMyResultSummaries(),dates=validateDateRange(query.dateFrom,query.dateTo);
 const rows=dates.error?[]:applyResultFilters(all,{...query,...dates,includeTests:query.includeTests==="true"});
 const eligible=all.filter(r=>query.includeTests==="true"||!r.isTestSession);
 const emptyKind=all.length===0?"first":eligible.length===0?"tests":"filtered";
 return <><PageHeading eyebrow="Student workspace" title="My Sessions" description="Open an investigation to review your score, answers and recorded activity."/><ResultFilters query={query} rows={all}/>{dates.error?<p className="notice" role="alert">{dates.error}</p>:<Section title="Sessions">{rows.length?<PaginatedSessions rows={rows} query={query}/>:<StudentSessionsEmpty kind={emptyKind}/>}</Section>}</>;
}
