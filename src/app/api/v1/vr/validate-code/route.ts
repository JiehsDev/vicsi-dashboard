// src/app/api/v1/vr/validate-code/route.ts
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { apiSuccess, apiError, apiServerError } from "@/lib/apiResponse";
import { checkRateLimit, ipRateLimitKey, RATE_LIMITS } from "@/lib/rateLimit";
import { buildVrValidation, checkVrDeviceKey, normalizeVrAccessCode, type VrValidationRow } from "@/lib/vrAccessCodes";

interface ValidateBody {
  accessCode?: unknown;
  deviceInstallationId?: unknown;
}

const INVALID_MESSAGE = "That code isn't valid. Check it with your instructor.";

/** Online check of one typed VR access code. Same device authentication as
 *  student-directory (VR_DEVICE_SYNC_KEY bearer). Returns only the stable
 *  student id, display name, code version and active classes - the
 *  confirm-back data BUSINESS_RULES.md 2.4 asks for, nothing more.
 *
 *  Unknown, malformed and disabled codes all get the same VR_CODE_INVALID
 *  answer, so the endpoint never confirms that a code exists. Rate limited
 *  per device (deviceInstallationId, pseudonymous, never stored) and per
 *  hashed IP, mirroring device-pairings/exchange. The code is never logged. */
export async function POST(request: Request) {
  const auth = checkVrDeviceKey(request);
  if (auth === "not-configured") {
    return apiServerError(new Error("VR_DEVICE_SYNC_KEY is not set"), "vr/validate-code");
  }
  if (auth !== "ok") {
    return apiError("UNAUTHORIZED", "This device is not authorized to validate codes.");
  }

  let body: ValidateBody;
  try {
    body = await request.json();
  } catch {
    return apiError("VALIDATION_ERROR", "Request body must be valid JSON.");
  }
  if (typeof body.accessCode !== "string" || body.accessCode.trim() === "") {
    return apiError("VALIDATION_ERROR", "accessCode is required.", {
      fieldErrors: [{ field: "accessCode", message: "accessCode is required." }],
    });
  }
  const deviceInstallationId =
    typeof body.deviceInstallationId === "string" && body.deviceInstallationId.length <= 128 ? body.deviceInstallationId : null;

  // Limits run before the format check so malformed guesses cost budget too.
  if (deviceInstallationId) {
    const deviceLimit = await checkRateLimit(
      `vr-validate:${deviceInstallationId}`,
      RATE_LIMITS.vrValidatePerDevice.limit,
      RATE_LIMITS.vrValidatePerDevice.windowSeconds,
    );
    if (!deviceLimit.allowed) {
      return apiError("RATE_LIMITED", "Too many attempts. Try again shortly.", { retryable: true });
    }
  }
  const ipKey = ipRateLimitKey(request, "vr-validate-ip");
  if (ipKey) {
    const ipLimit = await checkRateLimit(ipKey, RATE_LIMITS.vrValidatePerIp.limit, RATE_LIMITS.vrValidatePerIp.windowSeconds);
    if (!ipLimit.allowed) {
      return apiError("RATE_LIMITED", "Too many attempts. Try again shortly.", { retryable: true });
    }
  }

  const accessCode = normalizeVrAccessCode(body.accessCode);
  if (!accessCode) {
    return apiError("VR_CODE_INVALID", INVALID_MESSAGE);
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("validate_vr_access_code", { p_access_code: accessCode });
  if (error) {
    return apiServerError(error, "validate_vr_access_code");
  }

  const student = buildVrValidation((data ?? []) as VrValidationRow[]);
  if (!student) {
    return apiError("VR_CODE_INVALID", INVALID_MESSAGE);
  }
  const response = apiSuccess(student);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
