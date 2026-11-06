import {getInstructorResultSummaries,applyResultFilters,validateDateRange} from "@/lib/results";
import {Section} from "@/components/AnalyticsUI";
import {ResultFilters,type DashboardQuery} from "@/components/ResultFilters";
import {PaginatedSessions} from "@/components/PaginatedSessions";
import {InstructorOverview} from "@/components/InstructorOverview";
export default async function ClassResultsPage({searchParams}:{searchParams:Promise<DashboardQuery>}) {
 const query=await searchParams,all=await getInstructorResultSummaries(),dates=validateDateRange(query.dateFrom,query.dateTo);
 const rows=dates.error?[]:applyResultFilters(all,{...query,...dates,includeTests:query.includeTests==="true"});
 return <div className="instructor-results"><h1 className="sr-only">Recent Sessions</h1><ResultFilters instructor query={query} rows={all}/>{dates.error?<p className="notice" role="alert">{dates.error}</p>:<><Section title="Sessions" description="Every matching received investigation, newest uploads first." aside={<a className="student-text-link" href="#teaching-overview">Review flags &amp; class performance ↓</a>}><PaginatedSessions rows={rows} query={query} instructor/></Section><InstructorOverview rows={rows} query={query}/></>}</div>;
}
