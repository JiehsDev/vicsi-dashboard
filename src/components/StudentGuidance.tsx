import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function ScoreExplainer() {
 return <section className="score-guide" aria-labelledby="score-guide-title"><h2 id="score-guide-title">How your score works</h2><div className="score-explainer-body">
 <dl className="home-score-weights"><div><dt>Reasoning checkpoints</dt><dd>60 points</dd></div><div><dt>Evidence relationships</dt><dd>25 points</dd></div><div><dt>Final conclusion</dt><dd>15 points</dd></div></dl>
 <div><p>Relationship answers add one unit when supported and subtract one when unsupported. The combined relationship score cannot fall below zero.</p><p>Recorder documentation is scored separately out of 24. It is not added to your deduction score.</p><Link className="student-text-link" href="/results/guide#understanding-results">Read the scoring guide <ArrowRight size={15} aria-hidden="true"/></Link></div></div></section>;
}
export function StudentSessionsEmpty({kind}:{kind:"first"|"filtered"|"tests"}) {
 const content={
  first:{title:"Your first investigation starts in the headset",text:"Complete a ViCSI investigation using your student identity. Received sessions will appear here, with your answers and results.",href:"/results/guide",action:"View headset instructions"},
  filtered:{title:"No sessions match these filters",text:"Try a different scenario or date range. Your other sessions are still available.",href:"/results",action:"Clear filters"},
  tests:{title:"Only test sessions have been received",text:"Test sessions are separate from your assessment history. You can view them, or use your own student code for your next investigation.",href:"/results?includeTests=true",action:"View test sessions"},
 }[kind];
 return <div className="student-empty"><h3>{content.title}</h3><p>{content.text}</p><Link className="button button-primary" href={content.href}>{content.action} <ArrowRight size={16} aria-hidden="true"/></Link></div>;
}
export function HeadsetGuide() {
 return <div className="student-guide"><nav className="guide-index" aria-label="Guide sections"><p className="eyebrow">In this guide</p><a href="#getting-started">Getting started</a><a href="#controls-title">Headset controls</a><a href="#understanding-results">Understanding results</a><a href="#missing-session">Missing a session</a></nav><div className="guide-content">
 <div className="guide-intro"><h2>Your investigation takes place in VR</h2><p>This website is your learning record. Open ViCSI on the headset to play, then return here to review the investigation received for your account.</p></div>
 <section className="analysis-section" aria-labelledby="getting-started"><div className="section-heading"><h2 id="getting-started">Get ready in four steps</h2></div><ol className="headset-steps">
 {[
  ["Get your student code","Ask your instructor for your ViCSI student code. It has eight letters and numbers, usually shown in two groups. Your headset code is different from your website password."],
  ["Confirm your identity in the lobby","Open the research edition of ViCSI on the headset. Enter your student code and check the name shown under “Is this you?” Choose Change Code if the identity is wrong. Continue Without Code creates a test session rather than a normal attempt under your own identity."],
  ["Follow the investigation through closeout","Receive the First Responder briefing and follow the in-game prompts. After collecting evidence, review the evidence relationships and submit your conclusion. Finish the custody pass, inventory, final survey and completion report."],
  ["Review your received session","Keep the headset online and ViCSI active so its uploader can run. Return to My Sessions and refresh the list. Open the new attempt to review your score, selected answers, documentation and procedure timeline."],
 ].map(([title,text],i)=><li key={title}><span className="step-number" aria-hidden="true">{i+1}</span><div><h3>{title}</h3><p>{text}</p></div></li>)}</ol></section>
 <section className="guide-section" aria-labelledby="controls-title"><h2 id="controls-title">Finding your way in the headset</h2><dl className="guide-controls"><div><dt>Tool wheel</dt><dd>Hold Y, highlight a tool with the right stick, then release Y.</dd></div><div><dt>Investigation menu</dt><dd>Hold X, highlight a screen with the right stick, then release X. Find Relationships, Scene Sketch and Submit Conclusion here.</dd></div><div><dt>Questions and panels</dt><dd>Follow the controls printed on the panel. A usually selects or confirms; supported panels also accept pointing and trigger input.</dd></div><div><dt>What to do next</dt><dd>Follow the active waypoint and contextual hint. Close a panel or store the held item when an instruction asks you to do so.</dd></div></dl></section>
 <section id="understanding-results" className="guide-section" aria-label="Understanding your results"><ScoreExplainer/>
 <p className="guide-note">Your session record shows the options and answers captured during that attempt. Older sessions may have less detail or use different scoring rules. An unavailable score is not a zero, and faster completion does not add points to the current research deduction score.</p></section>
 <section id="missing-session" className="guide-section" aria-labelledby="missing-title"><h2 id="missing-title">Missing your session?</h2><ol className="help-checklist"><li>Check that you confirmed your own identity in the headset.</li><li>Make sure you finished the completion report and scene release, not only your conclusion.</li><li>Keep the headset connected to the internet with ViCSI active. A system or boundary screen can pause the app.</li><li>Refresh My Sessions and clear any date or scenario filters.</li><li>If you used Continue Without Code, the attempt belongs to the test identity. Ask your instructor to help locate it.</li><li>If it is still missing, tell your instructor the approximate play time and the name confirmed in the lobby.</li></ol><p className="guide-note">The website can confirm only sessions received by the server. It cannot see an upload still waiting on an offline headset.</p><Link className="button" href="/results">Go to My Sessions <ArrowRight size={16} aria-hidden="true"/></Link></section>
 <p className="guide-finish">Use the in-game prompts during your investigation. Return here when you need preparation help or want to understand a completed attempt.</p>
 </div></div>;
}
