// src/lib/__tests__/vrAccessCodes.test.ts
//
// Run with: node --conditions=react-server --experimental-strip-types --test src/lib/__tests__/vrAccessCodes.test.ts
// (also part of `npm run test:vr-codes` - see package.json)
//
// Covers the Node half of student VR access codes: normalization/format,
// the offline lookup hash, device-key auth, and directory/validation shaping.
// The database half (generation, uniqueness, regeneration, disable,
// directory contents) is exercised by supabase/tests/manual_vr_access_codes_test.sql.

import { test } from "node:test";
import assert from "node:assert/strict";
import { pbkdf2Sync } from "node:crypto";
import {
  VR_ACCESS_CODE_ALPHABET,
  VR_ACCESS_CODE_LENGTH,
  normalizeVrAccessCode,
  formatVrAccessCode,
  newVrCodeLookupParams,
  deriveVrCodeLookupHash,
  checkVrDeviceKey,
  buildVrDirectory,
  buildVrValidation,
  type VrDirectoryRow,
  type VrCodeLookupParams,
} from "../vrAccessCodes.ts";

// --- format -----------------------------------------------------------------

test("alphabet: 31 symbols, no lookalikes (0/O, 1/I, L)", () => {
  assert.equal(VR_ACCESS_CODE_ALPHABET.length, 31);
  assert.equal(new Set(VR_ACCESS_CODE_ALPHABET).size, 31);
  for (const banned of ["0", "O", "1", "I", "L"]) {
    assert.ok(!VR_ACCESS_CODE_ALPHABET.includes(banned), `${banned} must not be in the alphabet`);
  }
  assert.equal(VR_ACCESS_CODE_LENGTH, 8);
});

test("normalize: case-insensitive, separators and spaces ignored", () => {
  for (const typed of ["K7M4PQ2D", "k7m4pq2d", "K7M4-PQ2D", "k7m4-pq2d", "  K7M4 PQ2D ", "k7m4_pq2d"]) {
    assert.equal(normalizeVrAccessCode(typed), "K7M4PQ2D", typed);
  }
});

test("normalize: rejects wrong length, lookalikes and other symbols instead of guessing", () => {
  for (const typed of ["", "K7M4PQ2", "K7M4PQ2DD", "K7M4PQ0D", "K7M4PQOD", "K7M4PQ1D", "K7M4PQID", "K7M4PQLD", "K7M4PQ2!", "K7M4ÄQ2D"]) {
    assert.equal(normalizeVrAccessCode(typed), null, typed);
  }
});

test("format: grouped 4-4 and round-trips through normalize", () => {
  assert.equal(formatVrAccessCode("K7M4PQ2D"), "K7M4-PQ2D");
  assert.equal(normalizeVrAccessCode(formatVrAccessCode("K7M4PQ2D")), "K7M4PQ2D");
});

// --- offline lookup hash ---------------------------------------------------

const FIXED_PARAMS: VrCodeLookupParams = {
  algorithm: "PBKDF2-HMAC-SHA256",
  iterations: 20_000,
  keyBytes: 32,
  saltBase64: Buffer.from("0123456789abcdef", "utf8").toString("base64"),
  input: "canonical-code-utf8",
  output: "hex",
};

test("lookup hash: is exactly PBKDF2-HMAC-SHA256(canonical code, salt) - the contract the headset implements", async () => {
  const expected = pbkdf2Sync("K7M4PQ2D", Buffer.from("0123456789abcdef", "utf8"), 20_000, 32, "sha256").toString("hex");
  assert.equal(await deriveVrCodeLookupHash("K7M4PQ2D", FIXED_PARAMS), expected);
  assert.match(expected, /^[0-9a-f]{64}$/);
});

test("lookup hash: different code or different salt -> different hash; never the code itself", async () => {
  const a = await deriveVrCodeLookupHash("K7M4PQ2D", FIXED_PARAMS);
  const b = await deriveVrCodeLookupHash("K7M4PQ2E", FIXED_PARAMS);
  const c = await deriveVrCodeLookupHash("K7M4PQ2D", newVrCodeLookupParams());
  assert.notEqual(a, b);
  assert.notEqual(a, c);
  assert.ok(!a.toUpperCase().includes("K7M4PQ2D"));
});

test("lookup params: fresh random salt every response, documented parameters", () => {
  const one = newVrCodeLookupParams();
  const two = newVrCodeLookupParams();
  assert.notEqual(one.saltBase64, two.saltBase64);
  assert.equal(Buffer.from(one.saltBase64, "base64").length, 16);
  assert.equal(one.algorithm, "PBKDF2-HMAC-SHA256");
  assert.ok(one.iterations >= 10_000);
});

// --- device key ---------------------------------------------------------------

function requestWith(authorization?: string): Request {
  return new Request("http://localhost/api/v1/vr/student-directory", {
    headers: authorization ? { authorization } : {},
  });
}

test("device key: fails closed when VR_DEVICE_SYNC_KEY is unset", () => {
  delete process.env.VR_DEVICE_SYNC_KEY;
  assert.equal(checkVrDeviceKey(requestWith("Bearer anything")), "not-configured");
});

test("device key: correct bearer ok; wrong, missing or non-bearer refused", () => {
  process.env.VR_DEVICE_SYNC_KEY = "classroom-device-key-123";
  assert.equal(checkVrDeviceKey(requestWith("Bearer classroom-device-key-123")), "ok");
  assert.equal(checkVrDeviceKey(requestWith("bearer classroom-device-key-123")), "ok");
  assert.equal(checkVrDeviceKey(requestWith("Bearer classroom-device-key-12")), "unauthorized");
  assert.equal(checkVrDeviceKey(requestWith("Bearer ")), "unauthorized");
  assert.equal(checkVrDeviceKey(requestWith()), "unauthorized");
  assert.equal(checkVrDeviceKey(requestWith("Basic classroom-device-key-123")), "unauthorized");
  delete process.env.VR_DEVICE_SYNC_KEY;
});

