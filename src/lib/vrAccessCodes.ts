// src/lib/vrAccessCodes.ts
import "server-only";
import { createHash, pbkdf2, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/** Student VR access codes (supabase/migrations/018_student_vr_access_codes.sql).
 *
 *  A code is a permanent classroom LOOKUP credential ("this is student X"),
 *  not a password and never an identity: everything it resolves to is keyed by
 *  the stable profiles.id UUID. Codes are generated in Postgres
 *  (generate_vr_access_code) - this module only normalizes, formats, and
 *  shapes what the headset-facing routes return.
 *
 *  Never log a code, raw or normalized. */

/** Lookalikes removed: no 0/O, 1/I, L. Must match 018's CHECK constraint exactly. */
export const VR_ACCESS_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const VR_ACCESS_CODE_LENGTH = 8;

const CANONICAL_PATTERN = new RegExp(`^[${VR_ACCESS_CODE_ALPHABET}]{${VR_ACCESS_CODE_LENGTH}}$`);

/** Canonical form of whatever a student typed - uppercase, with spaces,
 *  hyphens and underscores removed - or null if the result isn't a
 *  well-formed code. "k7m4-pq2d", " K7M4 PQ2D " and "K7M4PQ2D" all give
 *  "K7M4PQ2D". Lookalikes are NOT guessed (a typed 0 or O is just invalid):
 *  silently mapping one to the other could resolve to a different student. */
export function normalizeVrAccessCode(input: string): string | null {
  const canonical = input.toUpperCase().replace(/[\s\-_]/g, "");
  return CANONICAL_PATTERN.test(canonical) ? canonical : null;
}

/** Display form, grouped 4-4: "K7M4PQ2D" -> "K7M4-PQ2D". */
export function formatVrAccessCode(canonical: string): string {
  return `${canonical.slice(0, 4)}-${canonical.slice(4)}`;
}

// ----------------------------------------------------------------------------
// Offline lookup hash
// ----------------------------------------------------------------------------

/** How the headset recognizes a typed code offline without the directory ever
 *  carrying the code itself: each directory response picks a fresh random
 *  salt and lists PBKDF2-HMAC-SHA256(canonicalCode, salt) per student. The
 *  headset derives the same value ONCE from what was typed and compares it to
 *  every cached entry. A plain sha256 of a ~40-bit code would fall to a GPU in
 *  minutes if a headset's cache were copied off; the iteration count makes
 *  that a matter of weeks. The parameters travel with every response, so they
 *  can change without a client update. */
export const VR_CODE_LOOKUP_ALGORITHM = "PBKDF2-HMAC-SHA256";
export const VR_CODE_LOOKUP_ITERATIONS = 20_000;
export const VR_CODE_LOOKUP_KEY_BYTES = 32;
const VR_CODE_LOOKUP_SALT_BYTES = 16;

const pbkdf2Async = promisify(pbkdf2);

export interface VrCodeLookupParams {
  algorithm: typeof VR_CODE_LOOKUP_ALGORITHM;
  iterations: number;
  keyBytes: number;
  /** Base64 of the raw salt bytes. */
  saltBase64: string;
  /** What the client must hash: the canonical code (see normalizeVrAccessCode) as UTF-8. */
  input: "canonical-code-utf8";
  /** Output encoding of codeHash. */
  output: "hex";
}

export function newVrCodeLookupParams(): VrCodeLookupParams {
  return {
    algorithm: VR_CODE_LOOKUP_ALGORITHM,
    iterations: VR_CODE_LOOKUP_ITERATIONS,
    keyBytes: VR_CODE_LOOKUP_KEY_BYTES,
    saltBase64: randomBytes(VR_CODE_LOOKUP_SALT_BYTES).toString("base64"),
    input: "canonical-code-utf8",
    output: "hex",
  };
}

/** PBKDF2 of one canonical code under the given params, hex. */
export async function deriveVrCodeLookupHash(canonicalCode: string, params: VrCodeLookupParams): Promise<string> {
  const key = await pbkdf2Async(
    Buffer.from(canonicalCode, "utf8"),
    Buffer.from(params.saltBase64, "base64"),
    params.iterations,
    params.keyBytes,
    "sha256",
  );
  return key.toString("hex");
}

// ----------------------------------------------------------------------------
// Device authentication for the headset routes
// ----------------------------------------------------------------------------

export type VrDeviceAuthResult = "ok" | "unauthorized" | "not-configured";

/** Checks `Authorization: Bearer <key>` against the server-only
 *  VR_DEVICE_SYNC_KEY. Fails closed: with the variable unset, nothing is
 *  authorized ("not-configured", which the routes report as a server error
 *  rather than leaking that the key is missing). Both sides are sha256'd
 *  before timingSafeEqual so the comparison is constant-time and
 *  length-independent. */
export function checkVrDeviceKey(request: Request): VrDeviceAuthResult {
  const expected = process.env.VR_DEVICE_SYNC_KEY;
  if (!expected) {
    return "not-configured";
  }
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) {
    return "unauthorized";
  }
  const presented = createHash("sha256").update(match[1], "utf8").digest();
  const wanted = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(presented, wanted) ? "ok" : "unauthorized";
}

