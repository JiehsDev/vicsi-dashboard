import {test} from "node:test";
import assert from "node:assert/strict";
import {renderToStaticMarkup} from "react-dom/server";
import {buildClassOverview,studentHistoryPath} from "../classOverview";
import {ClassRoster} from "../../components/ClassRoster";
import {PaginatedSessions} from "../../components/PaginatedSessions";
import {currentResult} from "./sessionRecord.fixture.ts";
import type {EnrolledStudent} from "../classes";
const students:EnrolledStudent[]=[
  {studentId:"empty",fullName:"Ben Santos",studentNumber:"2026-002",enrolledAt:"2026-11-04"},
  {studentId:"ana",fullName:"Ana Reyes",studentNumber:"2026-001",enrolledAt:"2026-11-04"},
];
const attempt=(overrides={})=>({...currentResult(),studentId:"ana",...overrides});

test("roster includes all enrolled students, excludes outsiders and tests, and retains pre-enrollment student-owned history",()=>{
  const rows=buildClassOverview(students,[attempt({classId:null}),attempt({studentId:"outsider"}),attempt({studentId:"empty",isTestSession:true})]);
  assert.deepEqual(rows.map(r=>[r.fullName,r.sessionCount,r.status]),[["Ana Reyes",1,"Completed"],["Ben Santos",0,"No session received"]]);
  assert.equal(rows[1].latest,null);
  const html=renderToStaticMarkup(<ClassRoster classId="class-a" students={rows}/>);
  assert.doesNotMatch(html,/No session received|Latest status|Latest upload|deduction score|2026-002/);assert.match(html,/\/classes\/class-a\/students\/empty/);
  assert.doesNotMatch(html,/outsider|NaN|undefined/);
});

test("latest upload controls status and unavailable scores stay unavailable",()=>{
  const rows=buildClassOverview(students,[attempt({serverReceivedAtUtc:"2026-11-01T00:00:00Z"}),attempt({sessionId:"new",serverReceivedAtUtc:"2026-11-03T00:00:00Z",completedAtUtc:null})]);
  assert.equal(rows[0].latest?.sessionId,"new");assert.equal(rows[0].status,"Incomplete");assert.equal(rows[0].sessionCount,2);
  const html=renderToStaticMarkup(<ClassRoster classId="class-a" students={rows}/>);
  assert.doesNotMatch(html,/Investigation not completed|Incomplete|0%/);
});

test("five-session pagination and session links stay inside the selected class and student",()=>{
  const base=studentHistoryPath("class-a","ana");
  const rows=Array.from({length:12},(_,i)=>attempt({sessionId:`session-${i}`}));
  const html=renderToStaticMarkup(<PaginatedSessions rows={rows} query={{page:"2",includeTests:"1"}} instructor basePath={base} sessionBasePath={`${base}/sessions`}/>);
  assert.equal((html.match(/class="session-view"/g)??[]).length,5);
  assert.match(html,/\/classes\/class-a\/students\/ana\?page=3&amp;includeTests=1/);
  assert.match(html,/\/classes\/class-a\/students\/ana\/sessions\/session-5/);
  assert.doesNotMatch(html,/\/sessions\/session-0"/);
});

test("path segments are encoded",()=>assert.equal(studentHistoryPath("class/a","student?b"),"/classes/class%2Fa/students/student%3Fb"));
