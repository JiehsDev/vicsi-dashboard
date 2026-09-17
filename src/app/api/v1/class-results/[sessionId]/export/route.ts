// src/app/api/v1/class-results/[sessionId]/export/route.ts
//
// Per-session CSV export, instructor-only (Part 5). One CSV with a
// recordType column rather than a ZIP - a single session's full detail is
// small enough that splitting it into several files would only add
// friction, not readability. Every value goes through the same
// buildCsv/csvField helper as the class-results export, so the
// formula-injection guard (OWASP CSV injection: a leading =, +, -, or @
// gets a text-forcing leading quote) applies uniformly here too.
//
// getResultDetail() is caller-agnostic (works for a student's own session
// too - see its own comment), so this route does its own instructor-role
// check up front rather than relying on that function to enforce it; RLS
// still independently prevents this from ever returning a session outside
// the caller's own classes even if that check were ever removed by mistake.
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getMyProfile } from "@/lib/supabaseClient";
import { getResultDetail, getInstructorSessionIdentity } from "@/lib/results";
import { apiError } from "@/lib/apiResponse";
import { buildCsv } from "@/lib/csv";

const COLUMNS = [
  "recordType",
  "sessionId",
  "receiptId",
  "studentDisplayName",
  "studentIdCode",
  "classDisplayName",
  "scenarioId",
  "scenarioDisplayName",
  "scenarioVersion",
  "startedAtUtc",
  "completedAtUtc",
  "durationSeconds",
  "verificationStatus",
  "verifiedScore",
  "selectedConclusionId",
  "resolvedEndingId",
  // record-type-specific columns - blank on every row they don't apply to
  "key",
  "value",
  "evidenceId",
  "finalStatus",
  "swabbingDone",
  "fingerprintingDone",
  "isFlipped",
  "fingerprintLabStatus",
  "tentNumber",
  "tentLetter",
  "relationshipId",
  "relationshipState",
  "wasEverSelected",
  "checkpointId",
  "selectedOptionId",
  "reasoningOptionId",
  "eventType",
  "targetId",
  "timestampMs",
  "sequenceNumber",
] as const;

type Row = Partial<Record<(typeof COLUMNS)[number], string | number | boolean | null>>;

export async function GET(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError("UNAUTHORIZED", "Sign in to export session results.");
  }

  const profile = await getMyProfile();
  if (profile?.role !== "instructor") {
    return apiError("UNAUTHORIZED", "Only instructors can export session results.");
  }

  const [detail, identity] = await Promise.all([getResultDetail(sessionId), getInstructorSessionIdentity(sessionId)]);

  if (!detail || !identity) {
    return apiError("NOT_FOUND", "That session doesn't exist, or isn't in one of your classes.");
  }

  const base: Row = {
    sessionId: detail.sessionId,
    receiptId: detail.receiptId,
    studentDisplayName: identity.studentDisplayName,
    studentIdCode: identity.studentIdCode,
    classDisplayName: identity.classDisplayName,
    scenarioId: detail.scenarioId,
    scenarioDisplayName: detail.scenarioDisplayName,
    scenarioVersion: detail.scenarioVersion,
    startedAtUtc: detail.startedAtUtc,
    completedAtUtc: detail.completedAtUtc,
    durationSeconds: detail.durationSeconds,
    verificationStatus: detail.verificationStatus,
    verifiedScore: detail.verifiedScore,
    selectedConclusionId: detail.selectedConclusionId,
    resolvedEndingId: detail.resolvedEndingId,
  };

  const rows: Row[] = [{ ...base, recordType: "session" }];

  for (const [key, value] of Object.entries(detail.categories)) {
    rows.push({ ...base, recordType: "category", key, value });
  }
  for (const e of detail.evidenceResults) {
    rows.push({
      ...base,
      recordType: "evidence",
      evidenceId: e.evidenceId,
      finalStatus: e.finalStatus,
      swabbingDone: e.swabbingDone,
      fingerprintingDone: e.fingerprintingDone,
      isFlipped: e.isFlipped,
      fingerprintLabStatus: e.fingerprintLabStatus,
      tentNumber: e.tentNumber,
      tentLetter: e.tentLetter,
    });
  }
  for (const r of detail.relationships) {
    rows.push({ ...base, recordType: "relationship", relationshipId: r.relationshipId, relationshipState: r.state, wasEverSelected: r.wasEverSelected });
  }
  for (const h of detail.hypotheses) {
    rows.push({ ...base, recordType: "hypothesis", checkpointId: h.checkpointId, selectedOptionId: h.selectedOptionId, reasoningOptionId: h.reasoningOptionId });
  }
  for (const v of detail.procedureViolations) {
    rows.push({ ...base, recordType: "procedural_violation", eventType: v.eventType, targetId: v.targetId, timestampMs: v.timestampMs });
  }
  for (const e of detail.events) {
    rows.push({ ...base, recordType: "event", sequenceNumber: e.sequenceNumber, timestampMs: e.timestampMs, eventType: e.eventType, targetId: e.targetId });
  }

  const csv = buildCsv(
    [...COLUMNS],
    rows.map((row) => COLUMNS.map((col) => row[col] ?? null)),
  );

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="session-${sessionId}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
