// src/lib/apiResponse.ts
import "server-only";
import { NextResponse } from "next/server";

/** Every documented error code across the v1 assessment API. Kept as one
 *  union so a Route Handler can't typo a code that no client is prepared
 *  to branch on. */
export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "TOKEN_EXPIRED"
  | "TOKEN_INVALID"
  | "ASSIGNMENT_INACTIVE"
  | "SCENARIO_MISMATCH"
  | "PAYLOAD_VERSION_UNSUPPORTED"
  | "PAYLOAD_TOO_LARGE"
  | "EVENT_LIMIT_EXCEEDED"
  | "SESSION_PAYLOAD_CONFLICT"
  | "RATE_LIMITED"
  | "DATABASE_ERROR"
  | "VERIFICATION_ERROR"
  | "SERVER_ERROR"
  | "PAIRING_CODE_INVALID"
  | "PAIRING_CODE_EXPIRED"
  | "PAIRING_CODE_USED"
  | "NOT_FOUND";

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  TOKEN_EXPIRED: 401,
  TOKEN_INVALID: 401,
  ASSIGNMENT_INACTIVE: 409,
  SCENARIO_MISMATCH: 409,
  PAYLOAD_VERSION_UNSUPPORTED: 400,
  PAYLOAD_TOO_LARGE: 413,
  EVENT_LIMIT_EXCEEDED: 400,
  SESSION_PAYLOAD_CONFLICT: 409,
  RATE_LIMITED: 429,
  DATABASE_ERROR: 500,
  VERIFICATION_ERROR: 500,
  SERVER_ERROR: 500,
  PAIRING_CODE_INVALID: 400,
  PAIRING_CODE_EXPIRED: 410,
  PAIRING_CODE_USED: 409,
  NOT_FOUND: 404,
};

/** Codes safe to treat as "try again" on the client without human
 *  intervention — matches the Unity retry/backoff policy in
 *  AssessmentUploadService.ComputeBackoffSeconds. */
const RETRYABLE_CODES: ReadonlySet<ApiErrorCode> = new Set([
  "RATE_LIMITED",
  "DATABASE_ERROR",
  "SERVER_ERROR",
]);

export interface ApiFieldError {
  field: string;
  message: string;
}

export interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
}

export interface ApiErrorEnvelope {
  success: false;
  error: {
    code: ApiErrorCode;
    message: string;
    retryable: boolean;
    fieldErrors?: ApiFieldError[];
  };
}

/** 200 OK with `{success:true, data}`. */
export function apiSuccess<T>(data: T, init?: { status?: number }): NextResponse<ApiSuccessEnvelope<T>> {
  return NextResponse.json({ success: true, data }, { status: init?.status ?? 200 });
}

/** Maps an ApiErrorCode to its documented HTTP status and wraps it in the
 *  standard `{success:false, error}` envelope. `message` must never contain
 *  a stack trace, raw SQL/Postgres error text, a secret, or a filesystem
 *  path — callers pass a safe, human-readable string only. */
export function apiError(
  code: ApiErrorCode,
  message: string,
  opts?: { fieldErrors?: ApiFieldError[]; retryable?: boolean; status?: number },
): NextResponse<ApiErrorEnvelope> {
  const retryable = opts?.retryable ?? RETRYABLE_CODES.has(code);
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
        retryable,
        ...(opts?.fieldErrors ? { fieldErrors: opts.fieldErrors } : {}),
      },
    },
    { status: opts?.status ?? STATUS_BY_CODE[code] },
  );
}

/** Generic catch-all for anything unexpected. Never forwards `cause`'s own
 *  message to the client — logs it server-side only — since arbitrary
 *  thrown errors (DB drivers, JSON parsing, etc.) routinely embed
 *  connection strings, file paths, or SQL fragments in their `.message`. */
export function apiServerError(cause: unknown, context: string): NextResponse<ApiErrorEnvelope> {
  console.error(`[api] ${context}:`, cause);
  return apiError("SERVER_ERROR", "An unexpected server error occurred.");
}
