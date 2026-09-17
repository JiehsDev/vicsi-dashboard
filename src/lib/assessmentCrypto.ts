// src/lib/assessmentCrypto.ts
import "server-only";
import { randomBytes, randomInt, createHash, createHmac, timingSafeEqual } from "node:crypto";

/** Default pairing-code length. Server-configurable per Requirement 1 —
 *  callers may override via the `length` param, but the wire contract and
 *  Unity's input field both assume 6 unless this is changed everywhere. */
export const DEFAULT_PAIRING_CODE_LENGTH = 6;

/** Generates a cryptographically secure numeric pairing code of the given
 *  length (e.g. "042917"), using node:crypto's CSPRNG (randomInt), not
 *  Math.random. Zero-padded so leading zeros are preserved. */
export function generatePairingCode(length: number = DEFAULT_PAIRING_CODE_LENGTH): string {
  const max = 10 ** length;
  const value = randomInt(0, max);
  return value.toString().padStart(length, "0");
}

/** Generates an opaque, high-entropy bearer token for the assessment
 *  session. URL-safe base64, 256 bits of entropy — never a predictable or
 *  sequential value. */
export function generateAssessmentToken(): string {
  return randomBytes(32).toString("base64url");
}

/** sha256 hex digest — used for assessment-token hashes (and anywhere else a
 *  plain, non-HMAC digest is appropriate: tokens are 256 bits of CSPRNG
 *  entropy, so a plain hash is already infeasible to brute-force). Plaintext
 *  tokens are never written to the database or logs; only this digest is
 *  persisted, matching profiles.pin_hash's own discipline. Pairing codes use
 *  hmacPairingCodeHash below instead — see that function's own comment for
 *  why a plain hash is NOT sufficient for a 6-digit code. */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Reads the server-only HMAC secret used to hash pairing codes. Never
 *  logged, never sent to a client, never checked into source control (see
 *  .env.example, which documents the variable name only). Throws with a
 *  helpful message rather than silently hashing with an empty/undefined key
 *  — matches createSupabaseAdminClient's own fail-closed convention. */
function getPairingCodeHmacSecret(): string {
  const secret = process.env.PAIRING_CODE_HMAC_SECRET;
  if (!secret) {
    throw new Error(
      "Missing PAIRING_CODE_HMAC_SECRET — add a long random value to .env.local. " +
        "A 6-digit pairing code has only 10^6 possible values, so it MUST be hashed " +
        "with a server-only HMAC key, never a plain unkeyed hash (see assessmentCrypto.ts).",
    );
  }
  return secret;
}

/** Normalizes a pairing code to the exact string form it is always hashed
 *  in — trimmed, no other transformation (codes are already fixed-length
 *  zero-padded digit strings; this exists so create and exchange can never
 *  drift on e.g. incidental whitespace from a copy-paste). Call this on
 *  every code before hashing or comparing, both at creation and exchange. */
export function normalizePairingCode(code: string): string {
  return code.trim();
}

/** HMAC-SHA256 hex digest of a normalized pairing code, keyed by
 *  PAIRING_CODE_HMAC_SECRET. A plain SHA-256 of a 6-digit code is reversible
 *  by brute force in microseconds (only 10^6 inputs) if the code_hash column
 *  is ever exposed (a misconfigured policy, a backup leak, etc) — HMAC with
 *  a server-only secret makes the hash useless without that secret, which
 *  never leaves server environment variables (not Unity, not Supabase client
 *  code, not any migration file). Same secret must be used to hash the code
 *  at creation (pairing-codes route / Server Action) and at exchange time
 *  (device-pairings/exchange route) — both call this one function. */
export function hmacPairingCodeHash(code: string): string {
  const secret = getPairingCodeHmacSecret();
  return createHmac("sha256", secret).update(normalizePairingCode(code), "utf8").digest("hex");
}

/** Constant-time equality for two hex-encoded hashes of the same expected
 *  length — used wherever application code (not a database index lookup)
 *  compares a computed hash against a stored one, so a timing side-channel
 *  can't leak how many leading hex characters matched. Returns false (never
 *  throws) on a length mismatch, which itself leaks only "wrong length", not
 *  position of difference. */
export function constantTimeHexEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "hex");
  const bufferB = Buffer.from(b, "hex");
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}

/** Canonical (stable, sorted-key) JSON serialization used to compute the
 *  payload hash for idempotency/duplicate detection. Two payloads that are
 *  field-for-field identical always hash the same, regardless of key
 *  insertion order — object identity, not just deep-equal to a diff tool. */
export function canonicalJsonStringify(value: unknown): string {
  return stringifyCanonical(value);
}

function stringifyCanonical(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stringifyCanonical).join(",")}]`;
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const entries = keys.map(
    (key) => `${JSON.stringify(key)}:${stringifyCanonical((value as Record<string, unknown>)[key])}`,
  );
  return `{${entries.join(",")}}`;
}

/** sha256 hex of the canonical JSON form of `payload` — the value stored in
 *  assessment_sessions.payload_hash and compared on resubmission. */
export function canonicalPayloadHash(payload: unknown): string {
  return sha256Hex(canonicalJsonStringify(payload));
}
