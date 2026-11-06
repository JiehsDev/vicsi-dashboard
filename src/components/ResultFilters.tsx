import Link from "next/link";
import type {ResultSummary} from "@/lib/results";
export type DashboardQuery=Record<string,string|undefined>;
export function ResultFilters({query,rows,instructor=false}:{query:DashboardQuery;rows:ResultSummary[];instructor?:boolean}) {
 const base=instructor?"/class-results":"/results";
 const classes=[...new Map(rows.map(r=>[r.classId,(r as ResultSummary&{classDisplayName?:string}).classDisplayName??r.classId])).entries()];
 const hiddenTests=query.includeTests==="true"?0:rows.filter(row=>row.isTestSession).length;
 const testQuery=new URLSearchParams(Object.entries(query).filter((entry):entry is [string,string]=>entry[1]!==undefined));testQuery.set("includeTests","true");testQuery.delete("page");
 return <>{!instructor&&hiddenTests>0&&<p className="notice" role="status">{hiddenTests} test session{hiddenTests===1?" is":"s are"} hidden, including any deduction scores from those attempts. <Link href={`${base}?${testQuery}`}>Show test sessions</Link></p>}<form action={base} className={`filter-bar record-filters${instructor?" instructor-filters":""}`}><label className="search-filter">{instructor?"Student name or ID":"Scenario"}<input name="q" defaultValue={query.q} placeholder={instructor?"Find a student":"Find a scenario"}/></label>
 {instructor&&<label>Class<select name="classId" defaultValue={query.classId??""}><option value="">All classes</option>{classes.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>}
 <div className="date-filter-range" role="group" aria-label="Played date range"><label>From<input type="date" name="dateFrom" defaultValue={query.dateFrom}/></label><label>To<input type="date" name="dateTo" defaultValue={query.dateTo}/></label></div>
 <label className="check-filter"><input type="checkbox" name="includeTests" value="true" defaultChecked={query.includeTests==="true"}/>Include test sessions</label><div className="filter-actions"><button className="button button-primary" type="submit">Apply</button><Link className="button" href={base}>Reset</Link></div></form></>;
}
