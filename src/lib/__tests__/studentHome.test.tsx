import {test} from "node:test";
import assert from "node:assert/strict";
import {renderToStaticMarkup} from "react-dom/server";
import {studentHomeState,reviewFocus,resultStatus} from "../studentHome.ts";
import {StudentHome} from "../../components/StudentHome.tsx";
import {StudentSessionsEmpty,HeadsetGuide} from "../../components/StudentGuidance.tsx";
import {SessionRecord} from "../../components/SessionRecord.tsx";
import {currentResult} from "./sessionRecord.fixture.ts";

test("first visit gives real headset instructions without a fake grade or upload state",()=>{
 const html=renderToStaticMarkup(<StudentHome name="Ana Reyes" rows={[]} latestDetail={null}/>);
 assert.match(html,/Welcome, Ana/);assert.match(html,/Get ready for your first investigation/);
 assert.match(html,/href="\/results\/guide"/);assert.match(html,/No sessions have been received/);
 assert.doesNotMatch(html,/0 \/ 100|Upload pending|Start game|Resume investigation/);
});
test("test sessions stay outside learning summaries, even when received most recently",()=>{
 const normal={...currentResult(),sessionId:"normal"};
 const demo={...currentResult(),sessionId:"test",isTestSession:true,startedAtUtc:"2026-10-29T00:00:00Z",serverReceivedAtUtc:"2026-10-29T01:00:00Z"};
 const state=studentHomeState([demo,normal]);assert.equal(state.latest?.sessionId,"normal");assert.equal(state.hiddenTests,1);assert.equal(state.sessions.length,1);assert.equal(state.lastReceivedIsTest,true);
 const html=renderToStaticMarkup(<StudentHome name="Ana" rows={[demo]} latestDetail={demo}/>);
 assert.match(html,/Get ready for your first investigation/);assert.match(html,/View test sessions/);assert.doesNotMatch(html,/100 \/ 100/);
});
test("a retry receipt does not displace a newer played attempt and inputs remain immutable",()=>{
 const older={...currentResult(),sessionId:"old",startedAtUtc:"2026-10-20T00:00:00Z",serverReceivedAtUtc:"2026-10-29T01:00:00Z"};
 const newer={...currentResult(),sessionId:"new",startedAtUtc:"2026-10-28T00:00:00Z",serverReceivedAtUtc:"2026-10-28T01:00:00Z"};
 const rows=[older,newer];assert.equal(studentHomeState(rows).latest?.sessionId,"new");assert.deepEqual(rows,[older,newer]);
});
test("unavailable scores and instructor-review states are not displayed as zero",()=>{
 const pending={...currentResult(),verificationStatus:"requires_review",assessmentComponents:undefined,verifiedScore:null};
 const html=renderToStaticMarkup(<StudentHome name="Ana" rows={[pending]} latestDetail={pending}/>);
 assert.match(html,/Instructor review needed/);assert.match(html,/Not available/);assert.doesNotMatch(html,/0 \/ 100|Take a closer look|Review this answer/);
 assert.equal(reviewFocus(pending).length,0);assert.equal(resultStatus(pending).label,"Instructor review needed");
 const zero={...currentResult(),assessmentComponents:{...currentResult().assessmentComponents,deductionTotalScore:0}};
 assert.equal(studentHomeState([zero]).score,0);
 assert.match(renderToStaticMarkup(<StudentHome name="Ana" rows={[zero]} latestDetail={null}/>).replace(/<[^>]*>/g,""),/0 \/ 100/);
});
test("current result uses stored components and review suggestions link to recorded question anchors",()=>{
 const result=currentResult(true),focus=reviewFocus(result);
 assert.equal(focus.length,1);assert.match(focus[0].href,/#question-\d+$/);
 const html=renderToStaticMarkup(<StudentHome name="Ana" rows={[result]} latestDetail={result}/>);
 assert.match(html,/60 \/ 60/);assert.match(html,/15 \/ 15/);assert.match(html,/Review this answer/);
 const record=renderToStaticMarkup(<SessionRecord result={result}/>);
 for(const item of focus)assert.ok(record.includes(`id="${decodeURIComponent(item.href.split("#")[1])}"`));
 for(const anchor of ["deduction-score","deduction-questions","recorder-documentation","procedure-timeline"])assert.ok(record.includes(`id="${anchor}"`));
});
test("historical attempts get their own score and no fabricated current answer suggestions",()=>{
 const historical={...currentResult(),scoringVersion:"1.5.0",verifiedScore:.72};
 const html=renderToStaticMarkup(<StudentHome name="Ana" rows={[historical]} latestDetail={historical}/>);
 assert.match(html,/Historical result/);assert.match(html.replace(/<[^>]*>/g,""),/72 \/ 100/);assert.doesNotMatch(html,/Review this answer|60 \/ 60/);assert.equal(reviewFocus(historical).length,0);
});
test("empty histories, filtered results and excluded test sessions have distinct actions",()=>{
 const first=renderToStaticMarkup(<StudentSessionsEmpty kind="first"/>),filtered=renderToStaticMarkup(<StudentSessionsEmpty kind="filtered"/>),tests=renderToStaticMarkup(<StudentSessionsEmpty kind="tests"/>);
 assert.match(first,/View headset instructions/);assert.match(filtered,/Clear filters/);assert.doesNotMatch(filtered,/Complete an investigation/);assert.match(tests,/includeTests=true/);
});
test("the guide follows current code identification and completed closeout without exposing case answers",()=>{
 const html=renderToStaticMarkup(<HeadsetGuide/>);
 assert.match(html,/student code/);assert.match(html,/Confirm your identity/);assert.match(html,/scene release/);assert.match(html,/offline headset/);
 assert.doesNotMatch(html,/Generate pairing|Paul|Peter|murder weapon|correct option/i);
});
