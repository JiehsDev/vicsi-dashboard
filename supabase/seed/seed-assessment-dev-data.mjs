// supabase/seed/seed-assessment-dev-data.mjs
//
// Creates the MINIMUM dataset needed to exercise the pairing/upload flow end
// to end in a development Supabase project: one instructor, one instructor-
// role "administrator" stand-in (see the note below - this schema has no
// real admin role yet), two students, one class, two enrollments, the
// CSI-ENVIRONMENT-001 scenario row, and one active assignment.
//
//   node --env-file=.env.local supabase/seed/seed-assessment-dev-data.mjs
//
// PREREQUISITES: migrations 001-012 already applied. Run AFTER
// seed-accounts.mjs is not required - this script creates its own accounts.
//
// Every value below is clearly fake/dev-only (2099- student ids, .invalid
// email domain) - never point this at a database holding real student
// records.
//
// Idempotent: safe to re-run. Uses upsert_profile (existing RPC) for
// accounts, and ON CONFLICT / existence checks for everything else.

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

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
  console.log("\nSeeding minimum ViCSI assessment dev data (clearly fake, dev-only)\n");

  // --- Accounts ---
  // NOTE on "administrator": public.profiles.role has a CHECK constraint of
  // ('instructor','student') only (see 001_profiles.sql) - there is no third
  // 'admin' value in this schema today. Creating a real admin role is a
  // constraint change to an EXISTING table, which is outside this seeding
  // script's job (and wasn't something the migration review was asked to
  // decide unilaterally). This account is seeded as role='instructor' with a
  // name that makes the stand-in obvious, so it's usable for now without
  // silently redefining what 'admin' means in the schema.
  const adminId = await ensureAccount({
    email: "dev-admin@test.traceboard.invalid",
    password: "dev-test-pass-1",
    profile: { role: "instructor", full_name: "[ADMIN STAND-IN, role=instructor] Dev Administrator" },
  });
  console.log("  + administrator (stand-in, role=instructor):", adminId);

  const instructorId = await ensureAccount({
    email: "dev-instructor@test.traceboard.invalid",
    password: "dev-test-pass-1",
    profile: { role: "instructor", full_name: "Dev Instructor (Test)" },
  });
  console.log("  + instructor:", instructorId);

  const studentAId = await ensureAccount({
    email: "2099-00001@students.traceboard.internal",
    password: "dev-test-pass-1",
    profile: { role: "student", full_name: "Test Student Alpha", student_id: "2099-00001", section: "Z", pin: "0001" },
  });
  console.log("  + student A:", studentAId);

  const studentBId = await ensureAccount({
    email: "2099-00002@students.traceboard.internal",
    password: "dev-test-pass-1",
    profile: { role: "student", full_name: "Test Student Beta", student_id: "2099-00002", section: "Z", pin: "0002" },
  });
  console.log("  + student B:", studentBId);

  // --- Class ---
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

  // --- Enrollments ---
  for (const studentId of [studentAId, studentBId]) {
    const { error } = await supabase
      .from("class_enrollments")
      .upsert({ class_id: classId, student_id: studentId }, { onConflict: "class_id,student_id" });
    if (error) throw error;
  }
  console.log("  + enrollments: 2");

  // --- Scenario (must match Assets/_Project/Data/Assessment/Scenario_CSI_Environment.asset exactly) ---
  const SCENARIO_ID = "CSI-ENVIRONMENT-001";
  const { error: scenarioError } = await supabase.from("scenarios").upsert(
    {
      scenario_id: SCENARIO_ID,
      display_name: "CSI Environment",
      scenario_version: "1.0.0",
      scoring_rules_version: "1.0.0",
      ground_truth_version: "1.0.0",
    },
    { onConflict: "scenario_id" },
  );
  if (scenarioError) throw scenarioError;
  console.log("  + scenario:", SCENARIO_ID);

  // --- Assignment ---
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
      .insert({
        class_id: classId,
        scenario_id: SCENARIO_ID,
        title: "Dev Test Assignment",
        is_active: true,
        created_by: instructorId,
      })
      .select("id")
      .single();
    if (error) throw error;
    assignmentId = data.id;
  }
  console.log("  + active assignment:", assignmentId);

  console.log("\nDone. Summary:\n");
  console.log(JSON.stringify({ adminId, instructorId, studentAId, studentBId, classId, scenarioId: SCENARIO_ID, assignmentId }, null, 2));
})().catch((err) => {
  console.error("\n  Failed:", err.message, "\n");
  process.exit(1);
});
