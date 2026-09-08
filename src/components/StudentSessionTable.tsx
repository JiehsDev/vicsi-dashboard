// src/components/StudentSessionTable.tsx
import Link from "next/link";
import { ArrowUp, ArrowDown, ChevronRight } from "lucide-react";
import type { StudentSessionSummary } from "@/lib/types";

export type SortKey =
  | "name"
  | "scenarioName"
  | "timeOnTaskMin"
  | "errorCount"
  | "accuracy"
  | "compliance";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Student" },
  { key: "scenarioName", label: "Scenario" },
  { key: "timeOnTaskMin", label: "Time on Task" },
  { key: "errorCount", label: "Errors" },
  { key: "accuracy", label: "Accuracy" },
  { key: "compliance", label: "Compliance" },
];

/** Renders a 0-100 score honestly: a real number as "N%", or a distinctly
 *  muted "—" for null — never a fabricated 0%, which would be indistinguishable
 *  from a real zero score and would misreport "not yet computed" as "computed
 *  and terrible". */
function Score({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <span className="text-ink-subtle" title="Not yet available">
        —
      </span>
    );
  }
  return <span className="tabular-nums text-ink">{value}%</span>;
}

/** Null always sorts last regardless of direction — an unknown score isn't
 *  meaningfully "low" or "high", so it shouldn't be pulled to whichever end
 *  the sort direction happens to favor. */
function compareNullableLast(
  a: number | null,
  b: number | null,
  dir: 1 | -1,
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return (a - b) * dir;
}

function sortStudents(
  students: StudentSessionSummary[],
  sort: SortKey,
  dir: 1 | -1,
): StudentSessionSummary[] {
  const copy = [...students];
  copy.sort((a, b) => {
    switch (sort) {
      case "name":
        return a.name.localeCompare(b.name) * dir;
      case "scenarioName":
        return a.scenarioName.localeCompare(b.scenarioName) * dir;
      case "timeOnTaskMin":
        return (a.timeOnTaskMin - b.timeOnTaskMin) * dir;
      case "errorCount":
        return (a.errorCount - b.errorCount) * dir;
      case "accuracy":
        return compareNullableLast(a.accuracy, b.accuracy, dir);
      case "compliance":
        return compareNullableLast(a.compliance, b.compliance, dir);
    }
  });
  return copy;
}

export function StudentSessionTable({
  students,
  sort,
  dir,
  baseHref,
}: {
  students: StudentSessionSummary[];
  sort: SortKey;
  dir: 1 | -1;
  /** Current path + any non-sort query params (e.g. ?q=...) to preserve when
   *  a column header changes the sort. */
  baseHref: string;
}) {
  const sorted = sortStudents(students, sort, dir);

  function headerHref(key: SortKey) {
    const params = new URLSearchParams(baseHref.split("?")[1] ?? "");
    const nextDir = sort === key && dir === -1 ? "asc" : "desc";
    params.set("sort", key);
    params.set("dir", nextDir);
    return `${baseHref.split("?")[0]}?${params.toString()}`;
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse whitespace-nowrap text-[13.5px]">
          <thead>
            <tr className="border-b border-border">
              {COLUMNS.map((col) => {
                const active = sort === col.key;
                return (
                  <th
                    key={col.key}
                    className="px-[22px] py-[9px] text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted"
                  >
                    <Link
                      href={headerHref(col.key)}
                      className={`inline-flex items-center gap-1 transition-colors hover:text-ink ${active ? "text-ink" : ""}`}
                    >
                      {col.label}
                      {active &&
                        (dir === 1 ? (
                          <ArrowUp size={11} />
                        ) : (
                          <ArrowDown size={11} />
                        ))}
                    </Link>
                  </th>
                );
              })}
              <th className="px-[22px] py-[9px]" />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td
                  colSpan={COLUMNS.length + 1}
                  className="px-[22px] py-8 text-center text-[13px] text-ink-muted"
                >
                  No students match your search.
                </td>
              </tr>
            ) : (
              sorted.map((s) => (
                <tr
                  key={s.sessionId}
                  className="border-b border-border last:border-b-0 hover:bg-surface-tint"
                >
                  <td className="px-[22px] py-3.5">
                    <div className="font-semibold text-ink">{s.name}</div>
                    {s.section && (
                      <div className="text-[11.5px] text-ink-muted">
                        Section {s.section}
                      </div>
                    )}
                  </td>
                  <td className="px-[22px] py-3.5 text-ink-muted">
                    {s.scenarioName}
                  </td>
                  <td className="px-[22px] py-3.5 tabular-nums text-ink-muted">
                    {s.timeOnTaskMin} min
                  </td>
                  <td className="px-[22px] py-3.5 tabular-nums">
                    <span
                      className={
                        s.errorCount > 0
                          ? "font-semibold text-critical"
                          : "text-ink-muted"
                      }
                    >
                      {s.errorCount}
                    </span>
                  </td>
                  <td className="px-[22px] py-3.5">
                    <Score value={s.accuracy} />
                  </td>
                  <td className="px-[22px] py-3.5">
                    <Score value={s.compliance} />
                  </td>
                  <td className="px-[22px] py-3.5 text-right">
                    <Link
                      href={`/sessions/${s.sessionId}`}
                      aria-label={`View evidence timeline for ${s.name}`}
                      className="inline-flex text-ink-subtle transition-colors hover:text-ink"
                    >
                      <ChevronRight size={16} />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
