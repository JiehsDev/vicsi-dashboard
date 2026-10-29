import {getInstructorResultSummaries,applyResultFilters,validateDateRange} from "@/lib/results";
import {PageHeading,Section} from "@/components/AnalyticsUI";
import {ResultFilters,type DashboardQuery} from "@/components/ResultFilters";
import {SessionTable} from "@/components/SessionTable";
export default async function ClassResultsPage({searchParams}:{searchParams:Promise<DashboardQuery>}) {
 const query=await searchParams,all=await getInstructorResultSummaries(),dates=validateDateRange(query.dateFrom,query.dateTo);
 const rows=dates.error?[]:applyResultFilters(all,{...query,...dates,includeTests:query.includeTests==="true"});
 const latest=new Map<string,typeof rows[number]>();for(const r of rows){const key=`${r.studentId}:${r.classId}`;if(!latest.has(key))latest.set(key,r);}
 return <><PageHeading eyebrow="Instructor workspace" title="Class Results" description="Latest matching investigation per student and class. Open a record to review procedures, answers and deduction score."/><ResultFilters instructor query={query} rows={all}/>{dates.error&&<p className="notice" role="alert">{dates.error}</p>}<Section title="Students"><SessionTable rows={[...latest.values()]} instructor/></Section></>;
}
