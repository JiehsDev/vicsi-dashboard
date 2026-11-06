import {test} from "node:test";
import assert from "node:assert/strict";
import {classJoinReturnPath,normalizeClassCode,classInviteMessage} from "../classInvites";
test("sign-in return destinations only accept class join credentials",()=>{
  for(const value of ["https://evil.example/results/classes/join?code=ABCDE23456","//evil.example/results/classes/join?code=ABCDE23456","/class-results","/results/classes/join?invite=short",null,"/results/classes/join?code=bad"])
    assert.equal(classJoinReturnPath(value),null);
  assert.equal(classJoinReturnPath("/results/classes/join?code=abcde-23456&error=ignored"),"/results/classes/join?code=ABCDE23456");
  assert.equal(classJoinReturnPath(`/results/classes/join?invite=${"a".repeat(64)}`),`/results/classes/join?invite=${"a".repeat(64)}`);
  assert.equal(normalizeClassCode(" abcde -23456 "),"ABCDE23456");
});
test("join errors are readable and do not expose backend messages",()=>{
  assert.match(classInviteMessage("rate_limited"),/10 minutes/);assert.match(classInviteMessage("invalid"),/instructor/);
  assert.doesNotMatch(classInviteMessage("private database internals"),/private|internals/);
});
