// src/lib/vrUploadAuthorization.ts
import "server-only";

/** Device-authenticated, short-lived session-upload authorization
 *  (supabase/migrations/019_vr_session_upload_tokens.sql).
 *
 *  The VR access code only IDENTIFIES a student. To upload, the headset - already
 *  authenticated by VR_DEVICE_SYNC_KEY - asks for an upload token for a session's
 *  ORIGINAL owner (the stable studentId it recorded when the session started). The
 *  token is an ordinary opaque assessment token (generateAssessmentToken, stored only
 *  as sha256 - same as pairing tokens) with purpose = vr_session_upload, bound to one
 *  sessionId, valid for VR_UPLOAD_TOKEN_TTL_SECONDS. The existing upload endpoint
 *  accepts it unchanged; it only additionally enforces the session binding
 *  (checkUploadTokenBinding). */

export const VR_UPLOAD_TOKEN_TTL_SECONDS = 10 * 60;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SCENARIO_ID_PATTERN = /^[A-Za-z0-9_.-]{1,100}$/;

export interface VrUploadTokenRequest {
  studentId: string;
  sessionId: string;
  scenarioId: string;
  classIdHint: string | null;
  isTestSession: boolean;
  sessionStartedAtUtc: string | null;
}

export interface FieldError {
  field: string;
  message: string;
}

/** Validates the JSON body. Never accepts a display name or any identity other
 *  than the stable studentId - the server resolves everything else itself. */
export function parseVrUploadTokenRequest(body: unknown): { ok: true; value: VrUploadTokenRequest } | { ok: false; errors: FieldError[] } {
  const errors: FieldError[] = [];
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;

  const studentId = typeof b.studentId === "string" ? b.studentId.trim() : "";
  if (!UUID_PATTERN.test(studentId)) errors.push({ field: "studentId", message: "studentId must be a UUID." });

  const sessionId = typeof b.sessionId === "string" ? b.sessionId.trim() : "";
  if (!UUID_PATTERN.test(sessionId)) errors.push({ field: "sessionId", message: "sessionId must be a UUID." });

  const scenarioId = typeof b.scenarioId === "string" ? b.scenarioId.trim() : "";
  if (!SCENARIO_ID_PATTERN.test(scenarioId)) errors.push({ field: "scenarioId", message: "scenarioId is required." });

  let classIdHint: string | null = null;
  if (b.classIdHint !== undefined && b.classIdHint !== null && b.classIdHint !== "") {
    if (typeof b.classIdHint === "string" && UUID_PATTERN.test(b.classIdHint.trim())) {
      classIdHint = b.classIdHint.trim();
    } else {
      errors.push({ field: "classIdHint", message: "classIdHint must be a UUID when given." });
    }
  }

  if (b.isTestSession !== undefined && typeof b.isTestSession !== "boolean") {
    errors.push({ field: "isTestSession", message: "isTestSession must be a boolean." });
  }

  let sessionStartedAtUtc: string | null = null;
  if (b.sessionStartedAtUtc !== undefined && b.sessionStartedAtUtc !== null && b.sessionStartedAtUtc !== "") {
    const parsed = typeof b.sessionStartedAtUtc === "string" ? Date.parse(b.sessionStartedAtUtc) : NaN;
    if (Number.isNaN(parsed)) {
      errors.push({ field: "sessionStartedAtUtc", message: "sessionStartedAtUtc must be an ISO-8601 timestamp." });
    } else {
      sessionStartedAtUtc = new Date(parsed).toISOString();
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      studentId: studentId.toLowerCase(),
      sessionId: sessionId.toLowerCase(),
      scenarioId,
      classIdHint: classIdHint ? classIdHint.toLowerCase() : null,
      isTestSession: b.isTestSession === true,
      sessionStartedAtUtc,
    },
  };
}

/** The token columns the upload route needs (019). Null when the row has no
 *  purpose column yet (019 not applied) - treated as a legacy pairing token. */
export interface UploadTokenBindingRow {
  purpose: string | null;
  bound_session_id: string | null;
  is_test_session: boolean | null;
}

/** A vr_session_upload token may only submit the one session it was issued for.
 *  Pairing tokens (and rows predating 019) keep their existing, unbound behavior.
 *  Comparison is case-insensitive: session ids are UUIDs. */
export function checkUploadTokenBinding(row: UploadTokenBindingRow | null, payloadSessionId: string): "ok" | "wrong-session" {
  if (!row || row.purpose !== "vr_session_upload") {
    return "ok";
  }
  if (!row.bound_session_id || row.bound_session_id.toLowerCase() !== payloadSessionId.toLowerCase()) {
    return "wrong-session";
  }
  return "ok";
}
