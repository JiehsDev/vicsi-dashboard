import {test} from "node:test";
import assert from "node:assert/strict";
import {renderToStaticMarkup} from "react-dom/server";
import StudentPage from "../../app/(dashboard)/classes/[classId]/students/[studentId]/page";
import SessionPage from "../../app/(dashboard)/classes/[classId]/students/[studentId]/sessions/[sessionId]/page";
import {currentResult} from "./sessionRecord.fixture.ts";
import type {ClassDetail} from "../classes";
import type {ResultDetail} from "../results";
const globals=globalThis as unknown as {__vicsiClassDetail:ClassDetail;__vicsiDetails:ResultDetail[]};
function reset() {
  globals.__vicsiClassDetail={id:"class-a",name:"Forensic investigation",section:"A",academicYear:null,semester:null,archivedAt:null,createdAt:"2026-11-01",sessionCount:0,averageVerifiedScore:null,
    students:[{studentId:"ana",fullName:"Ana Reyes",studentNumber:"2026-001",enrolledAt:"2026-11-04"}]};
  globals.__vicsiDetails=[];
}
const studentParams={classId:"class-a",studentId:"ana"};

test("enrolled student without uploads has an identified empty history and class back link",async()=>{
  reset();
  const html=renderToStaticMarkup(await StudentPage({params:Promise.resolve(studentParams),searchParams:Promise.resolve({})}));
  assert.match(html,/Ana Reyes/);assert.match(html,/No session received/);assert.match(html,/href="\/classes\/class-a"/);
});
test("unowned class and unenrolled student return not found",async()=>{
  reset();
  for(const params of [{...studentParams,classId:"someone-elses-class"},{...studentParams,studentId:"outsider"}]) {
    await assert.rejects(StudentPage({params:Promise.resolve(params),searchParams:Promise.resolve({})}),/NEXT_HTTP_ERROR_FALLBACK;404/);
    await assert.rejects(SessionPage({params:Promise.resolve({...params,sessionId:"attempt"})}),/NEXT_HTTP_ERROR_FALLBACK;404/);
  }
});
test("session overview validates student ownership and returns to that student's history",async()=>{
  reset();const result={...currentResult(),studentId:"ana",sessionId:"attempt"};globals.__vicsiDetails=[result];
  const params={...studentParams,sessionId:"attempt"};
  const html=renderToStaticMarkup(await SessionPage({params:Promise.resolve(params)}));
  assert.match(html,/Ana Reyes/);assert.match(html,/Score summary/);assert.match(html,/Questions &amp; answers/);
  assert.match(html,/href="\/classes\/class-a\/students\/ana"/);
  globals.__vicsiDetails=[{...result,studentId:"outsider"}];
  await assert.rejects(SessionPage({params:Promise.resolve(params)}),/NEXT_HTTP_ERROR_FALLBACK;404/);
});
test("test-only history is explained and can be included explicitly",async()=>{
  reset();globals.__vicsiDetails=[{...currentResult(),studentId:"ana",sessionId:"test-attempt",isTestSession:true}];
  const page=(includeTests?:string)=>StudentPage({params:Promise.resolve(studentParams),searchParams:Promise.resolve({includeTests})});
  assert.match(renderToStaticMarkup(await page()),/Only test sessions have been received/);
  assert.match(renderToStaticMarkup(await page("1")),/\/sessions\/test-attempt/);
});