// --- directory shaping ------------------------------------------------------

const STUDENT_A = "11111111-1111-4111-8111-111111111111";
const STUDENT_B = "22222222-2222-4222-8222-222222222222";
const CLASS_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLASS_2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function row(overrides: Partial<VrDirectoryRow>): VrDirectoryRow {
  return {
    student_id: STUDENT_A,
    display_name: "Ana Reyes",
    class_id: CLASS_1,
    class_name: "CRIM 101",
    class_section: "A",
    access_code: "K7M4PQ2D",
    code_version: 1,
    enabled: true,
    updated_at: "2026-10-06T01:02:03+00:00",
    ...overrides,
  };
}

test("directory: a new student with a code is listed with id, name, class, version and the code's lookup hash", async () => {
  const directory = await buildVrDirectory([row({})], FIXED_PARAMS);
  assert.equal(directory.students.length, 1);
  const [ana] = directory.students;
  assert.equal(ana.studentId, STUDENT_A);
  assert.equal(ana.displayName, "Ana Reyes");
  assert.deepEqual(ana.classes, [{ classId: CLASS_1, className: "CRIM 101", classSection: "A" }]);
  assert.equal(ana.codeVersion, 1);
  assert.equal(ana.enabled, true);
  assert.equal(ana.codeHash, await deriveVrCodeLookupHash("K7M4PQ2D", FIXED_PARAMS));
  assert.equal(ana.updatedAtUtc, "2026-10-06T01:02:03.000Z");
  assert.deepEqual(directory.codeLookup, FIXED_PARAMS);
});

test("directory: never carries the code, the student number, or anything beyond the documented fields", async () => {
  const directory = await buildVrDirectory([row({})], FIXED_PARAMS);
  const json = JSON.stringify(directory);
  assert.ok(!json.includes("K7M4PQ2D") && !json.includes("K7M4-PQ2D"));
  assert.deepEqual(Object.keys(directory.students[0]).sort(), [
    "classes", "codeHash", "codeVersion", "displayName", "enabled", "studentId", "updatedAtUtc",
  ]);
});

test("directory: a student in two classes is ONE entry with both classes", async () => {
  const directory = await buildVrDirectory(
    [row({}), row({ class_id: CLASS_2, class_name: "CRIM 202", class_section: null })],
    FIXED_PARAMS,
  );
  assert.equal(directory.students.length, 1);
  assert.deepEqual(directory.students[0].classes.map((c) => c.classId), [CLASS_1, CLASS_2]);
});

test("directory: a disabled code is marked enabled:false with no hash", async () => {
  const directory = await buildVrDirectory(
    [row({}), row({ student_id: STUDENT_B, display_name: "Ben Cruz", access_code: null, enabled: false, code_version: 3 })],
    FIXED_PARAMS,
  );
  const ben = directory.students.find((s) => s.studentId === STUDENT_B);
  assert.ok(ben);
  assert.equal(ben.enabled, false);
  assert.equal(ben.codeHash, null);
  assert.equal(ben.codeVersion, 3);
});

test("directory: an enabled flag with a missing code is treated as disabled, never hashed", async () => {
  const directory = await buildVrDirectory([row({ access_code: null, enabled: true })], FIXED_PARAMS);
  assert.equal(directory.students[0].enabled, false);
  assert.equal(directory.students[0].codeHash, null);
});

test("directory: distinct students get distinct hashes (no duplicate lookup keys)", async () => {
  const directory = await buildVrDirectory(
    [row({}), row({ student_id: STUDENT_B, display_name: "Ben Cruz", access_code: "ABCD2345" })],
    FIXED_PARAMS,
  );
  const hashes = directory.students.map((s) => s.codeHash);
  assert.equal(new Set(hashes).size, 2);
});

// --- validation shaping -----------------------------------------------------

test("validation: no rows (unknown or disabled code) -> null", () => {
  assert.equal(buildVrValidation([]), null);
});

test("validation: rows -> stable id, name, version, de-duplicated classes; nothing else", () => {
  const result = buildVrValidation([
    { student_id: STUDENT_A, display_name: "Ana Reyes", code_version: 2, class_id: CLASS_1, class_name: "CRIM 101", class_section: "A" },
    { student_id: STUDENT_A, display_name: "Ana Reyes", code_version: 2, class_id: CLASS_2, class_name: "CRIM 202", class_section: null },
    { student_id: STUDENT_A, display_name: "Ana Reyes", code_version: 2, class_id: CLASS_1, class_name: "CRIM 101", class_section: "A" },
  ]);
  assert.deepEqual(result, {
    studentId: STUDENT_A,
    displayName: "Ana Reyes",
    codeVersion: 2,
    classes: [
      { classId: CLASS_1, className: "CRIM 101", classSection: "A" },
      { classId: CLASS_2, className: "CRIM 202", classSection: null },
    ],
  });
});

test("validation: a valid code for a student with no active class still identifies them (classes: [])", () => {
  const result = buildVrValidation([
    { student_id: STUDENT_A, display_name: "Ana Reyes", code_version: 1, class_id: null, class_name: null, class_section: null },
  ]);
  assert.deepEqual(result?.classes, []);
  assert.equal(result?.studentId, STUDENT_A);
});
