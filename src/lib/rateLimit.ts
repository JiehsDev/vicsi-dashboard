// src/lib/rateLimit.ts
import "server-only";
import { createHmac } from "node:crypto";
import { createSupabaseAdminClient } from "./supabaseAdmin";

/** Persistent, shared-store rate limiting backed by the check_rate_limit()
 *  Postgres function (supabase/migrations/012_rate_limiting.sql). Replaces
 *  the earlier in-memory Map, which only worked correctly for a single
 *  long-running Node process — unsafe for a serverless/multi-instance
 *  deployment, where each instance/invocation had its own independent
 *  budget. Every caller now shares one counter in Postgres. */

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/** Reads an integer limit from an env var, falling back to `fallback` if
 *  unset or unparsable — keeps every limit configurable without a code
 *  change, per this feature's own requirement. */
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const RATE_LIMITS = {
  pairingCreatePerStudent: {
    limit: envInt("RATE_LIMIT_PAIRING_CREATE_MAX", 5),
    windowSeconds: envInt("RATE_LIMIT_PAIRING_CREATE_WINDOW_SECONDS", 60),
  },
  pairingExchangePerDeviceOrCode: {
    limit: envInt("RATE_LIMIT_PAIRING_EXCHANGE_MAX", 10),
    windowSeconds: envInt("RATE_LIMIT_PAIRING_EXCHANGE_WINDOW_SECONDS", 60),
  },
  pairingExchangePerIp: {
    limit: envInt("RATE_LIMIT_PAIRING_EXCHANGE_IP_MAX", 30),
    windowSeconds: envInt("RATE_LIMIT_PAIRING_EXCHANGE_IP_WINDOW_SECONDS", 60),
  },
  submissionPerToken: {
    limit: envInt("RATE_LIMIT_SUBMISSION_TOKEN_MAX", 20),
    windowSeconds: envInt("RATE_LIMIT_SUBMISSION_TOKEN_WINDOW_SECONDS", 60),
  },
  submissionPerSession: {
    limit: envInt("RATE_LIMIT_SUBMISSION_SESSION_MAX", 10),
    windowSeconds: envInt("RATE_LIMIT_SUBMISSION_SESSION_WINDOW_SECONDS", 60),
  },
} as const;

/** Records one hit against `bucketKey` and reports whether it's within
 *  `limit` per `windowSeconds`, via the shared Postgres counter. Fails
 *  OPEN (allowed:true) on a database error rather than blocking every
 *  request if the rate-limit table/function is briefly unavailable — an
 *  outage in this secondary defense should not take down the primary
 *  pairing/submission flow it protects; the error is logged so an ongoing
 *  outage is still visible. */
export async function checkRateLimit(bucketKey: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("check_rate_limit", {
    p_bucket_key: bucketKey,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    console.error("[rateLimit] check_rate_limit failed, failing open:", error.message);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return { allowed: row?.allowed ?? true, retryAfterSeconds: row?.retry_after_seconds ?? 0 };
}

/** Reads the server-only secret used to hash IP-derived rate-limit keys.
 *  Kept separate from PAIRING_CODE_HMAC_SECRET (see assessmentCrypto.ts) —
 *  different purpose, different blast radius if one leaks. */
function getRateLimitIpSecret(): string {
  const secret = process.env.RATE_LIMIT_IP_HASH_SECRET;
  if (!secret) {
    throw new Error(
      "Missing RATE_LIMIT_IP_HASH_SECRET — add a long random value to .env.local. " +
        "Raw IP addresses are never used directly as a rate-limit key; only this HMAC digest is.",
    );
  }
  return secret;
}

/** Best-effort caller IP from standard proxy headers (Next.js Route Handlers
 *  don't expose a reliable socket address directly behind arbitrary
 *  proxies/load balancers). Returns null if nothing usable is present —
 *  callers should fall back to another identifier (device id, code) rather
 *  than skip rate limiting entirely. */
function extractClientIp(request: Request): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip");
}

/** HMAC-hashed, never-raw rate-limit bucket key for a request's caller IP.
 *  The digest (not the IP) is what ends up in rate_limit_counters.bucket_key,
 *  and that row is itself short-lived (see check_rate_limit's own opportunistic
 *  cleanup) — this is deliberately NOT a place to reconstruct or log a real IP. */
export function ipRateLimitKey(request: Request, prefix: string): string | null {
  const ip = extractClientIp(request);
  if (!ip) return null;
  const digest = createHmac("sha256", getRateLimitIpSecret()).update(ip, "utf8").digest("hex");
  return `${prefix}:${digest}`;
}
