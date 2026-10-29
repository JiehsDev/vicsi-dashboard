// src/app/api/v1/assessment-sessions/route.ts
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { apiSuccess, apiError, apiServerError } from "@/lib/apiResponse";
import { sha256Hex, canonicalPayloadHash } from "@/lib/assessmentCrypto";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rateLimit";
import { parseRpcError } from "@/lib/assessmentErrors";
import { verifySession } from "@/lib/scoring/verify";
import { mergeAssessmentEvents } from "@/lib/scoring/assessmentEventEnvelope";
import { checkUploadTokenBinding, type UploadTokenBindingRow } from "@/lib/vrUploadAuthorization";

const SUPPORTED_PAYLOAD_VERSIONS = [1];
const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024; // 2 MiB
const MAX_EVENTS_PER_REQUEST = 20_000; // mirrors AssessmentUploadConfiguration.maxEventsPerRequest's intent

function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header || !header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

/** Called from Unity after a session completes. Authorization is a
 *  short-lived assessment token minted by /api/v1/device-pairings/exchange
 *  (purpose = pairing) or by /api/v1/vr/session-upload-token (purpose =
 *  vr_session_upload, bound to one sessionId - see 019) — never a Supabase
 *  session cookie, never the service-role key.
 *  studentId/classId/assignmentId/scenarioId are resolved SERVER-SIDE from
 *  that token inside submit_assessment_session(); the equivalent fields
 *  inside the JSON body (AssessmentSessionUploadDto.studentId/classId) are
 *  read by nothing in this file - they are informational-only by contract
 *  (see that DTO's own class comment) and are never passed to the RPC. */
export async function POST(request: Request) {
  const token = extractBearerToken(request);
  if (!token) {
    return apiError("UNAUTHORIZED", "Missing or malformed Authorization header.");
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_PAYLOAD_BYTES) {
    return apiError("PAYLOAD_TOO_LARGE", "Submission payload exceeds the maximum allowed size.");
  }

  const rawBody = await request.text();
  if (rawBody.length > MAX_PAYLOAD_BYTES) {
    return apiError("PAYLOAD_TOO_LARGE", "Submission payload exceeds the maximum allowed size.");
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return apiError("VALIDATION_ERROR", "Request body must be valid JSON.");
  }

  const payloadVersion = typeof payload.payloadVersion === "number" ? payload.payloadVersion : null;
  const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : null;

  if (!sessionId) {
    return apiError("VALIDATION_ERROR", "payload.sessionId is required.");
  }
  if (payloadVersion === null || !SUPPORTED_PAYLOAD_VERSIONS.includes(payloadVersion)) {
    return apiError("PAYLOAD_VERSION_UNSUPPORTED", `payloadVersion ${payloadVersion} is not supported.`);
  }

  try { payload = mergeAssessmentEvents(payload); }
  catch { return apiError("VALIDATION_ERROR", "Malformed or conflicting assessment records."); }

  const orderedEvents = Array.isArray(payload.orderedEvents) ? payload.orderedEvents : [];
  if (orderedEvents.length > MAX_EVENTS_PER_REQUEST) {
    return apiError("EVENT_LIMIT_EXCEEDED", `orderedEvents exceeds the maximum of ${MAX_EVENTS_PER_REQUEST} per request.`);
  }

  const tokenHash = sha256Hex(token);

  // Two independent limits, per Requirement 2 - "per token" bounds a
  // misbehaving/compromised token hammering the endpoint across many
  // sessionIds; "per session id" bounds retry storms against one specific
  // upload (e.g. a buggy client retry loop) regardless of which token sent it.
  const tokenLimit = await checkRateLimit(
    `assessment-submit-token:${tokenHash}`,
    RATE_LIMITS.submissionPerToken.limit,
    RATE_LIMITS.submissionPerToken.windowSeconds,
  );
  if (!tokenLimit.allowed) {
    return apiError("RATE_LIMITED", "Too many submissions from this device. Try again shortly.", { retryable: true });
  }

  const sessionLimit = await checkRateLimit(
    `assessment-submit-session:${sessionId}`,
    RATE_LIMITS.submissionPerSession.limit,
    RATE_LIMITS.submissionPerSession.windowSeconds,
  );
  if (!sessionLimit.allowed) {
    return apiError("RATE_LIMITED", "Too many submissions for this session. Try again shortly.", { retryable: true });
  }

  const payloadHash = canonicalPayloadHash(payload);

  const admin = createSupabaseAdminClient();

  // VR session-upload tokens (019) are bound to ONE sessionId - refuse any other
  // before submit. Pairing tokens are unbound, exactly as before. If the 019
  // columns don't exist yet the lookup errors; no vr_session_upload token can exist
  // without 019 either, so falling back to the unbound behavior is safe.
  let tokenBinding: UploadTokenBindingRow | null = null;
  {
    const { data: bindingRow, error: bindingError } = await admin
      .from("assessment_tokens")
      .select("purpose, bound_session_id, is_test_session")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (bindingError) {
      console.warn("[assessment-sessions] token binding lookup unavailable, treating as unbound:", bindingError.message);
    } else {
      tokenBinding = bindingRow as UploadTokenBindingRow | null;
    }
  }
  if (checkUploadTokenBinding(tokenBinding, sessionId) === "wrong-session") {
    return apiError("TOKEN_INVALID", "This upload token was issued for a different session.");
  }

  const { data, error } = await admin.rpc("submit_assessment_session", {
    p_token_hash: tokenHash,
    p_payload: payload,
    p_payload_hash: payloadHash,
  });

  if (error) {
    const parsed = parseRpcError(error.message);
    if (parsed.code === "DATABASE_ERROR") return apiServerError(error, "submit_assessment_session");
    if (parsed.code === "SESSION_PAYLOAD_CONFLICT") {
      return apiError(
        "SESSION_PAYLOAD_CONFLICT",
        `Session ${sessionId} was already submitted with a different payload.`,
        { retryable: false, status: 409 },
      );
    }
    return apiError(parsed.code, "Unable to accept this submission.");
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return apiServerError(new Error("submit_assessment_session returned no row"), "submit_assessment_session");
  }

  // Verification runs only for a genuinely FRESH insert (never for an
  // identical-duplicate resubmission, which is already verified/pending from
  // its first arrival) - Part 4's pipeline, kept entirely separate from
  // storage: a scoring bug here must never fail the submission itself, which
  // is why this is awaited-but-caught rather than allowed to throw past this
  // point. The client always gets its receipt regardless of how scoring goes.
  // Test-session flag comes from the TOKEN (set when the headset asked for an upload
  // token for a "Continue Without Code" session), never from the payload. Only on a
  // fresh insert; a failure here never fails the stored submission.
  if (!row.duplicate && tokenBinding?.is_test_session) {
    const { error: flagError } = await admin
      .from("assessment_sessions")
      .update({ is_test_session: true })
      .eq("session_id", row.session_id);
    if (flagError) {
      console.error(`[assessment-sessions] could not set is_test_session for ${row.session_id}:`, flagError.message);
    }
  }

  let verificationStatus = row.verification_status as string;
  if (!row.duplicate) {
    try {
      const outcome = await verifySession(row.session_id);
      verificationStatus = outcome.status;
    } catch (err) {
      console.error(`[assessment-sessions] verifySession threw for ${row.session_id}:`, err);
    }
  }

  return apiSuccess({
    receiptId: row.receipt_id,
    sessionId: row.session_id,
    uploadStatus: "accepted",
    duplicate: row.duplicate,
    verificationStatus,
    serverReceivedAtUtc: row.server_received_at_utc,
    payloadVersion,
  });
}
