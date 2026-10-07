// src/app/api/v1/vr/student-directory/route.ts
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { apiSuccess, apiError, apiServerError } from "@/lib/apiResponse";
import { checkRateLimit, ipRateLimitKey, RATE_LIMITS } from "@/lib/rateLimit";
import {
  buildVrDirectory,
  buildVrTestStudent,
  checkVrDeviceKey,
  newVrCodeLookupParams,
  vrTestStudentNumber,
  type VrDirectoryRow,
} from "@/lib/vrAccessCodes";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Headset roster sync: every student enrolled in a non-archived class (or in
 *  ?classId= only), with what an offline headset needs to recognize a typed
 *  VR access code - stable student id, display name, classes, code version,
 *  enabled flag, and a salted PBKDF2 hash of the code (never the code itself;
 *  see vrAccessCodes.ts). Nothing else: no student number, grades, sessions,
 *  PIN, email or instructor data.
 *
 *  Called from Unity, not a browser: authenticated by the server-only
 *  VR_DEVICE_SYNC_KEY as `Authorization: Bearer <key>` (checkVrDeviceKey),
 *  never a Supabase session cookie. The RPC is service_role-only, same trust
 *  boundary as 011's RPCs: this route is the gate. */
export async function GET(request: Request) {
  const auth = checkVrDeviceKey(request);
  if (auth === "not-configured") {
    return apiServerError(new Error("VR_DEVICE_SYNC_KEY is not set"), "vr/student-directory");
  }
  if (auth !== "ok") {
    return apiError("UNAUTHORIZED", "This device is not authorized to sync the student directory.");
  }

  const ipKey = ipRateLimitKey(request, "vr-directory-ip");
  if (ipKey) {
    const limit = await checkRateLimit(ipKey, RATE_LIMITS.vrDirectoryPerIp.limit, RATE_LIMITS.vrDirectoryPerIp.windowSeconds);
    if (!limit.allowed) {
      return apiError("RATE_LIMITED", "Too many directory requests. Try again shortly.", { retryable: true });
    }
  }

  const classId = new URL(request.url).searchParams.get("classId");
  if (classId !== null && !UUID_PATTERN.test(classId)) {
    return apiError("VALIDATION_ERROR", "classId must be a UUID.", {
      fieldErrors: [{ field: "classId", message: "classId must be a UUID." }],
    });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("get_vr_student_directory", { p_class_id: classId });
  if (error) {
    return apiServerError(error, "get_vr_student_directory");
  }

  const directory = await buildVrDirectory((data ?? []) as VrDirectoryRow[], newVrCodeLookupParams());

  // The EXISTING test student for "Continue Without Code" (see vrTestStudentNumber),
  // so the headset can attribute test sessions to its real stable id offline.
  // Lookup failure only omits it - the roster itself is still returned.
  let testStudent = null;
  const testNumber = vrTestStudentNumber();
  if (testNumber) {
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id, full_name")
      .eq("student_id", testNumber)
      .eq("role", "student")
      .maybeSingle();
    if (profileError) {
      console.warn("[vr/student-directory] test student lookup failed:", profileError.message);
    } else if (profile) {
      const { data: enrollments, error: enrollmentError } = await admin
        .from("class_enrollments")
        .select("class_id, classes(id, name, section, archived_at)")
        .eq("student_id", profile.id);
      if (enrollmentError) {
        console.warn("[vr/student-directory] test student classes lookup failed:", enrollmentError.message);
      }
      testStudent = buildVrTestStudent(profile, (enrollments ?? []) as unknown as Parameters<typeof buildVrTestStudent>[1]);
    }
  }

  const response = apiSuccess({
    generatedAtUtc: new Date().toISOString(),
    classId,
    ...directory,
    testStudent,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
