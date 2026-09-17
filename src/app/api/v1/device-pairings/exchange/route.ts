// src/app/api/v1/device-pairings/exchange/route.ts
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { apiSuccess, apiError, apiServerError } from "@/lib/apiResponse";
import { sha256Hex, hmacPairingCodeHash, normalizePairingCode, generateAssessmentToken } from "@/lib/assessmentCrypto";
import { checkRateLimit, ipRateLimitKey, RATE_LIMITS } from "@/lib/rateLimit";
import { parseRpcError } from "@/lib/assessmentErrors";

const ASSESSMENT_TOKEN_TTL_SECONDS = 4 * 60 * 60; // 4 hours - long enough to cover a full VR session
const SUPPORTED_PAYLOAD_VERSIONS = [1];

interface ExchangeBody {
  payloadVersion?: unknown;
  pairingCode?: unknown;
  scenarioId?: unknown;
  clientVersion?: unknown;
  deviceInstallationId?: unknown;
}

/** Called from Unity, unauthenticated (the pairing code itself is the only
 *  credential). Never accepts or requires anything that could identify
 *  headset hardware — deviceInstallationId is optional, pseudonymous, and
 *  used only for this endpoint's own rate limiting, never persisted. */
export async function POST(request: Request) {
  let body: ExchangeBody;
  try {
    body = await request.json();
  } catch {
    return apiError("VALIDATION_ERROR", "Request body must be valid JSON.");
  }

  const pairingCode = typeof body.pairingCode === "string" ? normalizePairingCode(body.pairingCode) : null;
  const scenarioId = typeof body.scenarioId === "string" ? body.scenarioId : null;
  const payloadVersion = typeof body.payloadVersion === "number" ? body.payloadVersion : null;
  const deviceInstallationId = typeof body.deviceInstallationId === "string" ? body.deviceInstallationId : null;

  if (!pairingCode || !scenarioId || payloadVersion === null) {
    return apiError("VALIDATION_ERROR", "pairingCode, scenarioId, and payloadVersion are required.");
  }
  if (!SUPPORTED_PAYLOAD_VERSIONS.includes(payloadVersion)) {
    return apiError("PAYLOAD_VERSION_UNSUPPORTED", `payloadVersion ${payloadVersion} is not supported.`);
  }
  if (!/^\d{4,10}$/.test(pairingCode)) {
    // Generic message - never reveal the expected length/shape distinctly
    // from "wrong code", which would help an attacker fingerprint valid codes.
    return apiError("PAIRING_CODE_INVALID", "The pairing code is invalid or has expired.");
  }

  // Three independent, persistent (Postgres-backed) limits guard this
  // endpoint: by device/code identity, by caller IP (hashed, never stored
  // raw — see ipRateLimitKey), and — inside consume_pairing_code itself —
  // by attempt_count against the specific code row. Any one tripping is
  // enough to reject; this isn't "all must trip."
  const deviceOrCodeLimit = await checkRateLimit(
    `pairing-exchange:${deviceInstallationId ?? pairingCode}`,
    RATE_LIMITS.pairingExchangePerDeviceOrCode.limit,
    RATE_LIMITS.pairingExchangePerDeviceOrCode.windowSeconds,
  );
  if (!deviceOrCodeLimit.allowed) {
    return apiError("RATE_LIMITED", "Too many pairing attempts. Try again shortly.", { retryable: true });
  }

  const ipKey = ipRateLimitKey(request, "pairing-exchange-ip");
  if (ipKey) {
    const ipLimit = await checkRateLimit(ipKey, RATE_LIMITS.pairingExchangePerIp.limit, RATE_LIMITS.pairingExchangePerIp.windowSeconds);
    if (!ipLimit.allowed) {
      return apiError("RATE_LIMITED", "Too many pairing attempts. Try again shortly.", { retryable: true });
    }
  }

  const codeHash = hmacPairingCodeHash(pairingCode);
  const admin = createSupabaseAdminClient();

  const { data: consumeData, error: consumeError } = await admin.rpc("consume_pairing_code", {
    p_code_hash: codeHash,
    p_scenario_id: scenarioId,
  });

  if (consumeError) {
    const parsed = parseRpcError(consumeError.message);
    if (parsed.code === "DATABASE_ERROR") return apiServerError(consumeError, "consume_pairing_code");
    const genericMessages: Partial<Record<string, string>> = {
      PAIRING_CODE_INVALID: "The pairing code is invalid or has expired.",
      PAIRING_CODE_EXPIRED: "The pairing code has expired. Generate a new one from the dashboard.",
      PAIRING_CODE_USED: "This pairing code has already been used.",
      SCENARIO_MISMATCH: "This pairing code was issued for a different scenario.",
    };
    return apiError(parsed.code, genericMessages[parsed.code] ?? "Unable to pair this device.");
  }

  const identity = Array.isArray(consumeData) ? consumeData[0] : consumeData;
  if (!identity) {
    return apiServerError(new Error("consume_pairing_code returned no row"), "consume_pairing_code");
  }

  const { student_id: studentId, class_id: classId, assignment_id: assignmentId } = identity;

  const [{ data: profile }, { data: klass }, { data: assignment }, { data: scenario }] = await Promise.all([
    admin.from("profiles").select("full_name, student_id").eq("id", studentId).single(),
    admin.from("classes").select("name, section").eq("id", classId).single(),
    admin.from("assessment_assignments").select("id").eq("id", assignmentId).single(),
    admin.from("scenarios").select("scenario_version, scoring_rules_version").eq("scenario_id", scenarioId).single(),
  ]);

  if (!profile || !klass || !assignment || !scenario) {
    return apiServerError(new Error("post-consume identity lookup incomplete"), "device-pairings/exchange");
  }

  const plainToken = generateAssessmentToken();
  const tokenHash = sha256Hex(plainToken);
  const expiresAt = new Date(Date.now() + ASSESSMENT_TOKEN_TTL_SECONDS * 1000).toISOString();

  const { error: insertError } = await admin.from("assessment_tokens").insert({
    token_hash: tokenHash,
    student_id: studentId,
    class_id: classId,
    assignment_id: assignmentId,
    scenario_id: scenarioId,
    expires_at: expiresAt,
  });

  if (insertError) {
    return apiServerError(insertError, "assessment_tokens insert");
  }

  return apiSuccess({
    assessmentToken: plainToken,
    tokenExpiresAtUtc: expiresAt,
    assessmentAssignmentId: assignmentId,
    studentDisplayName: profile.full_name ?? profile.student_id,
    classDisplayName: klass.section ? `${klass.name} - ${klass.section}` : klass.name,
    scenarioId,
    scenarioVersion: scenario.scenario_version,
    scoringRulesVersion: scenario.scoring_rules_version,
  });
}
