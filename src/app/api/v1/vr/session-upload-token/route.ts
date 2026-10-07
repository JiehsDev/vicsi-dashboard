// src/app/api/v1/vr/session-upload-token/route.ts
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { apiSuccess, apiError, apiServerError } from "@/lib/apiResponse";
import { generateAssessmentToken, sha256Hex } from "@/lib/assessmentCrypto";
import { checkRateLimit, ipRateLimitKey, RATE_LIMITS } from "@/lib/rateLimit";
import { parseRpcError } from "@/lib/assessmentErrors";
import { checkVrDeviceKey } from "@/lib/vrAccessCodes";
import { parseVrUploadTokenRequest, VR_UPLOAD_TOKEN_TTL_SECONDS } from "@/lib/vrUploadAuthorization";

/** Short-lived, single-session upload authorization for a VR headset.
 *
 *  Authenticated by the device key (VR_DEVICE_SYNC_KEY bearer, same as
 *  student-directory) - never by a student code, a pairing code, or a Supabase
 *  cookie. Body: { studentId, sessionId, scenarioId, classIdHint?, isTestSession?,
 *  sessionStartedAtUtc? }. studentId is the session's ORIGINAL owner, recorded on
 *  the headset when the session started; every check (student exists, VR-enabled,
 *  disabled policy, session not already owned by someone else, class/assignment)
 *  happens in issue_vr_upload_token (019). No display name is accepted.
 *
 *  Returns an opaque token for POST /api/v1/assessment-sessions, valid for
 *  VR_UPLOAD_TOKEN_TTL_SECONDS and only for that sessionId. Only its sha256 is
 *  stored; the plaintext exists in this response alone and is never logged. */
export async function POST(request: Request) {
  const auth = checkVrDeviceKey(request);
  if (auth === "not-configured") {
    return apiServerError(new Error("VR_DEVICE_SYNC_KEY is not set"), "vr/session-upload-token");
  }
  if (auth !== "ok") {
    return apiError("UNAUTHORIZED", "This device is not authorized to upload sessions.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("VALIDATION_ERROR", "Request body must be valid JSON.");
  }
  const parsed = parseVrUploadTokenRequest(body);
  if (!parsed.ok) {
    return apiError("VALIDATION_ERROR", "One or more fields are invalid.", { fieldErrors: parsed.errors });
  }
  const req = parsed.value;

  const ipKey = ipRateLimitKey(request, "vr-upload-token-ip");
  if (ipKey) {
    const ipLimit = await checkRateLimit(ipKey, RATE_LIMITS.vrUploadTokenPerIp.limit, RATE_LIMITS.vrUploadTokenPerIp.windowSeconds);
    if (!ipLimit.allowed) {
      return apiError("RATE_LIMITED", "Too many upload authorization requests. Try again shortly.", { retryable: true });
    }
  }
  const sessionLimit = await checkRateLimit(
    `vr-upload-token-session:${req.sessionId}`,
    RATE_LIMITS.vrUploadTokenPerSession.limit,
    RATE_LIMITS.vrUploadTokenPerSession.windowSeconds,
  );
  if (!sessionLimit.allowed) {
    return apiError("RATE_LIMITED", "Too many upload authorization requests for this session. Try again shortly.", { retryable: true });
  }

  const plainToken = generateAssessmentToken();
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("issue_vr_upload_token", {
    p_student_id: req.studentId,
    p_session_id: req.sessionId,
    p_scenario_id: req.scenarioId,
    p_class_id_hint: req.classIdHint,
    p_is_test_session: req.isTestSession,
    p_session_started_at: req.sessionStartedAtUtc,
    p_token_hash: sha256Hex(plainToken),
    p_ttl_seconds: VR_UPLOAD_TOKEN_TTL_SECONDS,
  });

  if (error) {
    const rpc = parseRpcError(error.message);
    if (rpc.code === "DATABASE_ERROR") return apiServerError(error, "issue_vr_upload_token");
    const messages: Partial<Record<string, string>> = {
      VALIDATION_ERROR: "The upload authorization request is invalid.",
      STUDENT_NOT_FOUND: "This session's student no longer exists.",
      STUDENT_NOT_PERMITTED: "This session's student is not set up for VR.",
      STUDENT_DISABLED: "VR access is disabled for this student.",
      SESSION_OWNER_MISMATCH: "This session is already recorded for a different student.",
      NO_ASSIGNMENT: "The student has no assignment for this scenario yet.",
    };
    return apiError(rpc.code, messages[rpc.code] ?? "Unable to authorize this upload.");
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return apiServerError(new Error("issue_vr_upload_token returned no row"), "issue_vr_upload_token");
  }

  const response = apiSuccess({
    uploadToken: plainToken,
    expiresAtUtc: new Date(row.expires_at).toISOString(),
    sessionId: req.sessionId,
    studentId: req.studentId,
    classId: row.class_id,
    assignmentId: row.assignment_id,
    scenarioId: row.scenario_id,
    isTestSession: req.isTestSession,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
