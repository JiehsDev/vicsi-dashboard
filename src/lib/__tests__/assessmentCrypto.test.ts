// src/lib/__tests__/assessmentCrypto.test.ts
//
// Run with: node --conditions=react-server --experimental-strip-types --test src/lib/__tests__/assessmentCrypto.test.ts
// (also wired up as `npm run test:crypto` — see package.json)
//
// --conditions=react-server makes the `import "server-only"` at the top of
// assessmentCrypto.ts resolve to its no-op build (server-only/empty.js)
// instead of throwing — see node_modules/server-only/package.json's
// "exports" map. That's the same condition Next.js's own server bundler
// sets, so this exercises the real module, not a stand-in.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hmacPairingCodeHash,
  normalizePairingCode,
  constantTimeHexEqual,
  sha256Hex,
  generatePairingCode,
  DEFAULT_PAIRING_CODE_LENGTH,
} from "../assessmentCrypto.ts";

test("hmacPairingCodeHash: same code + same secret -> same hash", () => {
  process.env.PAIRING_CODE_HMAC_SECRET = "test-secret-one";
  const a = hmacPairingCodeHash("042917");
  const b = hmacPairingCodeHash("042917");
  assert.equal(a, b);
});

test("hmacPairingCodeHash: same code + DIFFERENT secret -> different hash", () => {
  process.env.PAIRING_CODE_HMAC_SECRET = "test-secret-one";
  const withSecretOne = hmacPairingCodeHash("042917");

  process.env.PAIRING_CODE_HMAC_SECRET = "test-secret-two-completely-different";
  const withSecretTwo = hmacPairingCodeHash("042917");

  assert.notEqual(withSecretOne, withSecretTwo);
});

test("hmacPairingCodeHash: is not a plain sha256 of the code (proves it's actually keyed)", () => {
  process.env.PAIRING_CODE_HMAC_SECRET = "test-secret-one";
  const hmac = hmacPairingCodeHash("042917");
  const plain = sha256Hex("042917");
  assert.notEqual(hmac, plain);
});

test("normalizePairingCode: trims incidental whitespace so create/exchange never drift", () => {
  process.env.PAIRING_CODE_HMAC_SECRET = "test-secret-one";
  const trimmed = hmacPairingCodeHash(normalizePairingCode("  042917  "));
  const clean = hmacPairingCodeHash("042917");
  assert.equal(trimmed, clean);
});

test("hmacPairingCodeHash: throws a clear error when the secret is missing", () => {
  delete process.env.PAIRING_CODE_HMAC_SECRET;
  assert.throws(() => hmacPairingCodeHash("042917"), /PAIRING_CODE_HMAC_SECRET/);
});

test("constantTimeHexEqual: equal hex strings compare true", () => {
  const hash = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9";
  assert.equal(constantTimeHexEqual(hash, hash), true);
});

test("constantTimeHexEqual: different hex strings of the same length compare false", () => {
  const a = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9";
  const b = "000000000000000000000000000000000000000000000000000000000000";
  assert.equal(constantTimeHexEqual(a, b), false);
});

test("constantTimeHexEqual: different-length inputs compare false without throwing", () => {
  assert.equal(constantTimeHexEqual("ab", "abcd"), false);
});

test("generatePairingCode: always produces a zero-padded numeric string of the requested length", () => {
  for (let i = 0; i < 200; i++) {
    const code = generatePairingCode(DEFAULT_PAIRING_CODE_LENGTH);
    assert.equal(code.length, DEFAULT_PAIRING_CODE_LENGTH);
    assert.match(code, /^\d+$/);
  }
});
