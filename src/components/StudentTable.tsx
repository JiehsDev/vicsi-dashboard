// src/components/StudentTable.tsx
"use client";

import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { TrendPill } from "./TrendPill";
import type { StudentSessionSummary } from "@/lib/types";

export function StudentTable({
  students,
}: {
  students: StudentSessionSummary[];
}) {
  const router = useRouter();

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse whitespace-nowrap text-[13.5px]">
          <thead>
            <tr className="border-b border-border">
              {[
                "Student",
                "Section",
                "Evidence Accuracy",
                "Compliance",
                "Completion",
                "Avg Response",
                "Trend",
                "",
              ].map((h) => (
                <th
                  key={h}
                  className="px-[22px] py-[9px] text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {students.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-[22px] py-8 text-center text-[13px] text-ink-muted"
                >
                  No students match your search.
                </td>
              </tr>
            ) : (
              students.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => router.push(`/students/${s.id}`)}
                  className="cursor-pointer border-b border-border last:border-b-0 hover:bg-surface-tint"
                >
                  <td className="px-[22px] py-3.5">
                    <div className="font-semibold text-ink">{s.name}</div>
                  </td>
                  <td className="px-[22px] py-3.5 text-ink-muted">
                    {s.section ?? "—"}
                  </td>
                  <td className="px-[22px] py-3.5 tabular-nums text-ink">
                    {s.accuracy}%
                  </td>
                  <td className="px-[22px] py-3.5 tabular-nums text-ink">
                    {s.compliance}%
                  </td>
                  <td className="px-[22px] py-3.5 tabular-nums text-ink">
                    {s.completionPct !== undefined ? `${s.completionPct}%` : "—"}
                  </td>
                  <td className="px-[22px] py-3.5 tabular-nums text-ink-muted">
                    {s.timeOnTaskMin} min
                  </td>
                  <td className="px-[22px] py-3.5">
                    {s.trendPts !== undefined && (
                      <TrendPill pts={s.trendPts} />
                    )}
                  </td>
                  <td className="px-[22px] py-3.5 text-ink-muted">
                    <ChevronRight size={16} />
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
