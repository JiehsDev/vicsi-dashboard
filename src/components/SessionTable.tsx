import Link from "next/link";
import type {ResultSummary,InstructorResultRow} from "@/lib/results";
import {assessedScore,formatPoints} from "@/lib/assessmentPresentation";
import {dateLabel,EmptyState} from "./AnalyticsUI";
export function SessionTable({rows,instructor=false}:{rows:ResultSummary[];instructor?:boolean}) {
 if(!rows.length)return <EmptyState title="No sessions found">Complete an investigation or adjust the filters.</EmptyState>;
 return <div className="table-scroll" tabIndex={0} aria-label="Session results"><table className="product-table"><thead><tr>{instructor&&<th>Student</th>}<th>{instructor?"Latest attempt / date":"Date"}</th><th>Scenario</th><th>Duration</th><th className="numeric">Deduction Score</th><th>View</th></tr></thead>
 <tbody>{rows.map(r=>{const student=r as InstructorResultRow,score=assessedScore(r);return <tr key={r.sessionId}>
 {instructor&&<td><Link className="table-link" href={`/class-results/students/${encodeURIComponent(r.studentId)}`}>{student.studentDisplayName}</Link><div className="cell-secondary">{student.classDisplayName}</div></td>}
 <td>{dateLabel(r.startedAtUtc??r.completedAtUtc??r.serverReceivedAtUtc)}{r.isTestSession&&<div className="cell-secondary">Test session</div>}</td><td>{r.scenarioDisplayName}</td><td>{r.durationSeconds===null?"Not recorded":`${Math.floor(r.durationSeconds/60)}m ${Math.floor(r.durationSeconds%60)}s`}</td>
 <td className="numeric">{score===null?"Not available":`${formatPoints(score)}%`}{r.scoringVersion!=="1.7.0"&&<div className="cell-secondary">Historical score</div>}</td>
 <td><Link className="table-link" href={`${instructor?"/class-results":"/results"}/${encodeURIComponent(r.sessionId)}`} aria-label={`View ${r.scenarioDisplayName} session from ${dateLabel(r.startedAtUtc??r.completedAtUtc??r.serverReceivedAtUtc)}`}>View →</Link></td></tr>;})}</tbody></table></div>;
}
