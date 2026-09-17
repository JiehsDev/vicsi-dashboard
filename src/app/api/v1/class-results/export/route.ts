// src/app/api/v1/class-results/export/route.ts
//
// CSV export of the signed-in instructor's own class results (Part 8).
// Uses the exact same RLS-scoped read as the /class-results page
// (getInstructorResultSummaries -> assessment_sessions, restricted by
// instructors_read_own_class_sessions) - never the service-role client, so
// this endpoint cannot export a row RLS wouldn't already let the caller see
// through the dashboard itself. Filters go through the same
// applyResultFilters/validateDateRange the page itself uses - one shared
// implementation, so this can never drift out of sync with what the page
// shows and calls "matching your filters."
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getMyProfile } from "@/lib/supabaseClient";
import { getInstructorResultSummaries, applyResultFilters, validateDateRange, type ResultFilters } from "@/lib/results";
import { apiError } from "@/lib/apiResponse";
import { buildCsv } from "@/lib/csv";

const CSV_COLUMNS = [
  "studentDisplayName",
  "studentIdCode",
  "classDisplayName",
  "scenarioDisplayName",
  "sessionId",
  "startedAtUtc",
  "completedAtUtc",
  "durationSeconds",
  "selectedConclusionId",
  "resolvedEndingId",
  "verificationStatus",
  "verifiedScore",
] as const;

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError("UNAUTHORIZED", "Sign in to export results.");
  }

  const profile = await getMyProfile();
  if (profile?.role !== "instructor") {
    return apiError("UNAUTHORIZED", "Only instructors can export class results.");
  }

  const url = new URL(request.url);
  const dateRange = validateDateRange(url.searchParams.get("dateFrom") ?? undefined, url.searchParams.get("dateTo") ?? undefined);
  if (dateRange.error) {
    return apiError("VALIDATION_ERROR", dateRange.error);
  }

  const filters: ResultFilters = {
    classId: url.searchParams.get("classId") ?? undefined,
    scenarioId: url.searchParams.get("scenarioId") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    dateFrom: dateRange.dateFrom,
    dateTo: dateRange.dateTo,
  };

  const results = await getInstructorResultSummaries();
  const filtered = applyResultFilters(results, filters);

  const csv = buildCsv(
    [...CSV_COLUMNS],
    filtered.map((r) => CSV_COLUMNS.map((col) => r[col as keyof typeof r] as string | number | null)),
  );

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="class-results-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
