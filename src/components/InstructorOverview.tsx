import Form from 'next/form';
import {SubmitButton} from '@/components/SubmitButton';
import Link from "./LoadingLink";
import type {InstructorResultRow} from "@/lib/results";
import {instructorOverview} from "@/lib/instructorOverview";
import {formatPoints} from "@/lib/assessmentPresentation";
import type {DashboardQuery} from "./ResultFilters";
import {dateLabel} from "./AnalyticsUI";

export function InstructorOverview({rows,query}:{rows:InstructorResultRow[];query:DashboardQuery}) {
 const model=instructorOverview(rows),cohort=model.cohorts.find(group=>group.key===query.performanceGroup)??model.cohorts[0];
 function reviewRows(items:typeof model.review,start=1) {
  return <ol className="instructor-review-list" start={start}>{items.map(({row,reasons,href})=><li key={row.sessionId}>
   <div><Link className="review-student" href={href}>{row.studentDisplayName}</Link><p className="review-context">{row.scenarioDisplayName} · {row.classDisplayName} · {dateLabel(row.startedAtUtc??row.completedAtUtc??row.serverReceivedAtUtc)}</p><ul>{reasons.map(reason=><li key={reason}>{reason}</li>)}</ul></div>
   <Link className="review-open" href={href} aria-label={`Review ${row.studentDisplayName}'s ${row.scenarioDisplayName} session`}>Review session →</Link>
  </li>)}</ol>;
 }
 return <section id="teaching-overview" className="instructor-overview" aria-label="Teaching overview">
  <div className="instructor-review" aria-labelledby="needs-review-title">
   <div className="instructor-section-heading"><h2 id="needs-review-title">Needs review <span>{model.review.length}</span></h2><p>Latest played attempt per student and scenario, among received records.</p></div>
   {model.review.length?reviewRows(model.review.slice(0,5)):<p className="instructor-empty">{model.studentCount?"No review flags in the matching records.":"No student sessions to review yet. Received test sessions are excluded."}</p>}
   {model.review.length>5&&<details className="instructor-more"><summary>Show {model.review.length-5} more flagged sessions</summary>{reviewRows(model.review.slice(5),6)}</details>}
   <p className="instructor-method">Skill flags suggest a review when a recorded component is below 50% of its available points. They are not pass/fail grades.</p>
  </div>
  <div className="instructor-performance" aria-labelledby="class-performance-title">
   <div className="instructor-section-heading"><h2 id="class-performance-title">Class performance</h2><p>Latest completed, verified attempt per student within each scenario and version.</p></div>
   {cohort?<>
    {model.cohorts.length>1?<Form action="/class-results" className="performance-filter">
     {Object.entries(query).filter(([key,value])=>value!==undefined&&key!=="performanceGroup"&&key!=="page").map(([key,value])=><input key={key} type="hidden" name={key} value={value}/>)}
     <label htmlFor="performance-group">Scenario and scoring group<select id="performance-group" name="performanceGroup" defaultValue={cohort.key}>{model.cohorts.map(group=><option key={group.key} value={group.key}>{group.scenario} · Scenario {group.scenarioVersion} · Rules {group.scoringVersion} · Evidence {group.groundTruthVersion}</option>)}</select></label><SubmitButton className="button" pendingLabel="Updating overview…">Update overview</SubmitButton>
    </Form>:null}<p className="performance-version">{cohort.scenario} · Scenario {cohort.scenarioVersion} · Rules {cohort.scoringVersion} · Evidence {cohort.groundTruthVersion}</p>
    <div className="performance-total"><div><span>{cohort.scoringVersion==="1.7.0"?"Average deduction score":"Average recorded historical score"}</span><strong>{formatPoints(cohort.average)}<small>%</small></strong></div><p>{cohort.students} student{cohort.students===1?"":"s"} represented</p></div>
    <dl className="performance-components">{cohort.components.map(component=><div key={component.key}><dt>{component.label}</dt><dd>{component.average===null?"Not recorded":<>{formatPoints(component.average)} <span>/ {component.maximum}</span></>}</dd>{component.average!==null&&<dd className="performance-meter"><div className="performance-track" role="img" aria-label={`${component.label}: ${formatPoints(component.average)} out of ${component.maximum}`}><span style={{width:`${component.average/component.maximum*100}%`}}/></div><small>{component.count} recorded result{component.count===1?"":"s"}</small></dd>}</div>)}</dl>
   </>:<p className="instructor-empty">No completed, verified student results match these filters. Averages will appear when eligible results are received.</p>}
   <p className="instructor-method">All matching records are considered, beyond the current table page. Test sessions are excluded. Recorder documentation is scored separately and can be reviewed inside each session.</p>
  </div>
 </section>;
}
