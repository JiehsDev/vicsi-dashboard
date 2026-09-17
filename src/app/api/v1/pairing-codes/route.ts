// src/app/api/v1/pairing-codes/route.ts
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { apiSuccess, apiError, apiServerError } from "@/lib/apiResponse";
import { generatePairingCode, hmacPairingCodeHash, DEFAULT_PAIRING_CODE_LENGTH } from "@/lib/assessmentCrypto";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rateLimit";
import { parseRpcError } from "@/lib/assessmentErrors";

const PAIRING_CODE_TTL_SECONDS = 5 * 60; // 5 minutes, per Requirement 1's recommendation

interface CreatePairingCodeBody {
  classId?: unknown;
  assessmentAssignmentId?: unknown;
  scenarioId?: unknown;
}

/** Called from the authenticated student dashboard (never from Unity).
 *  studentId is ALWAYS derived from the session cookie via
 *  createSupabaseServerClient() — the request body cannot supply or
 *  override it, so a tampered body can at most ask to pair against an
 *  assignment the caller isn't enrolled in, which the RPC itself rejects. */
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return apiError("UNAUTHORIZED", "Sign in to generate a pairing code.");
  }

  const rateLimit = await checkRateLimit(
    `pairing-create:${user.id}`,
    RATE_LIMITS.pairingCreatePerStudent.limit,
    RATE_LIMITS.pairingCreatePerStudent.windowSeconds,
  );
  if (!rateLimit.allowed) {
    return apiError("RATE_LIMITED", "Too many pairing codes requested. Try again shortly.", {
      retryable: true,
      status: 429,
    });
  }

  let body: CreatePairingCodeBody;
  try {
    body = await request.json();
  } catch {
    return apiError("VALIDATION_ERROR", "Request body must be valid JSON.");
  }

  const classId = typeof body.classId === "string" ? body.classId : null;
  const assessmentAssignmentId = typeof body.assessmentAssignmentId === "string" ? body.assessmentAssignmentId : null;
  const scenarioId = typeof body.scenarioId === "string" ? body.scenarioId : null;

  const fieldErrors = [];
  if (!classId) fieldErrors.push({ field: "classId", message: "classId is required." });
  if (!assessmentAssignmentId) fieldErrors.push({ field: "assessmentAssignmentId", message: "assessmentAssignmentId is required." });
  if (!scenarioId) fieldErrors.push({ field: "scenarioId", message: "scenarioId is required." });
  if (fieldErrors.length > 0) {
    return apiError("VALIDATION_ERROR", "One or more fields are invalid.", { fieldErrors });
  }

  const plainCode = generatePairingCode(DEFAULT_PAIRING_CODE_LENGTH);
  const codeHash = hmacPairingCodeHash(plainCode);

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("create_pairing_code", {
    p_student_id: user.id,
    p_class_id: classId,
    p_assignment_id: assessmentAssignmentId,
    p_scenario_id: scenarioId,
    p_code_hash: codeHash,
    p_ttl_seconds: PAIRING_CODE_TTL_SECONDS,
  });

  if (error) {
    const parsed = parseRpcError(error.message);
    if (parsed.code === "DATABASE_ERROR") return apiServerError(error, "create_pairing_code");
    // Deliberately generic for VALIDATION_ERROR/ASSIGNMENT_INACTIVE here too —
    // never confirms/denies "is this class real" or "are you enrolled" beyond
    // what the caller's own dashboard already shows them from their own
    // enrolled-assignments list.
    return apiError(parsed.code, "Unable to generate a pairing code for that assignment.");
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return apiServerError(new Error("create_pairing_code returned no row"), "create_pairing_code");
  }

  // The plaintext code exists only in this response, in memory, for this one
  // request — it is never logged (the code above never calls console.log
  // with plainCode) and never persisted anywhere but the caller's screen.
  return apiSuccess({
    pairingCode: plainCode,
    expiresAtUtc: row.expires_at,
    scenarioId,
    assessmentAssignmentId,
  });
}
