// src/app/(dashboard)/page.tsx
import { Card } from "@/components/Card";
import { StudentSessionTable, type SortKey } from "@/components/StudentSessionTable";
import { getStudentSessionSummaries } from "@/lib/supabaseClient";

const SORT_KEYS: SortKey[] = [
  "name",
  "scenarioName",
  "timeOnTaskMin",
  "errorCount",
  "accuracy",
  "compliance",
];

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string; dir?: string }>;
}) {
  const { q, sort, dir } = await searchParams;

  const students = await getStudentSessionSummaries();

  // Distinct from "no rows matched your search": this is "nothing came back
  // from the backend at all" - either genuinely no sessions exist yet, or
  // (right now, for a real instructor) the still-open RLS gap on
  // student_session_summary denies the read entirely. Either way, the
  // honest thing to show is a plain empty state, not a table that quietly
  // renders zero rows or a loading spinner that never resolves.
  if (students.length === 0) {
    return (
      <div>
        <PageHeading />
        <Card>
          <p className="text-[13px] text-ink-muted">
            No sessions yet. Once a student completes a scenario, their
            summary will appear here.
          </p>
        </Card>
      </div>
    );
  }

  const query = q?.toLowerCase().trim();
  const filtered = query
    ? students.filter((s) => s.name.toLowerCase().includes(query))
    : students;

  // errorCount desc by default: the column an instructor scanning dozens of
  // rows most wants surfaced first is "who ran into the most trouble",
  // not alphabetical order.
  const activeSort: SortKey = SORT_KEYS.includes(sort as SortKey)
    ? (sort as SortKey)
    : "errorCount";
  const activeDir: 1 | -1 = dir === "asc" ? 1 : -1;

  const baseParams = new URLSearchParams();
  if (q) baseParams.set("q", q);
  const baseHref = `/${baseParams.toString() ? `?${baseParams.toString()}` : ""}`;

  return (
    <div>
      <PageHeading />
      <StudentSessionTable
        students={filtered}
        sort={activeSort}
        dir={activeDir}
        baseHref={baseHref}
      />
    </div>
  );
}

function PageHeading() {
  return (
    <div className="mb-6">
      <div className="text-[11px] font-bold uppercase tracking-wide text-primary">
        Class Overview
      </div>
      <h1 className="mt-1 text-[24px] font-bold tracking-tight text-ink">
        Student sessions
      </h1>
      <p className="mt-1 text-[13px] text-ink-muted">
        Every recorded session, one row each. Sort a column to find outliers
        fast.
      </p>
    </div>
  );
}
