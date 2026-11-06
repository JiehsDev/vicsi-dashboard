import {test} from "node:test";
import assert from "node:assert/strict";
import {resetClassActionState} from "../../../Tools/testing/class-management-backend";
import {updateClassAction,enrollStudentAction,removeStudentAction,archiveClassAction,manageClassInviteAction} from "../../app/(dashboard)/classes/actions";
import {joinClassAction} from "../../app/results/classes/join/actions";
function form(modal=true){const data=new FormData();for(const [key,value]of Object.entries({classId:"class-a",name:"Updated & renamed",section:"B",academicYear:"2026-2027",semester:"2nd",studentNumber:"2026-001",studentId:"student-a"}))data.set(key,value);if(modal)data.set("returnTo","manage-class");return data;}
async function destination(action:(data:FormData)=>Promise<void>,data:FormData){
  try{await action(data);}catch(error){const digest=(error as {digest?:string}).digest;if(digest?.startsWith("NEXT_REDIRECT;"))return new URL(digest.split(";")[2],"https://dashboard.example");throw error;}
  throw new Error("Expected an action redirect");
}
test("modal validation errors preserve entered fields and reopen the edit dialog",async()=>{
  const state=resetClassActionState();state.error="VALIDATION_ERROR: semester must be 1st, 2nd or Summer";
  const url=await destination(updateClassAction,form());
  assert.equal(url.pathname,"/classes/class-a");assert.equal(url.searchParams.get("manage"),"1");
  for(const key of ["name","section","academicYear","semester"])assert.equal(url.searchParams.get(key),form().get(key));
  assert.match(url.searchParams.get("error")!,/semester/);assert.equal(state.invalidated.length,0);
});
test("saving uses the existing scoped RPC, refreshes sidebar data, and closes the modal",async()=>{
  const state=resetClassActionState();const url=await destination(updateClassAction,form());
  assert.equal(url.pathname,"/classes/class-a");assert.equal(url.searchParams.get("updated"),"1");assert.equal(url.searchParams.has("manage"),false);
  assert.equal(state.calls[0].name,"update_instructor_class_with_period");assert.equal(state.calls[0].args.p_class_id,"class-a");assert.deepEqual(state.invalidated,["/:layout"]);
});
test("enrollment, removal and archive errors stay in class management",async()=>{
  for(const action of [enrollStudentAction,removeStudentAction,archiveClassAction]){
    const state=resetClassActionState();state.error="NOT_FOUND: private database detail";
    const url=await destination(action,form());assert.equal(url.searchParams.get("manage"),"1");assert.doesNotMatch(url.href,/private/);assert.equal(url.pathname,"/classes/class-a");
  }
});
test("existing edit-page links and anonymous access retain their original behavior",async()=>{
  const state=resetClassActionState();state.error="NOT_FOUND: private detail";
  assert.equal((await destination(updateClassAction,form(false))).pathname,"/classes/class-a/edit");
  state.user=false;state.calls=[];assert.equal((await destination(updateClassAction,form())).pathname,"/login");assert.equal(state.calls.length,0);
});

test("dedicated enrollment modal keeps invalid student numbers and closes after success",async()=>{
  const state=resetClassActionState();state.error="NOT_FOUND: private database detail";
  const data=form();data.set("returnTo","enroll-student");
  const failure=await destination(enrollStudentAction,data);
  assert.equal(failure.searchParams.get("enroll"),"1");assert.equal(failure.searchParams.has("manage"),false);
  assert.equal(failure.searchParams.get("studentNumber"),"2026-001");assert.doesNotMatch(failure.href,/private/);
  state.error=null;
  const success=await destination(enrollStudentAction,data);
  assert.equal(success.searchParams.get("enrolled"),"1");assert.equal(success.searchParams.has("enroll"),false);
  assert.equal(state.calls.at(-1)?.name,"enroll_student_in_class");assert.equal(state.calls.at(-1)?.args.p_student_number,"2026-001");
});

test("invite administration stays scoped to the instructor RPC and returns to the enrollment dialog",async()=>{
  const state=resetClassActionState();const data=form();data.set("inviteAction","reset");
  const success=await destination(manageClassInviteAction,data);assert.equal(success.searchParams.get("enroll"),"1");assert.equal(success.searchParams.get("inviteChanged"),"1");
  assert.deepEqual(state.calls[0],{name:"manage_class_invitation",args:{p_class_id:"class-a",p_action:"reset"}});
  state.error="UNAUTHORIZED: private internal context";assert.doesNotMatch((await destination(manageClassInviteAction,data)).href,/private|internal/);
});
test("joining passes credentials and the authenticated caller to the RPC, with recoverable errors",async()=>{
  const state=resetClassActionState();const data=new FormData();data.set("returnTo","/results/classes/join?code=abcde-23456");
  state.data=[{status:"joined"}];assert.equal((await destination(joinClassAction,data)).searchParams.get("joined"),"1");
  assert.deepEqual(state.calls[0].args,{p_code:"ABCDE23456",p_token:null,p_join:true});
  state.data=[{status:"already_enrolled"}];assert.equal((await destination(joinClassAction,data)).searchParams.get("already"),"1");
  state.data=[{status:"rate_limited"}];const failed=await destination(joinClassAction,data);assert.equal(failed.searchParams.get("code"),"ABCDE23456");assert.match(failed.searchParams.get("error")!,/10 minutes/);
  state.user=false;const login=await destination(joinClassAction,data);assert.equal(login.pathname,"/login");assert.equal(login.searchParams.get("next"),"/results/classes/join?code=ABCDE23456");
});
