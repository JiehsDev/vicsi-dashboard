// src/lib/scoring/__fixtures__/generate-fixtures.mjs
//
// One-off generator for the golden-fixture JSONL session logs used by
// src/lib/scoring/__tests__/parity.test.ts. Run with:
//   node src/lib/scoring/__fixtures__/generate-fixtures.mjs
// Re-run only if the fixture SCRIPTS below change - the .jsonl output is
// checked in and is what the parity suite actually reads (both the .NET
// EvidenceScorer and the TypeScript scorer consume the exact same files).
//
// Each fixture is a hand-designed sequence of real SessionEvent-shaped rows
// (same fields Unity's own LocalJsonLogWriter/SessionLogger produce),
// authored directly rather than played through Unity - deterministic, no
// gameplay flakiness, and every event type the scorer actually branches on
// is represented at least once across the eight fixtures.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = path.dirname(fileURLToPath(import.meta.url));

let seq = 0;
function evt(sessionId, eventType, targetId, payload = {}) {
  return {
    sessionId,
    sequenceNumber: seq++,
    timestampMs: seq * 1000,
    eventType,
    targetId,
    payload: Object.entries(payload).map(([key, value]) => ({ key, value: String(value) })),
  };
}

function markEvidence(sessionId, evidenceId, statuses) {
  const events = [];
  for (const status of statuses) {
    events.push(evt(sessionId, "EvidenceStatusChanged", evidenceId, { status }));
  }
  return events;
}

function hypothesis(sessionId, checkpointId, selectedOptionId, reasoningOptionId) {
  return evt(sessionId, "HypothesisSubmitted", checkpointId, {
    selectedOptionId,
    ...(reasoningOptionId ? { reasoningOptionId } : {}),
  });
}

function reportLines(sessionId, evidenceId, lineIds) {
  return evt(sessionId, "ReportLinesSelected", evidenceId, { lineIds: lineIds.join(",") });
}

const FULL_LIFECYCLE = [
  "Found", "PhotographedRaw", "ChalkMarked", "Marked", "PhotographedFinal",
  "Logged", "ReadyForCollection", "Collected", "Sealed", "Processed",
];

function writeFixture(name, events) {
  const lines = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
  fs.writeFileSync(path.join(OUT_DIR, `${name}.jsonl`), lines);
  console.log(`wrote ${name}.jsonl (${events.length} events)`);
}

// --- 1. Complete correct wife conclusion ---
{
  seq = 0;
  const sid = "fixture-complete-correct-wife";
  const events = [
    ...markEvidence(sid, "EVD-014", FULL_LIFECYCLE),
    reportLines(sid, "EVD-014", ["knife-blade-length", "knife-blood-trace", "knife-location", "knife-print-on-handle", "knife-wound-match"]),
    ...markEvidence(sid, "EVD-015", FULL_LIFECYCLE),
    reportLines(sid, "EVD-015", ["blood-spatter-location", "blood-spatter-droplet-pattern", "blood-spatter-swab-collection", "blood-spatter-mechanism-only"]),
    ...markEvidence(sid, "EVD-017", FULL_LIFECYCLE),
    reportLines(sid, "EVD-017", ["phone-screen-down-position", "phone-ownership-established", "phone-call-history-potential", "phone-fingerprint-pending"]),
    ...markEvidence(sid, "EVD-019", FULL_LIFECYCLE),
    reportLines(sid, "EVD-019", ["glove-outside-blood", "glove-hidden-location", "glove-inside-print", "glove-fingerprint-confirms-wearer"]),
    hypothesis(sid, "HYP-02", "opt-impact", "hyp02-blood-spatter-impact"),
    hypothesis(sid, "HYP-03", "opt-gloves", "hyp03-gloves-wife-match"),
  ];
  writeFixture("complete-correct-wife", events);
}

// --- 2. Incorrect brother conclusion ---
{
  seq = 0;
  const sid = "fixture-incorrect-brother";
  const events = [
    ...markEvidence(sid, "EVD-014", FULL_LIFECYCLE),
    ...markEvidence(sid, "EVD-015", FULL_LIFECYCLE),
    ...markEvidence(sid, "EVD-017", FULL_LIFECYCLE),
    ...markEvidence(sid, "EVD-019", FULL_LIFECYCLE),
    hypothesis(sid, "HYP-02", "opt-impact", "hyp02-blood-spatter-impact"),
    // Wrong reasoning pick - points at the brother instead of the wife.
    hypothesis(sid, "HYP-03", "opt-brother", "hyp03-knife-print-implicates-brother"),
  ];
  writeFixture("incorrect-brother", events);
}

