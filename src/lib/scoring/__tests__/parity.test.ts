// src/lib/scoring/__tests__/parity.test.ts
//
// Golden-fixture parity suite (Part 3): for each fixture under
// src/lib/scoring/__fixtures__/*.jsonl, runs BOTH the real .NET
// Tools/EvidenceScorer (the reference implementation) and this project's
// TypeScript port, and requires every PORTED category to match exactly
// (both round to 4 decimal places, so "exact" is achievable, not just
// "close"). A session with an undefined/NaN category on one side must be
// undefined/NaN on the other too - never treated as equal to 0.
//
// Only the six categories Tools/EvidenceScorer itself computes are compared
// here (criticalRecall, relevantRecall, precision, distractorFallRate,
// reasoningAccuracy, documentationAccuracy). relationshipAccuracy,
// proceduralCompliance, finalConclusionAccuracy, and overallScore have no
// .NET reference to parity-check against by design (see relationshipScorer
// .ts/proceduralScorer.ts/conclusionScorer.ts/overallScore.ts's own class
// comments) - those are covered by ordinary unit tests instead, not parity.
//
// Run with: npm run test:scoring-parity
// Requires the `dotnet` SDK and a sibling checkout of the Unity project at
// VICSI_UNITY_PROJECT_PATH (default: the exact relative path this repo and
// the Unity project have on this machine - see DEFAULT_UNITY_PROJECT_PATH
// below). If dotnet or the Unity project path isn't found, every test in
// this file is SKIPPED with a clear reason, never silently passed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scoreEvidence } from "../evidenceScorer.ts";
import { CSI_ENVIRONMENT_GROUND_TRUTH_V1 } from "../data/csiEnvironment.v1.ts";
import type { ScoringSessionEvent } from "../types.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(HERE, "..", "__fixtures__");

const DEFAULT_UNITY_PROJECT_PATH = path.join(HERE, "..", "..", "..", "..", "..", "..", "My project (1)");
const UNITY_PROJECT_PATH = process.env.VICSI_UNITY_PROJECT_PATH ?? DEFAULT_UNITY_PROJECT_PATH;
const SCORER_PROJECT = path.join(UNITY_PROJECT_PATH, "Tools", "EvidenceScorer");
const REAL_GROUND_TRUTH_EXPORT = path.join(UNITY_PROJECT_PATH, "Assets", "_Project", "Data", "Scenarios", "GroundTruth_CSI_Environment.json");

const FIXTURES = [
  "complete-correct-wife",
  "incorrect-brother",
  "partial-investigation",
  "premature-submission",
  "distractor-heavy",
  "procedural-violation-heavy",
  "missing-critical-evidence",
  "correct-evidence-incorrect-reasoning",
];

// Program.cs's WriteOptions sets PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
// so the .NET tool's own JSON output uses camelCase keys too - not the
// PascalCase the C# property names themselves use.
const PORTED_CATEGORIES = [
  ["criticalRecall", "criticalRecall"],
  ["relevantRecall", "relevantRecall"],
  ["precision", "precision"],
  ["distractorFallRate", "distractorFallRate"],
  ["reasoningAccuracy", "reasoningAccuracy"],
  ["documentationAccuracy", "documentationAccuracy"],
] as const;

function dotnetAvailable(): boolean {
  try {
    execFileSync("dotnet", ["--version"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function readFixtureEvents(name: string): ScoringSessionEvent[] {
  const raw = fs.readFileSync(path.join(FIXTURES_DIR, `${name}.jsonl`), "utf8");
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l));
}

function runDotnetScorer(fixtureName: string): Record<string, number> {
  const sessionPath = path.join(FIXTURES_DIR, `${fixtureName}.jsonl`);
  const stdout = execFileSync("dotnet", ["run", "--project", SCORER_PROJECT, "--", sessionPath, REAL_GROUND_TRUTH_EXPORT], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  // Program.cs prints a human summary, a blank line, then the JSON report -
  // the JSON is always the last non-empty block, so parse from the first '{'
  // found after the blank-line separator rather than the whole stdout.
  const jsonStart = stdout.lastIndexOf("\n{");
  const jsonText = stdout.slice(jsonStart + 1);
  return JSON.parse(jsonText);
}

const skipReason = !dotnetAvailable()
  ? "dotnet SDK not found on PATH"
  : !fs.existsSync(SCORER_PROJECT)
    ? `Unity project's Tools/EvidenceScorer not found at ${SCORER_PROJECT} (set VICSI_UNITY_PROJECT_PATH)`
    : !fs.existsSync(REAL_GROUND_TRUTH_EXPORT)
      ? `Ground truth export not found at ${REAL_GROUND_TRUTH_EXPORT}`
      : null;

for (const fixtureName of FIXTURES) {
  test(`parity: ${fixtureName}`, { skip: skipReason ?? false }, () => {
    const dotnetReport = runDotnetScorer(fixtureName);
    const events = readFixtureEvents(fixtureName);
    const tsReport = scoreEvidence(events, CSI_ENVIRONMENT_GROUND_TRUTH_V1);

    for (const [tsKey, dotnetKey] of PORTED_CATEGORIES) {
      const dotnetValue = dotnetReport[dotnetKey];
      const tsValue = (tsReport as unknown as Record<string, number | undefined>)[tsKey];

      const dotnetIsNaN = typeof dotnetValue !== "number" || Number.isNaN(dotnetValue);
      const tsIsUndefined = tsValue === undefined;

      if (dotnetIsNaN || tsIsUndefined) {
        assert.equal(dotnetIsNaN, tsIsUndefined, `${fixtureName}.${tsKey}: .NET NaN=${dotnetIsNaN}, TS undefined=${tsIsUndefined} (must match)`);
        continue;
      }

      assert.ok(
        Math.abs(dotnetValue - tsValue) < 1e-9,
        `${fixtureName}.${tsKey}: .NET=${dotnetValue} TS=${tsValue}`,
      );
    }
  });
}
