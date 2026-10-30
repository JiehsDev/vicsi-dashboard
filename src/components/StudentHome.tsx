import Link from "next/link";
import {ArrowRight} from "lucide-react";
import type {ResultDetail,ResultSummary} from "@/lib/results";
import {formatPoints} from "@/lib/assessmentPresentation";
import {studentHomeState,resultStatus,reviewFocus} from "@/lib/studentHome";
import {PageHeading,dateLabel} from "./AnalyticsUI";
import {SessionTable} from "./SessionTable";
import {ScoreExplainer} from "./StudentGuidance";

export function StudentHome({name,rows,latestDetail}:{name:string;rows:ResultSummary[];latestDetail:ResultDetail|null}) {
 const {sessions,latest,lastReceived,lastReceivedIsTest,hiddenTests,score}=studentHomeState(rows);
 const status=latest?resultStatus(latest):null;
 const focus=reviewFocus(latestDetail?.sessionId===latest?.sessionId?latestDetail:null);
 const latestHref=latest?`/results/${encodeURIComponent(latest.sessionId)}`:"/results/guide";
 const ready=score!==null;
 return <div className="student-home">
 <PageHeading eyebrow="Your learning workspace" title={`Welcome, ${name.trim().split(/\s+/)[0] || "investigator"}`} description="Prepare for your investigation, understand your results, and choose what to review next."/>
 <div className="home-workspace"><div className="home-primary">
 <section className="student-next" aria-labelledby="next-step-title"><div className="next-copy"><p className="eyebrow">Your next step</p>
 <h2 id="next-step-title">{!latest?"Get ready for your first investigation":ready?"Take a closer look at your latest investigation":"Check your latest investigation record"}</h2>
 <p>{!latest?"Your investigation starts in the ViCSI headset app. Get your student code from your instructor and check the preparation guide before you begin.":ready?"Your result is ready. Review your selected answers and the evidence behind them before your next attempt.":status?.description}</p>
 </div><Link className="button button-primary next-action" href={latest?`${latestHref}${ready?"#deduction-score":""}`:"/results/guide"}>{latest?ready?"Review latest result":"View received session":"View headset instructions"}<ArrowRight size={18} aria-hidden="true"/></Link></section>
 {hiddenTests>0&&<p className="notice" role="status">{hiddenTests} test session{hiddenTests===1?" is":"s are"} separate from your assessment history. <Link href="/results?includeTests=true">View test sessions</Link></p>}
 <section className="latest-investigation" aria-labelledby="latest-title"><h2 id="latest-title" className="eyebrow">{latest?"Latest investigation":"Before your first attempt"}</h2>
 {latest?<><div className="latest-record-heading"><div><h3>{latest.scenarioDisplayName}</h3><span className={`result-state ${ready?"result-state-ready":"result-state-review"}`}>{status?.label}</span><dl className="home-session-meta"><div><dt>Played</dt><dd>{dateLabel(latest.startedAtUtc??latest.completedAtUtc)}</dd></div><div><dt>Time taken</dt><dd>{latest.durationSeconds===null?"Not recorded":`${Math.floor(latest.durationSeconds/60)}m ${Math.floor(latest.durationSeconds%60)}s`}</dd></div></dl></div>
 <div className="latest-score"><span>{latest.scoringVersion==="1.7.0"?"Deduction score":"Historical result"}</span><strong>{ready?<>{formatPoints(score)}<small> / 100</small></>:"Not available"}</strong></div></div>
 {latest.scoringVersion==="1.7.0" && ready && <dl className="home-components">{[["Reasoning","reasoningCheckpointComponent",60],["Relationships","deductionRelationshipComponent",25],["Conclusion","finalConclusionComponent",15]].map(([label,key,max])=><div key={key}><dt>{label}</dt><dd>{formatPoints(latest.assessmentComponents?.[key]??null)} / {max}</dd></div>)}</dl>}
 {!ready&&<p className="guide-note">{status?.description}</p>}{latest.scoringVersion!=="1.7.0"&&<p className="guide-note">This attempt uses historical scoring. Review it using the information saved with that session.</p>}
 <Link className="student-text-link" href={latestHref}>Open investigation record <ArrowRight size={16} aria-hidden="true"/></Link></>:<><ol className="home-preparation"><li>Get your student code from your instructor.</li><li>Confirm your name in the headset lobby.</li><li>Complete the investigation and scene closeout.</li></ol><p className="guide-note">Your received results will appear here. You do not need to start anything on this website to play.</p><Link className="student-text-link" href="/results/guide">Read the preparation guide <ArrowRight size={16} aria-hidden="true"/></Link></>}
 </section>
 {latest && <section className="analysis-section" aria-labelledby="focus-title"><div className="section-heading"><div><h2 id="focus-title">Focus for your next investigation</h2><p>Based on the answers recorded in your latest attempt.</p></div></div>{focus.length?<ol className="review-focus-list">{focus.map((item,i)=><li className="review-focus" key={item.id}><span className="focus-number" aria-hidden="true">0{i+1}</span><div><h3>{item.title}</h3><p>{item.description}</p></div><Link className="student-text-link" href={item.href}>Review this answer <ArrowRight size={16} aria-hidden="true"/></Link></li>)}</ol>:<div className="review-reflection"><h3>{ready?"Reflect on the support behind your decisions":"Review the activity saved for this attempt"}</h3><p>{ready?"Open your investigation record to revisit the reasoning, documentation and procedure details available for this session.":"A verified final result is needed before targeted review suggestions can be shown."}</p><Link className="student-text-link" href={latestHref}>Open investigation record <ArrowRight size={16} aria-hidden="true"/></Link></div>}</section>}
 {sessions.length>0&&<section className="analysis-section" aria-labelledby="recent-title"><div className="section-heading"><h2 id="recent-title">Recent investigations</h2><Link className="student-text-link" href="/results">View all sessions <ArrowRight size={16} aria-hidden="true"/></Link></div><SessionTable rows={sessions.slice(0,3)}/></section>}
 </div><aside className="home-reference" aria-label="Scoring reference and session help"><ScoreExplainer/>
 <section className="student-receipt" aria-label="Session receipt and help"><h2>Last session received</h2><p>{lastReceived?`${new Intl.DateTimeFormat("en",{dateStyle:"medium",timeStyle:"short",timeZone:"UTC"}).format(new Date(lastReceived))} UTC${lastReceivedIsTest?" · test session":""}`:"No sessions have been received for this account yet."}</p><Link className="student-text-link" href="/results/guide#missing-session">Missing your session? <ArrowRight size={16} aria-hidden="true"/></Link></section>
 </aside></div>
 </div>;
}
