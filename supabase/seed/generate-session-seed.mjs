#!/usr/bin/env node
// supabase/seed/generate-session-seed.mjs
//
// Turns a real Unity session capture (.jsonl) + its matching ground-truth
// export into a reviewable seed .sql file - the same manual-review-then-run
// workflow as every migration in this project. Never connects to Supabase;
// the output is text for a human to read before running it in the SQL
// Editor. This generalizes the one-off script that built the very first
// seed-test-session.sql (for session_2b5f5209-...) - that script was never
// checked into this repo at all, only ever a scratch file in an assistant
// session's temp directory, which is exactly the "ad-hoc code is not a
// deliverable" gap this project has hit before. The mapping logic below
// (event_kind/correct rules, the 0-based -> 1-based sequence offset, the
// ms -> elapsed HH:MM:SS conversion) is extracted from that script
// unchanged, not rewritten from memory, specifically to avoid silently
// reintroducing a bug that was already hand-verified fixed once.
//
// Usage:
//   node supabase/seed/generate-session-seed.mjs <session.jsonl> <groundtruth.json> \
//     --student-id=<id> --student-name=<name> --identity-status=real|placeholder \
//     [--scenario-name=<name>] [--out-dir=<dir>]
//
// --student-id, --student-name, and --identity-status are all REQUIRED, on
// purpose - there is no default identity of any kind, placeholder included.
// Unity captures no real student identity today, so every run must make a
// conscious, visible choice: either supply the real values because the
// operator genuinely knows whose session this is, or supply an explicit
// placeholder (e.g. id 'TEST-STUDENT-001', a name like
// "TEST SEED - Unity capture, not a real student") and pass
// --identity-status=placeholder so the generated file says so loudly rather
// than making a reviewer infer it from the id's shape.
//
// accuracy/compliance are always NULL - no formula exists yet for collapsing
// the offline scorer's separate metrics into these two columns, and this
// tool does not invent one. Do not add that logic here without a real,
// separately-decided formula.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function fail(message) {
  console.error("\n  " + message + "\n");
  process.exit(1);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (const raw of argv) {
    if (raw.startsWith("--")) {
      const eq = raw.indexOf("=");
      if (eq === -1) args[raw.slice(2)] = true;
      else args[raw.slice(2, eq)] = raw.slice(eq + 1);
    } else {
      args._.push(raw);
    }
  }
  return args;
}

const USAGE =
  "usage: node generate-session-seed.mjs <session.jsonl> <groundtruth.json> " +
  "--student-id=<id> --student-name=<name> --identity-status=real|placeholder " +
  "[--scenario-name=<name>] [--out-dir=<dir>]";

const args = parseArgs(process.argv.slice(2));
const [sessionPath, groundTruthPath] = args._;

if (!sessionPath || !groundTruthPath) fail(USAGE);
if (!args["student-id"]) fail("--student-id is required - no default, real or placeholder. " + USAGE);
if (!args["student-name"]) fail("--student-name is required - no default, real or placeholder. " + USAGE);
if (args["identity-status"] !== "real" && args["identity-status"] !== "placeholder") {
  fail("--identity-status must be exactly 'real' or 'placeholder' (forces a conscious choice every run). " + USAGE);
}

const studentId = String(args["student-id"]);
const studentName = String(args["student-name"]);
const identityStatus = args["identity-status"];
const scenarioNameOverrideArg = typeof args["scenario-name"] === "string" ? args["scenario-name"] : null;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outDir = typeof args["out-dir"] === "string" ? args["out-dir"] : scriptDir;

/* ---------------- Mapping logic, extracted unchanged from the original
   scratch generator (see file header) - do not re-derive from memory. ---------------- */

const SKIP_EVENT_TYPES = new Set(["SessionStarted", "SessionEnded", "SceneEntered", "HypothesisSubmitted"]);

