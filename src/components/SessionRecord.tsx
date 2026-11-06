import Link from "next/link";
import {evidenceText} from "@/lib/evidenceDisplay";
import {questionLabel} from "@/lib/questionDisplay";
import type {ResultDetail} from "@/lib/results";
import {buildEducationalRecord} from "@/lib/sessionRecord";
import {PageHeading,Section,dateLabel} from "./AnalyticsUI";
export function elapsed(milliseconds:number):string {
 const seconds=Math.floor(Math.max(0,milliseconds)/1000);
 return `${Math.floor(seconds/60).toString().padStart(2,"0")}:${(seconds%60).toString().padStart(2,"0")}`;
}
const number=(n:number)=>Number.isInteger(n)?String(n):String(Math.round(n*100)/100);
export function SessionRecord({result,instructor=false,studentName,className,backHref,backLabel}:{result:ResultDetail;instructor?:boolean;studentName?:string;className?:string;backHref?:string;backLabel?:string}) {
 const record=buildEducationalRecord(result);
 return <div className="academic-record">
 <Link className="text-primary" href={backHref??(instructor?"/class-results":"/results")}>← Back to {backLabel??(instructor?"class results":"my sessions")}</Link>
 <PageHeading eyebrow="ViCSI assessment record" title="Investigation session" description={result.scenarioDisplayName}/>
 <nav className="record-section-nav" aria-label="Investigation sections"><a href="#session-information">Session information</a><a href="#deduction-score">Score summary</a><a href="#deduction-questions">Questions &amp; answers</a><a href="#recorder-documentation">Documentation</a><a href="#procedure-timeline">Timeline</a></nav>
 <Section id="session-information" title="Session information"><dl className="record-information">
 {instructor&&studentName&&<div><dt>Student</dt><dd>{studentName}{className?` · ${className}`:""}</dd></div>}
 <div><dt>Scenario</dt><dd>{result.scenarioDisplayName}</dd></div><div><dt>Date</dt><dd>{dateLabel(result.startedAtUtc??result.completedAtUtc??result.serverReceivedAtUtc)}</dd></div>
 <div><dt>Duration</dt><dd>{result.durationSeconds===null?"Not recorded":elapsed(result.durationSeconds*1000)}</dd></div>
 </dl>{result.isTestSession&&<p className="cell-secondary">Test session</p>}</Section>
 <Section id="deduction-score" title="Deduction score">
 <p className="record-final-score record-deduction-total">{result.scoringVersion==="1.7.0"?"Final Deduction Score":"Recorded historical score"}: <strong>{record.score===null?"Not available":`${number(record.score)}%`}</strong></p>
 {record.score===null&&<p className="muted">{evidenceText(result.verificationMessage??"A verified final score is not available for this session.")}</p>}
 {record.components.length>0&&<dl className="deduction-components">{record.components.map(c=><div key={c.label}><dt>{c.label}</dt><dd>{c.points===null?"Not available":`${number(c.points)} / ${c.maximum}`}</dd></div>)}</dl>}
 {record.questions.length>0&&record.formula&&<p className="score-calculation">Reasoning: earned weight ÷ {record.formula.reasoningMaximum} × {record.formula.reasoningWeight}. Evidence Relationships: max(0, total answer weights) ÷ {record.formula.relationshipMaximum} × {record.formula.relationshipWeight}. Final Conclusion: contextual answer weight × {record.formula.conclusionWeight}. Relationship weights include the existing −{record.formula.penalty} penalty for an unsupported interpretation.</p>}
 </Section>
 <Section id="deduction-questions" title="Deduction questions">{record.note&&<p className="notice">{record.note}</p>}
 {record.questions.map((q,index)=><article className="assessment-question" id={`question-${index+1}`} key={q.id}>
 <div className="question-caption"><span>{index+1}. {q.category} · {questionLabel(q.id)}</span>{q.answeredSeconds>=0&&<time>{elapsed(q.answeredSeconds*1000)}</time>}</div><h3>{evidenceText(q.question)}</h3>
 {!q.selectedAnswerId&&<p className="muted">{q.wasAvailable?"No answer recorded":"Not available during this investigation"}</p>}
 <ul className="answer-options">{q.options.map(a=><li key={a.id} className={q.selectedAnswerId===a.id?"student-answer":""}><div><p>{evidenceText(a.text)}</p>{q.selectedAnswerId===a.id&&<strong className="selected-answer-label">✓ Student answer</strong>}</div><span className="answer-weight">Weight {number(a.weight)}</span></li>)}</ul>
 {q.selectedAnswerId&&<p className="received-weight">Received: <strong>{number(q.selectedAnswerWeight)} / {number(q.maximumWeight)}</strong></p>}</article>)}
 {record.historical&&record.recordedAnswers.length>0&&<ol className="historical-answers">{record.recordedAnswers.map((a,i)=><li key={`${a.id}:${i}`}><strong>{evidenceText(a.id)}</strong>{a.timestampMs===null?" · Time not recorded":` · ${elapsed(a.timestampMs)}`}<p>Recorded answer: {evidenceText(a.selected)}</p><p>{a.weight===null?"Answer weight was not captured.":`Recorded answer weight: ${number(a.weight)}`}</p></li>)}</ol>}
 {record.historical&&!record.recordedAnswers.length&&<p className="muted">No individual answers were captured.</p>}</Section>
 <Section id="recorder-documentation" title="Recorder Documentation">
 {record.recorder.subjects.map(subject=><article className="recorder-subject" key={subject.id}>
 <h3>{subject.label}</h3>
 {subject.selected.length?<ul className="answer-options">{subject.selected.map(statement=><li key={statement.id}><p>{statement.text}</p>
 {statement.points!==null&&<span className="answer-weight">{statement.points} points</span>}</li>)}</ul>:<p className="muted">No statements recorded.</p>}
 {subject.points!==null&&<p className="received-weight">Subtotal: <strong>{subject.points} / {subject.maximum}</strong></p>}
 </article>)}
 {record.recorder.note&&<p className="muted">{record.recorder.note}</p>}
 {record.recorder.points!==null&&<p className="record-final-score">Recorder Documentation Score: <strong>{record.recorder.points} / {record.recorder.maximum}</strong></p>}
 </Section>
 <Section id="procedure-timeline" title="Procedure timeline">{record.timeline.length?<ol className="procedure-timeline">{record.timeline.map(e=><li key={e.id}><time>{elapsed(e.timestampMs)}</time><div><p>{e.description}</p></div></li>)}</ol>:<p className="muted">No completed procedure events were captured for this session.</p>}</Section>
 </div>;
}