// ----------------------------------------------------------------------------
// Response shaping (pure - unit tested in __tests__/vrAccessCodes.test.ts)
// ----------------------------------------------------------------------------

/** One row of get_vr_student_directory() (018). */
export interface VrDirectoryRow {
  student_id: string;
  display_name: string;
  class_id: string;
  class_name: string;
  class_section: string | null;
  /** Null when the code is disabled - the RPC never returns a disabled code. */
  access_code: string | null;
  code_version: number;
  enabled: boolean;
  updated_at: string;
}

export interface VrClassRef {
  classId: string;
  className: string;
  classSection: string | null;
}

export interface VrDirectoryStudent {
  studentId: string;
  displayName: string;
  classes: VrClassRef[];
  codeVersion: number;
  enabled: boolean;
  /** Lookup hash of the code under the response's codeLookup params; null when disabled. */
  codeHash: string | null;
  updatedAtUtc: string;
}

export interface VrDirectory {
  codeLookup: VrCodeLookupParams;
  students: VrDirectoryStudent[];
}

/** Groups the RPC's one-row-per-(student, class) result into one entry per
 *  student, and replaces each enabled code with its lookup hash. A disabled
 *  student stays listed with enabled:false and codeHash:null so a headset can
 *  evict a cached entry instead of continuing to accept it. */
export async function buildVrDirectory(rows: VrDirectoryRow[], params: VrCodeLookupParams): Promise<VrDirectory> {
  const byStudent = new Map<string, { row: VrDirectoryRow; classes: VrClassRef[] }>();
  for (const row of rows) {
    let entry = byStudent.get(row.student_id);
    if (!entry) {
      entry = { row, classes: [] };
      byStudent.set(row.student_id, entry);
    }
    if (!entry.classes.some((c) => c.classId === row.class_id)) {
      entry.classes.push({ classId: row.class_id, className: row.class_name, classSection: row.class_section });
    }
  }

  const students = await Promise.all(
    [...byStudent.values()].map(async ({ row, classes }) => {
      const enabled = row.enabled && row.access_code !== null;
      return {
        studentId: row.student_id,
        displayName: row.display_name,
        classes,
        codeVersion: row.code_version,
        enabled,
        codeHash: enabled ? await deriveVrCodeLookupHash(row.access_code as string, params) : null,
        updatedAtUtc: new Date(row.updated_at).toISOString(),
      };
    }),
  );

  return { codeLookup: params, students };
}

// ----------------------------------------------------------------------------
// Test student ("Continue Without Code")
// ----------------------------------------------------------------------------

/** Student number of the EXISTING dev/test student the headset's "Continue
 *  Without Code" assigns sessions to - the John Doe record created by
 *  supabase/seed/seed-john-doe-bypass-identity.mjs (student_id 2099-00099).
 *  VR_TEST_STUDENT_NUMBER overrides it; "none" turns test mode off. Never
 *  creates a student: if no profile has this number, there is no test student. */
export function vrTestStudentNumber(): string | null {
  const configured = process.env.VR_TEST_STUDENT_NUMBER?.trim();
  if (configured === undefined || configured === "") return "2099-00099";
  return configured.toLowerCase() === "none" ? null : configured;
}

export interface VrTestStudent {
  studentId: string;
  displayName: string;
  classes: VrClassRef[];
}

interface ProfileRow { id: string; full_name: string }
interface EnrollmentRow { class_id: string; classes: { id: string; name: string; section: string | null; archived_at: string | null } | null }

/** Shapes the test-student lookup (profile + its enrollments) - pure, unit tested. */
export function buildVrTestStudent(profile: ProfileRow | null, enrollments: EnrollmentRow[]): VrTestStudent | null {
  if (!profile) return null;
  const classes: VrClassRef[] = [];
  for (const e of enrollments) {
    const c = e.classes;
    if (c && !c.archived_at && !classes.some((x) => x.classId === c.id)) {
      classes.push({ classId: c.id, className: c.name, classSection: c.section });
    }
  }
  return { studentId: profile.id, displayName: profile.full_name, classes };
}

/** One row of validate_vr_access_code() (018). */
export interface VrValidationRow {
  student_id: string;
  display_name: string;
  code_version: number;
  class_id: string | null;
  class_name: string | null;
  class_section: string | null;
}

export interface VrValidatedStudent {
  studentId: string;
  displayName: string;
  codeVersion: number;
  classes: VrClassRef[];
}

/** Null when the RPC returned nothing (unknown or disabled code - deliberately
 *  indistinguishable to the caller). */
export function buildVrValidation(rows: VrValidationRow[]): VrValidatedStudent | null {
  if (rows.length === 0) {
    return null;
  }
  const first = rows[0];
  const classes: VrClassRef[] = [];
  for (const row of rows) {
    if (row.class_id && row.class_name && !classes.some((c) => c.classId === row.class_id)) {
      classes.push({ classId: row.class_id, className: row.class_name, classSection: row.class_section });
    }
  }
  return {
    studentId: first.student_id,
    displayName: first.display_name,
    codeVersion: first.code_version,
    classes,
  };
}
