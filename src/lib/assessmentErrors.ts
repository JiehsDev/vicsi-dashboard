// src/lib/assessmentErrors.ts
import "server-only";
import type { ApiErrorCode } from "./apiResponse";

/** The three RPC functions in supabase/migrations/011_assessment_rpcs.sql
 *  raise exceptions as `RAISE EXCEPTION 'CODE: human-readable detail'` —
 *  this is the single place that convention is parsed back into an
 *  ApiErrorCode, so every Route Handler that calls one of those RPCs shares
 *  the same mapping instead of re-deriving it. */
const KNOWN_RPC_CODES: ReadonlySet<ApiErrorCode> = new Set([
  "VALIDATION_ERROR",
  "ASSIGNMENT_INACTIVE",
  "PAIRING_CODE_INVALID",
  "PAIRING_CODE_EXPIRED",
  "PAIRING_CODE_USED",
  "SCENARIO_MISMATCH",
  "TOKEN_INVALID",
  "TOKEN_EXPIRED",
  "SESSION_PAYLOAD_CONFLICT",
  "EVENT_LIMIT_EXCEEDED",
]);

export interface ParsedRpcError {
  code: ApiErrorCode;
  /** Safe to return to the client as-is — the RPC functions never embed
   *  secrets, stack traces, or SQL text after the code prefix, only
   *  identifiers (ids, timestamps) already scoped to the caller's own
   *  request. */
  message: string;
}

/** Parses a Postgres RPC error's `.message` (as returned by the Supabase JS
 *  client) into a known ApiErrorCode + safe message. Falls back to
 *  DATABASE_ERROR with a generic message for anything that doesn't match
 *  the `CODE: detail` convention — e.g. a real constraint violation or
 *  connection failure, whose raw text must never reach the client. */
export function parseRpcError(rawMessage: string): ParsedRpcError {
  const separatorIndex = rawMessage.indexOf(":");
  if (separatorIndex > 0) {
    const candidate = rawMessage.slice(0, separatorIndex).trim();
    if (KNOWN_RPC_CODES.has(candidate as ApiErrorCode)) {
      return { code: candidate as ApiErrorCode, message: rawMessage.trim() };
    }
  }
  return { code: "DATABASE_ERROR", message: "A database error occurred while processing the request." };
}
