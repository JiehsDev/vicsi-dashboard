// src/lib/__tests__/vrUploadAuthorization.test.ts
//
// Run with: node --conditions=react-server --experimental-strip-types --test src/lib/__tests__/vrUploadAuthorization.test.ts
// (also part of `npm run test:vr-codes`)
//
// Node half of the VR session-upload bridge: request validation, the token/session
// binding the upload route enforces, the token lifetime, and the test-student
// shaping. The database half (issue_vr_upload_token's checks and the end-to-end
// token -> submit_assessment_session ownership) is in
// supabase/tests/manual_vr_upload_tokens_test.sql.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseVrUploadTokenRequest,
  checkUploadTokenBinding,
  VR_UPLOAD_TOKEN_TTL_SECONDS,
} from "../vrUploadAuthorization.ts";
import { buildVrTestStudent, vrTestStudentNumber } from "../vrAccessCodes.ts";

const STUDENT = "11111111-1111-4111-8111-111111111111";
const SESSION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_SESSION = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CLASS = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

test("request: minimal valid body -> normalized ids, defaults", () => {
  const r = parseVrUploadTokenRequest({ studentId: STUDENT.toUpperCase(), sessionId: SESSION, scenarioId: "CSI-ENVIRONMENT-001" });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.value.studentId, STUDENT);
  assert.equal(r.value.classIdHint, null);
  assert.equal(r.value.isTestSession, false);
  assert.equal(r.value.sessionStartedAtUtc, null);
});

test("request: full body round-trips; start time normalized to ISO UTC", () => {
  const r = parseVrUploadTokenRequest({
    studentId: STUDENT, sessionId: SESSION, scenarioId: "CSI-ENVIRONMENT-001",
    classIdHint: CLASS, isTestSession: true, sessionStartedAtUtc: "2026-10-06T08:00:00+08:00",
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.value.classIdHint, CLASS);
  assert.equal(r.value.isTestSession, true);
  assert.equal(r.value.sessionStartedAtUtc, "2026-10-06T00:00:00.000Z");
});

test("request: rejects non-UUID student/session ids, missing scenario, bad hint/flag/time", () => {
  const bad = parseVrUploadTokenRequest({
    studentId: "John Doe", sessionId: "123", scenarioId: "", classIdHint: "x", isTestSession: "yes", sessionStartedAtUtc: "yesterday",
  });
  assert.equal(bad.ok, false);
  if (bad.ok) return;
  assert.deepEqual(bad.errors.map((e) => e.field).sort(), ["classIdHint", "isTestSession", "scenarioId", "sessionId", "sessionStartedAtUtc", "studentId"]);
  assert.equal(parseVrUploadTokenRequest(null).ok, false);
});

test("request: a display name is never part of the request", () => {
  const r = parseVrUploadTokenRequest({ studentId: STUDENT, sessionId: SESSION, scenarioId: "S", displayName: "Somebody Else" });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.ok(!("displayName" in r.value));
});

test("binding: a VR upload token only submits its own session", () => {
  const row = { purpose: "vr_session_upload", bound_session_id: SESSION, is_test_session: false };
  assert.equal(checkUploadTokenBinding(row, SESSION), "ok");
  assert.equal(checkUploadTokenBinding(row, SESSION.toUpperCase()), "ok");
  assert.equal(checkUploadTokenBinding(row, OTHER_SESSION), "wrong-session");
  assert.equal(checkUploadTokenBinding({ ...row, bound_session_id: null }, SESSION), "wrong-session");
});

test("binding: pairing tokens and pre-019 rows keep their unbound behavior", () => {
  assert.equal(checkUploadTokenBinding({ purpose: "pairing", bound_session_id: null, is_test_session: false }, OTHER_SESSION), "ok");
  assert.equal(checkUploadTokenBinding(null, OTHER_SESSION), "ok");
});

test("lifetime: upload tokens are short-lived (5-15 minutes)", () => {
  assert.ok(VR_UPLOAD_TOKEN_TTL_SECONDS >= 5 * 60 && VR_UPLOAD_TOKEN_TTL_SECONDS <= 15 * 60);
});

test("test student: defaults to the existing John Doe number; override and 'none' respected", () => {
  delete process.env.VR_TEST_STUDENT_NUMBER;
  assert.equal(vrTestStudentNumber(), "2099-00099");
  process.env.VR_TEST_STUDENT_NUMBER = "2099-12345";
  assert.equal(vrTestStudentNumber(), "2099-12345");
  process.env.VR_TEST_STUDENT_NUMBER = "none";
  assert.equal(vrTestStudentNumber(), null);
  delete process.env.VR_TEST_STUDENT_NUMBER;
});

test("test student: shaped from the real profile; archived classes dropped; no profile -> none (never invented)", () => {
  const shaped = buildVrTestStudent({ id: STUDENT, full_name: "John Doe" }, [
    { class_id: CLASS, classes: { id: CLASS, name: "ViCSI Dev Test Class", section: "Z", archived_at: null } },
    { class_id: OTHER_SESSION, classes: { id: OTHER_SESSION, name: "Old", section: null, archived_at: "2026-01-01T00:00:00Z" } },
    { class_id: CLASS, classes: { id: CLASS, name: "ViCSI Dev Test Class", section: "Z", archived_at: null } },
  ]);
  assert.deepEqual(shaped, {
    studentId: STUDENT,
    displayName: "John Doe",
    classes: [{ classId: CLASS, className: "ViCSI Dev Test Class", classSection: "Z" }],
  });
  assert.equal(buildVrTestStudent(null, []), null);
});
