// src/app/api/v1/assessment-sessions/[sessionId]/route.ts
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { apiSuccess, apiError, apiServerError } from "@/lib/apiResponse";
import { sha256Hex } from "@/lib/assessmentCrypto";

function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header || !header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

const RECEIPT_SELECT =
  "receipt_id, session_id, verification_status, verified_score, server_received_at_utc, student_id, class_id";

/** Requires either a valid assessment token (Unity, scoped to the one
 *  session it was minted for) or an authenticated dashboard session
 *  (student sees only their own sessions; instructor sees sessions in
 *  classes they teach - both enforced by the read-only RLS policies in
 *  010_assessment_sessions_rls.sql, not re-implemented here). */
export async function GET(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const bearerToken = extractBearerToken(request);

  if (bearerToken) {
    const admin = createSupabaseAdminClient();
    const tokenHash = sha256Hex(bearerToken);

    const { data: tokenRow, error: tokenError } = await admin
      .from("assessment_tokens")
      .select("student_id, expires_at, revoked_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (tokenError) return apiServerError(tokenError, "assessment_tokens lookup");
    if (!tokenRow || tokenRow.revoked_at) {
      return apiError("TOKEN_INVALID", "The assessment token is invalid.");
    }
    if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
      return apiError("TOKEN_EXPIRED", "The assessment token has expired.");
    }

    const { data: session, error: sessionError } = await admin
      .from("assessment_sessions")
      .select(RECEIPT_SELECT)
      .eq("session_id", sessionId)
      .maybeSingle();

    if (sessionError) return apiServerError(sessionError, "assessment_sessions lookup (token path)");
    if (!session || session.student_id !== tokenRow.student_id) {
      // Same NOT_FOUND whether the session doesn't exist or belongs to
      // someone else - never confirms another student's session exists.
      return apiError("NOT_FOUND", "No session found for that id.");
    }

    return apiSuccess(toReceiptDto(session));
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError("UNAUTHORIZED", "Sign in or provide a valid assessment token.");
  }

  // RLS on assessment_sessions (010_assessment_sessions_rls.sql) already
  // restricts this to the caller's own sessions (student) or their own
  // classes' sessions (instructor) - a row simply won't come back otherwise.
  const { data: session, error: sessionError } = await supabase
    .from("assessment_sessions")
    .select(RECEIPT_SELECT)
    .eq("session_id", sessionId)
    .maybeSingle();

  if (sessionError) return apiServerError(sessionError, "assessment_sessions lookup (dashboard path)");
  if (!session) {
    return apiError("NOT_FOUND", "No session found for that id.");
  }

  return apiSuccess(toReceiptDto(session));
}

interface ReceiptRow {
  receipt_id: string;
  session_id: string;
  verification_status: string;
  verified_score: number | null;
  server_received_at_utc: string;
}

function toReceiptDto(session: ReceiptRow) {
  return {
    receiptId: session.receipt_id,
    sessionId: session.session_id,
    uploadStatus: "accepted",
    verificationStatus: session.verification_status,
    verifiedScore: session.verified_score,
    serverReceivedAtUtc: session.server_received_at_utc,
  };
}
