// supabase/seed/seed-john-doe-bypass-identity.mjs
//
// TEMPORARY DEVELOPMENT BYPASS support script - see
// Assets/_Project/Scripts/Assessment/PreSessionFlowController.cs in the Unity
// repo (developmentBypassRealAssessmentToken and friends) for where the
// values this prints actually get used.
//
// Creates (idempotently) the minimum real dev dataset for a "John Doe" test
// student - one profile, one class enrollment, one active assignment on
// CSI-ENVIRONMENT-001 - using the exact same ensureAccount/upsert_profile
// pattern seed-assessment-dev-data.mjs already established, then mints a
// REAL assessment_tokens row directly (same table, same shape the real
// POST /api/v1/device-pairings/exchange route writes - see that route's own
// ASSESSMENT_TOKEN_TTL_SECONDS comment) with a LONG expiry so a temporary
// global pairing bypass doesn't need re-minting every 4 hours during an
// extended dev/testing period. This is NOT a fake/local-only credential: the
// token this prints is bearer-authenticated by POST /api/v1/assessment-sessions
// through the exact same code path as a normally paired student's token.
//
//   node --env-file=.env.local supabase/seed/seed-john-doe-bypass-identity.mjs [--ttl-days=365]
//
// PREREQUISITES: migrations 001-017 already applied.
//
// Only ever creates/reads clearly-fake, dev-only data (a .invalid email
// domain, a 2099- prefixed student id) - never point this at a database
// holding real student records. Safe to re-run: re-running mints a NEW
// token (the old one still works until its own expiry/revocation - this
// script never revokes a previous token), it does not rotate or invalidate
// anything by itself.
//
// TODO BEFORE FINAL DEPLOYMENT: this script (and the identity/token it
// mints) should be deleted or at minimum never run against a production
// Supabase project - see PreSessionFlowController's own restoration TODO.

import { createClient } from "@supabase/supabase-js";
import { randomBytes, createHash } from "node:crypto";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const ttlDaysArg = process.argv.find((a) => a.startsWith("--ttl-days="));
const ttlDays = ttlDaysArg ? Number(ttlDaysArg.split("=")[1]) : 365;

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function generateAssessmentToken() {
  return randomBytes(32).toString("base64url");
}
function sha256Hex(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function findUserByEmail(email) {
  const target = email.toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function ensureAccount({ email, password, profile }) {
  const existing = await findUserByEmail(email);
  let userId;
  if (existing) {
    userId = existing.id;
    const { error } = await supabase.auth.admin.updateUserById(userId, { password, email_confirm: true });
    if (error) throw error;
  } else {
    const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;
  }
  const { error: rpcError } = await supabase.rpc("upsert_profile", {
    p_id: userId,
    p_role: profile.role,
    p_full_name: profile.full_name,
    p_student_id: profile.student_id ?? null,
    p_section: profile.section ?? null,
    p_pin: profile.pin ?? null,
  });
  if (rpcError) throw rpcError;
  return userId;
}

(async () => {
  console.log("\nSeeding John Doe temporary-bypass identity (dev-only)\n");

  const instructorId = await ensureAccount({
    email: "dev-instructor@test.traceboard.invalid",
    password: "dev-test-pass-1",
    profile: { role: "instructor", full_name: "Dev Instructor (Test)" },
  });
  console.log("  + instructor (owner of the bypass class):", instructorId);

  const johnDoeId = await ensureAccount({
    email: "2099-00099@students.traceboard.internal",
    password: "dev-test-pass-1",
    profile: { role: "student", full_name: "John Doe", student_id: "2099-00099", section: "Z", pin: "0099" },
  });
  console.log("  + student (John Doe):", johnDoeId);

  const CLASS_NAME = "ViCSI Dev Test Class";
  let { data: existingClass } = await supabase
    .from("classes")
    .select("id")
    .eq("name", CLASS_NAME)
    .eq("instructor_id", instructorId)
    .maybeSingle();
  let classId = existingClass?.id;
  if (!classId) {
    const { data, error } = await supabase
      .from("classes")
      .insert({ name: CLASS_NAME, section: "Z", instructor_id: instructorId })
      .select("id")
      .single();
    if (error) throw error;
    classId = data.id;
  }
  console.log("  + class:", classId);

  const { error: enrollError } = await supabase
    .from("class_enrollments")
    .upsert({ class_id: classId, student_id: johnDoeId }, { onConflict: "class_id,student_id" });
  if (enrollError) throw enrollError;
  console.log("  + enrollment: John Doe -> class");

  const SCENARIO_ID = "CSI-ENVIRONMENT-001";
  const { data: scenarioRow, error: scenarioError } = await supabase
    .from("scenarios")
    .upsert(
      {
        scenario_id: SCENARIO_ID,
        display_name: "CSI Environment",
        scenario_version: "1.0.0",
        scoring_rules_version: "1.0.0",
        ground_truth_version: "1.0.0",
      },
      { onConflict: "scenario_id" },
    )
    .select("scenario_version, scoring_rules_version")
    .single();
  if (scenarioError) throw scenarioError;
  console.log("  + scenario:", SCENARIO_ID);

  let { data: existingAssignment } = await supabase
    .from("assessment_assignments")
    .select("id")
    .eq("class_id", classId)
    .eq("scenario_id", SCENARIO_ID)
    .maybeSingle();
  let assignmentId = existingAssignment?.id;
  if (!assignmentId) {
    const { data, error } = await supabase
      .from("assessment_assignments")
      .insert({ class_id: classId, scenario_id: SCENARIO_ID, title: "Dev Test Assignment", is_active: true, created_by: instructorId })
      .select("id")
      .single();
    if (error) throw error;
    assignmentId = data.id;
  }
  console.log("  + active assignment:", assignmentId);

  // Mint a real assessment_tokens row directly - same table/shape
  // POST /api/v1/device-pairings/exchange writes, just with a long TTL
  // suited to an extended temporary-bypass testing period instead of that
  // route's fixed 4-hour TTL.
  const plainToken = generateAssessmentToken();
  const tokenHash = sha256Hex(plainToken);
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();

  const { error: insertError } = await supabase.from("assessment_tokens").insert({
    token_hash: tokenHash,
    student_id: johnDoeId,
    class_id: classId,
    assignment_id: assignmentId,
    scenario_id: SCENARIO_ID,
    expires_at: expiresAt,
  });
  if (insertError) throw insertError;

  console.log("\nDone. Paste these into PreSessionFlowController's Inspector fields\n(Development bypass - real captured token section):\n");
  console.log(
    JSON.stringify(
      {
        developmentBypassStudentDisplayName: "John Doe",
        developmentBypassClassDisplayName: existingClass ? CLASS_NAME + " - Z" : CLASS_NAME + " - Z",
        developmentBypassRealAssessmentToken: plainToken,
        developmentBypassRealTokenExpiresAtUtc: expiresAt,
        developmentBypassRealAssignmentId: assignmentId,
        developmentBypassRealScenarioId: SCENARIO_ID,
        developmentBypassRealScenarioVersion: scenarioRow.scenario_version,
        developmentBypassRealScoringRulesVersion: scenarioRow.scoring_rules_version,
      },
      null,
      2,
    ),
  );
  console.log(`\nToken expires ${expiresAt} (~${ttlDays} days from now). The plaintext token above is shown ONCE - only its hash is stored.\n`);
})().catch((err) => {
  console.error("\n  Failed:", err.message, "\n");
  process.exit(1);
});