function elapsed(ms) {
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function payloadGet(payload, key) {
  const entry = payload.find((p) => p.key === key);
  return entry ? entry.value : null;
}

function buildRows(lines, ground) {
  const rows = [];
  let sessionStart = null;
  let sessionEnd = null;
  let sessionId = null;

  for (const evt of lines) {
    if (sessionId === null) sessionId = evt.sessionId;
    if (evt.eventType === "SessionStarted") sessionStart = evt.timestampMs;
    if (evt.eventType === "SessionEnded") sessionEnd = evt.timestampMs;
    if (SKIP_EVENT_TYPES.has(evt.eventType)) continue;

    const sequence = evt.sequenceNumber + 1; // 0-based -> 1-based, per the live table's convention
    const ts = elapsed(evt.timestampMs);
    const gt = ground[evt.targetId];

    if (evt.eventType === "EvidenceStatusChanged") {
      const status = payloadGet(evt.payload, "status");
      if (!gt) {
        fail(
          `Event references evidenceId "${evt.targetId}" (sequence ${evt.sequenceNumber}), ` +
          "which is not in the supplied ground-truth file. Wrong ground-truth file for this session?"
        );
      }
      if (status === "Marked") {
        let correct;
        if (gt.relevance === "Critical" || gt.relevance === "Relevant") correct = true;
        else if (gt.relevance === "Distractor") correct = false;
        else {
          fail(
            `"${evt.targetId}" has EvidenceRelevance.Neutral and was Marked (sequence ${evt.sequenceNumber}). ` +
            "The correct value for a Neutral item's Marked row is genuinely undecided (see the original " +
            "seed-test-session.sql's own note on this) - this tool refuses to guess. Resolve this manually " +
            "for this one session rather than trusting an invented default here."
          );
        }
        rows.push({ sequence, ts, action: "Marked evidence", item: gt.name, eventKind: "inferential", correct });
      } else {
        rows.push({ sequence, ts, action: status, item: gt.name, eventKind: "informational", correct: null });
      }
    } else if (evt.eventType === "EvidenceTransitionBlocked") {
      rows.push({ sequence, ts, action: "Skipped step", item: gt ? gt.name : evt.targetId, eventKind: "procedural", correct: false });
    } else if (evt.eventType === "NonEvidenceMarked") {
      const objName = payloadGet(evt.payload, "objectName") ?? evt.targetId;
      rows.push({ sequence, ts, action: "Marked non-evidence", item: objName, eventKind: "inferential", correct: false });
    } else if (evt.eventType === "MarkerReclaimBlocked") {
      rows.push({ sequence, ts, action: "Reclaim blocked", item: gt ? gt.name : evt.targetId, eventKind: "procedural", correct: false });
    } else if (evt.eventType === "MarkerReclaimed") {
      rows.push({ sequence, ts, action: "Reclaimed marker", item: gt ? gt.name : evt.targetId, eventKind: "informational", correct: null });
    } else {
      fail(`Unmapped event type "${evt.eventType}" at sequence ${evt.sequenceNumber} - extend the mapping before running this session through.`);
    }
  }

  if (sessionStart === null || sessionEnd === null) {
    fail("Session file is missing a SessionStarted or SessionEnded event - cannot compute time_on_task_min.");
  }

  const timeOnTaskMin = Math.round((sessionEnd - sessionStart) / 60000);
  const errorCount = rows.filter(
    (r) => r.action === "Skipped step" || r.action === "Reclaim blocked" || r.action === "Marked non-evidence",
  ).length;

  return { rows, sessionId, timeOnTaskMin, errorCount };
}

/* ---------------- SQL generation ---------------- */

function sqlString(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function sqlValue(value) {
  return value === null || value === undefined ? "null" : sqlString(value);
}

function sqlBool(value) {
  return value === null ? "null" : value ? "true" : "false";
}

function buildSql({ sessionId, scenarioId, scenarioName, studentId, studentName, identityStatus, timeOnTaskMin, errorCount, rows }) {
  const identityBanner =
    identityStatus === "placeholder"
      ? "PLACEHOLDER IDENTITY - studentId/studentName below do NOT identify a real student.\n" +
        "-- Unity captures no real student identity today; this is a deliberate stand-in."
      : "REAL IDENTITY - studentId/studentName below are believed to identify a real student,\n" +
        "-- supplied by the operator running this tool, not verified against the live database here.";

  const header = `-- seed-session-${sessionId}.sql
--
-- Generated by supabase/seed/generate-session-seed.mjs from a real Unity
-- session capture. Review before running - same workflow as every other
-- file in supabase/migrations and supabase/seed.
--
-- ${identityBanner}
--
-- accuracy/compliance are intentionally NULL: no agreed formula yet exists
-- for collapsing the offline scorer's separate metrics (criticalRecall,
-- relevantRecall, precision, distractorFallRate) into these two columns.
--
-- error_count = count of EvidenceTransitionBlocked + NonEvidenceMarked +
-- MarkerReclaimBlocked events in this session (${errorCount} here) - the
-- decided definition for this seed shape, not a placeholder.
--
-- time_on_task_min = round((SessionEnded.timestampMs - SessionStarted.timestampMs) / 60000)
-- = ${timeOnTaskMin} for this session.
--
-- scenario_name: no human-readable display name exists anywhere in either
-- codebase for "${scenarioId}" (only the internal id) unless overridden via
-- --scenario-name; used as "${scenarioName}" here.
--
-- event_timestamp is elapsed time (HH:MM:SS from timestampMs), not wall
-- clock, matching the live rows' format.
--
-- If this row represents test data rather than a real student, delete it
-- (and its evidence_events rows, which cascade via the session_id foreign
-- key) before any real student data exists in this table.

begin;

insert into public.student_session_summary
    (id, name, role, scenario_id, scenario_name, accuracy, compliance, time_on_task_min, error_count, session_id)
values
    (${sqlString(studentId)}, ${sqlString(studentName)}, 'student', ${sqlString(scenarioId)}, ${sqlString(scenarioName)}, null, null, ${timeOnTaskMin}, ${errorCount}, ${sqlString(sessionId)});
`;

  const valuesLines = rows
    .map(
      (r) =>
        `    (${sqlString(sessionId)}, ${r.sequence}, ${sqlString(r.ts)}, ${sqlString(r.action)}, ${sqlString(r.item)}, ${sqlString(r.eventKind)}, ${sqlBool(r.correct)})`,
    )
    .join(",\n");

  const eventsInsert = `
insert into public.evidence_events
    (session_id, sequence, event_timestamp, action, item, event_kind, correct)
values
${valuesLines};

commit;
`;

  return header + eventsInsert;
}

/* ---------------- Main ---------------- */

const groundTruthRaw = JSON.parse(fs.readFileSync(groundTruthPath, "utf8"));
const scenarioId = groundTruthRaw.scenarioId;
const scenarioName = scenarioNameOverrideArg ?? scenarioId;

const ground = {};
for (const item of groundTruthRaw.evidence) {
  ground[item.evidenceId] = { name: item.displayName, relevance: item.relevance };
}

const lines = fs
  .readFileSync(sessionPath, "utf8")
  .trim()
  .split("\n")
  .map((l) => JSON.parse(l));

const { rows, sessionId, timeOnTaskMin, errorCount } = buildRows(lines, ground);

const sql = buildSql({
  sessionId,
  scenarioId,
  scenarioName,
  studentId,
  studentName,
  identityStatus,
  timeOnTaskMin,
  errorCount,
  rows,
});

const outPath = path.join(outDir, `seed-session-${sessionId}.sql`);
fs.writeFileSync(outPath, sql, "utf8");

console.log(`\n  Wrote ${rows.length} evidence_events row(s) + 1 student_session_summary row to:`);
console.log(`    ${outPath}`);
console.log(`\n  identity: ${identityStatus} (${studentId} / ${studentName})`);
console.log(`  time_on_task_min=${timeOnTaskMin} error_count=${errorCount}`);
console.log("\n  Review the file, then run it in the Supabase SQL Editor. Not applied automatically.\n");
