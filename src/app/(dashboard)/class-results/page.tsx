// src/app/(dashboard)/class-results/page.tsx
//
// Instructor-facing results, grouped by student (Part 6). RLS
// (instructors_read_own_class_sessions) is what actually restricts this to
// the instructor's own classes - see src/lib/results.ts's own comment.
import Link from "next/link";
import { Download } from "lucide-react";
import {
  getInstructorResultSummaries,
  getInstructorOverview,
  getInstructorFilterOptions,
  applyResultFilters,
  validateDateRange,
  type ResultFilters,
} from "@/lib/results";
import { VerificationStatusBadge } from "@/components/VerificationStatusBadge";
import { Card } from "@/components/Card";

const STATUS_OPTIONS = [
  { value: "", label: "Any status" },
  { value: "verified", label: "Verified" },
  { value: "pending_verification", label: "Pending verification" },
  { value: "requires_review", label: "Requires review" },
  { value: "verification_failed", label: "Verification failed" },
];

export default async function InstructorResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string; scenarioId?: string; status?: string; q?: string; dateFrom?: string; dateTo?: string }>;
}) {
  const { classId, scenarioId, status, q, dateFrom: dateFromRaw, dateTo: dateToRaw } = await searchParams;
  const dateRange = validateDateRange(dateFromRaw, dateToRaw);

  const [results, overview, filterOptions] = await Promise.all([
    getInstructorResultSummaries(),
    getInstructorOverview(),
    getInstructorFilterOptions(),
  ]);

  const filters: ResultFilters = { classId, scenarioId, status, q, dateFrom: dateRange.dateFrom, dateTo: dateRange.dateTo };
  const filtered = dateRange.error ? [] : applyResultFilters(results, filters);

  const byStudent = new Map<string, { studentDisplayName: string; classDisplayName: string; sessions: typeof filtered }>();
  for (const r of filtered) {
    const key = `${r.studentId}::${r.classId}`;
    if (!byStudent.has(key)) {
      byStudent.set(key, { studentDisplayName: r.studentDisplayName, classDisplayName: r.classDisplayName, sessions: [] });
    }
    byStudent.get(key)!.sessions.push(r);
  }

  const hasActiveFilters = Boolean(classId || scenarioId || status || q || dateFromRaw || dateToRaw);
  const exportParams = new URLSearchParams();
  if (classId) exportParams.set("classId", classId);
  if (scenarioId) exportParams.set("scenarioId", scenarioId);
  if (status) exportParams.set("status", status);
  if (q) exportParams.set("q", q);
  if (dateRange.dateFrom) exportParams.set("dateFrom", dateRange.dateFrom);
  if (dateRange.dateTo) exportParams.set("dateTo", dateRange.dateTo);
  const exportHref = `/api/v1/class-results/export${exportParams.toString() ? `?${exportParams.toString()}` : ""}`;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-primary">Assessment results</div>
          <h1 className="mt-1 text-[24px] font-bold tracking-tight text-ink">Student sessions</h1>
          <p className="mt-1 text-[13px] text-ink-muted">Every assessed session across your classes, grouped by student.</p>
        </div>
        <a
          href={exportHref}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2.5 text-[12.5px] font-semibold text-ink-muted transition-colors hover:border-primary/40 hover:text-ink"
        >
          <Download size={14} /> Export CSV
        </a>
      </div>

      <OverviewCards overview={overview} />

      <AnalyticsSection overview={overview} />

      <FilterBar
        classId={classId}
        scenarioId={scenarioId}
        status={status}
        q={q}
        dateFrom={dateFromRaw}
        dateTo={dateToRaw}
        filterOptions={filterOptions}
      />

      {dateRange.error && (
        <Card tint className="mb-6 border-critical/30">
          <p className="text-[13px] text-critical">{dateRange.error}</p>
        </Card>
      )}

      {byStudent.size === 0 ? (
        <Card tint>
          <p className="text-[13.5px] text-ink-muted">
            {results.length === 0
              ? "No assessed sessions yet."
              : dateRange.error
                ? "Fix the date range above to see results."
                : "No sessions match your filters."}
          </p>
          {hasActiveFilters && (
            <p className="mt-2 text-[12.5px]">
              <ActiveFiltersSummary classId={classId} scenarioId={scenarioId} status={status} q={q} dateFrom={dateFromRaw} dateTo={dateToRaw} filterOptions={filterOptions} />
              {" — "}
              <Link href="/class-results" className="font-medium text-primary hover:underline">
                Clear filters
              </Link>
            </p>
          )}
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {[...byStudent.entries()].map(([key, group]) => {
            const studentId = key.split("::")[0];
            return (
              <div key={key}>
                <div className="mb-2 flex items-baseline gap-2">
                  <Link href={`/class-results/students/${encodeURIComponent(studentId)}`} className="text-[14px] font-semibold text-ink hover:text-primary">
                    {group.studentDisplayName}
                  </Link>
                  <div className="text-[12px] text-ink-muted">{group.classDisplayName}</div>
                </div>
                <div className="flex flex-col gap-2">
                  {group.sessions.map((r, attemptIndexFromEnd) => {
                    const attemptNumber = group.sessions.length - attemptIndexFromEnd;
                    return (
                      <Link key={r.sessionId} href={`/class-results/${encodeURIComponent(r.sessionId)}`}>
                        <Card className="transition-colors hover:border-primary/40" padded={false}>
                          <div className="flex items-center justify-between gap-3 px-5 py-3.5">
                            <div>
                              <div className="text-[13.5px] font-medium text-ink">
                                {r.scenarioDisplayName} <span className="text-ink-subtle">· attempt {attemptNumber}</span>
                              </div>
                              <div className="mt-0.5 text-[12px] text-ink-muted">
                                {r.completedAtUtc ? new Date(r.completedAtUtc).toLocaleString() : "In progress"}
                                {r.durationSeconds ? ` · ${Math.round(r.durationSeconds / 60)} min` : ""}
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              {r.verificationStatus === "verified" && r.verifiedScore !== null && (
                                <div className="text-[16px] font-bold text-ink">{Math.round(r.verifiedScore * 100)}%</div>
                              )}
                              <VerificationStatusBadge status={r.verificationStatus} />
                            </div>
                          </div>
                        </Card>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <Card tint className="px-4 py-3.5">
      <div className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="mt-1 text-[20px] font-bold text-ink">{value}</div>
    </Card>
  );
}

function OverviewCards({ overview }: { overview: Awaited<ReturnType<typeof getInstructorOverview>> }) {
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <StatTile label="Classes" value={String(overview.totalClasses)} />
      <StatTile label="Students" value={String(overview.totalStudents)} />
      <StatTile label="Scenarios" value={String(overview.totalScenarios)} />
      <StatTile label="Assignments" value={String(overview.totalAssignments)} />
      <StatTile label="Completed sessions" value={String(overview.totalSessions)} />
      <StatTile
        label="Avg. verified score"
        value={overview.averageVerifiedScore !== null ? `${Math.round(overview.averageVerifiedScore * 100)}%` : "—"}
      />
    </div>
  );
}

function AnalyticsSection({ overview }: { overview: Awaited<ReturnType<typeof getInstructorOverview>> }) {
  const hasAnyAnalytics =
    overview.mostMissedEvidence.length > 0 || overview.mostCommonViolations.length > 0 || overview.endingDistribution.length > 0;
  if (!hasAnyAnalytics && overview.averageDurationSeconds === null) return null;

  return (
    <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Card>
        <div className="mb-2 text-[12.5px] font-semibold text-ink">Average duration</div>
        <div className="text-[13px] text-ink-muted">
          {overview.averageDurationSeconds !== null ? `${Math.round(overview.averageDurationSeconds / 60)} min` : "Not enough data yet."}
        </div>
      </Card>

      {overview.mostMissedEvidence.length > 0 && (
        <Card>
          <div className="mb-2 text-[12.5px] font-semibold text-ink">Most commonly missed evidence</div>
          <ul className="flex flex-col gap-1 text-[12.5px] text-ink-muted">
            {overview.mostMissedEvidence.map((e) => (
              <li key={e.evidenceId} className="flex justify-between gap-2">
                <span>{e.evidenceId}</span>
                <span className="tabular-nums text-ink-subtle">{e.count}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {overview.mostCommonViolations.length > 0 && (
        <Card>
          <div className="mb-2 text-[12.5px] font-semibold text-ink">Most common procedural violations</div>
          <ul className="flex flex-col gap-1 text-[12.5px] text-ink-muted">
            {overview.mostCommonViolations.map((v) => (
              <li key={v.eventType} className="flex justify-between gap-2">
                <span>{v.eventType}</span>
                <span className="tabular-nums text-ink-subtle">{v.count}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {overview.endingDistribution.length > 0 && (
        <Card>
          <div className="mb-2 text-[12.5px] font-semibold text-ink">Ending distribution</div>
          <ul className="flex flex-col gap-1 text-[12.5px] text-ink-muted">
            {overview.endingDistribution.map((e) => (
              <li key={e.endingId} className="flex justify-between gap-2">
                <span>{e.endingId}</span>
                <span className="tabular-nums text-ink-subtle">{e.count}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function FilterBar({
  classId,
  scenarioId,
  status,
  q,
  dateFrom,
  dateTo,
  filterOptions,
}: {
  classId?: string;
  scenarioId?: string;
  status?: string;
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  filterOptions: Awaited<ReturnType<typeof getInstructorFilterOptions>>;
}) {
  if (filterOptions.classes.length === 0 && filterOptions.scenarios.length === 0) return null;

  return (
    <form className="mb-6 flex flex-wrap items-end gap-3" method="GET">
      <div className="flex flex-col gap-1">
        <label htmlFor="q" className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
          Student name or ID
        </label>
        <input
          id="q"
          name="q"
          type="text"
          defaultValue={q ?? ""}
          placeholder="Search students…"
          className="rounded-full border border-border bg-surface px-4 py-2 text-[12.5px] text-ink outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="classId" className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
          Class
        </label>
        <select
          id="classId"
          name="classId"
          defaultValue={classId ?? ""}
          className="rounded-full border border-border bg-surface px-4 py-2 text-[12.5px] text-ink outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          <option value="">All classes</option>
          {filterOptions.classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.displayName}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="scenarioId" className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
          Scenario
        </label>
        <select
          id="scenarioId"
          name="scenarioId"
          defaultValue={scenarioId ?? ""}
          className="rounded-full border border-border bg-surface px-4 py-2 text-[12.5px] text-ink outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          <option value="">All scenarios</option>
          {filterOptions.scenarios.map((s) => (
            <option key={s.scenarioId} value={s.scenarioId}>
              {s.displayName}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="status" className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
          Verification status
        </label>
        <select
          id="status"
          name="status"
          defaultValue={status ?? ""}
          className="rounded-full border border-border bg-surface px-4 py-2 text-[12.5px] text-ink outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="dateFrom" className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
          Completed from
        </label>
        <input
          id="dateFrom"
          name="dateFrom"
          type="date"
          defaultValue={dateFrom ?? ""}
          className="rounded-full border border-border bg-surface px-4 py-2 text-[12.5px] text-ink outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="dateTo" className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
          Completed to
        </label>
        <input
          id="dateTo"
          name="dateTo"
          type="date"
          defaultValue={dateTo ?? ""}
          className="rounded-full border border-border bg-surface px-4 py-2 text-[12.5px] text-ink outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
        />
      </div>

      <button
        type="submit"
        className="rounded-full bg-primary px-5 py-2.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-primary/90"
      >
        Apply filters
      </button>
      {(classId || scenarioId || status || q || dateFrom || dateTo) && (
        <Link href="/class-results" className="text-[12.5px] font-medium text-ink-muted hover:text-ink">
          Clear
        </Link>
      )}
    </form>
  );
}

/** Plain-text summary of every active filter, for the empty state ("no
 *  sessions match: Class X, Scenario Y") - names resolved from the same
 *  filterOptions the dropdowns use, so it never shows a raw id. */
function ActiveFiltersSummary({
  classId,
  scenarioId,
  status,
  q,
  dateFrom,
  dateTo,
  filterOptions,
}: {
  classId?: string;
  scenarioId?: string;
  status?: string;
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  filterOptions: Awaited<ReturnType<typeof getInstructorFilterOptions>>;
}) {
  const parts: string[] = [];
  if (q) parts.push(`student "${q}"`);
  if (classId) parts.push(`class "${filterOptions.classes.find((c) => c.id === classId)?.displayName ?? classId}"`);
  if (scenarioId) parts.push(`scenario "${filterOptions.scenarios.find((s) => s.scenarioId === scenarioId)?.displayName ?? scenarioId}"`);
  if (status) parts.push(`status "${STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status}"`);
  if (dateFrom || dateTo) parts.push(`completed ${dateFrom ?? "any"} to ${dateTo ?? "any"}`);

  if (parts.length === 0) return null;
  return <span className="text-ink-muted">Active filters: {parts.join(", ")}</span>;
}