// --- 3. Partial investigation (session ends mid-lifecycle) ---
{
  seq = 0;
  const sid = "fixture-partial-investigation";
  const events = [
    ...markEvidence(sid, "EVD-014", ["Found", "PhotographedRaw", "ChalkMarked", "Marked"]),
    ...markEvidence(sid, "EVD-015", ["Found", "PhotographedRaw"]), // never reaches Marked
    ...markEvidence(sid, "EVD-017", FULL_LIFECYCLE),
    // EVD-019 never found at all.
    hypothesis(sid, "HYP-02", "opt-impact", "hyp02-blood-spatter-impact"),
  ];
  writeFixture("partial-investigation", events);
}

// --- 4. Premature submission (barely started) ---
{
  seq = 0;
  const sid = "fixture-premature-submission";
  const events = [
    ...markEvidence(sid, "EVD-014", ["Found", "PhotographedRaw"]),
  ];
  writeFixture("premature-submission", events);
}

// --- 5. Distractor-heavy investigation ---
{
  seq = 0;
  const sid = "fixture-distractor-heavy";
  const events = [
    ...markEvidence(sid, "EVD-014", FULL_LIFECYCLE),
    ...markEvidence(sid, "EVD-015", FULL_LIFECYCLE),
    // Fell for the distractor - marked, then eventually processed like real evidence.
    ...markEvidence(sid, "EVD-018", FULL_LIFECYCLE),
    ...markEvidence(sid, "EVD-017", ["Found"]), // barely touched
    hypothesis(sid, "HYP-02", "opt-bottle", "hyp02-bottle-intoxication"),
  ];
  writeFixture("distractor-heavy", events);
}

// --- 6. Procedural-violation-heavy investigation ---
{
  seq = 0;
  const sid = "fixture-procedural-violation-heavy";
  const events = [
    ...markEvidence(sid, "EVD-014", FULL_LIFECYCLE),
    evt(sid, "EvidenceTransitionBlocked", "EVD-015", { attempted: "Logged", reason: "swab required" }),
    evt(sid, "EvidenceTransitionBlocked", "EVD-015", { attempted: "Logged", reason: "swab required" }),
    evt(sid, "NonEvidenceMarked", "DECORATIVE_VASE"),
    evt(sid, "NonEvidenceMarked", "FAMILY_PHOTO"),
    evt(sid, "MarkerReclaimBlocked", "EVD-014"),
    ...markEvidence(sid, "EVD-015", FULL_LIFECYCLE),
    evt(sid, "MarkerReclaimed", "EVD-015"),
  ];
  writeFixture("procedural-violation-heavy", events);
}

// --- 7. Missing critical evidence ---
{
  seq = 0;
  const sid = "fixture-missing-critical-evidence";
  const events = [
    // Only the Relevant item is fully processed; all three Critical items
    // (EVD-014, EVD-015, EVD-019) are never found.
    ...markEvidence(sid, "EVD-017", FULL_LIFECYCLE),
    reportLines(sid, "EVD-017", ["phone-screen-down-position", "phone-ownership-established"]),
  ];
  writeFixture("missing-critical-evidence", events);
}

// --- 8. Correct evidence with incorrect reasoning ---
{
  seq = 0;
  const sid = "fixture-correct-evidence-incorrect-reasoning";
  const events = [
    ...markEvidence(sid, "EVD-014", FULL_LIFECYCLE),
    ...markEvidence(sid, "EVD-015", FULL_LIFECYCLE),
    ...markEvidence(sid, "EVD-017", FULL_LIFECYCLE),
    ...markEvidence(sid, "EVD-019", FULL_LIFECYCLE),
    // Every critical/relevant item recalled perfectly, but both reasoning
    // picks are wrong.
    hypothesis(sid, "HYP-02", "opt-knife", "hyp02-knife-routine-use"),
    hypothesis(sid, "HYP-03", "opt-phone", "hyp03-phone-overclaim"),
  ];
  writeFixture("correct-evidence-incorrect-reasoning", events);
}

console.log("done.");
