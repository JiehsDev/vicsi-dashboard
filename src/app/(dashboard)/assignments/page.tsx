// src/app/(dashboard)/assignments/page.tsx
import Link from "next/link";
import { Plus } from "lucide-react";
import { getInstructorAssignments } from "@/lib/assignments";
import { getInstructorFilterOptions } from "@/lib/results";
import { AssignmentStatusBadge } from "@/components/AssignmentStatusBadge";
import { Card } from "@/components/Card";
import { formatAcademicPeriod } from "@/components/AcademicPeriodFields";

const STATUS_OPTIONS = [
  { value: "", label: "Any status" },
  { value: "active", label: "Active" },
  { value: "upcoming", label: "Upcoming" },
  { value: "closed", label: "Closed" },
  { value: "inactive", label: "Inactive" },
];

export default async function AssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string; scenarioId?: string; status?: string }>;
}) {
  const { classId, scenarioId, status } = await searchParams;
  const [assignments, filterOptions] = await Promise.all([getInstructorAssignments(), getInstructorFilterOptions()]);

  const filtered = assignments.filter((a) => {
    if (classId && a.classId !== classId) return false;
    if (scenarioId && a.scenarioId !== scenarioId) return false;
    if (status && a.status !== status) return false;
    return true;
  });

  const hasActiveFilters = Boolean(classId || scenarioId || status);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-primary">Assignments</div>
          <h1 className="mt-1 text-[24px] font-bold tracking-tight text-ink">Scenario assignments</h1>
          <p className="mt-1 text-[13px] text-ink-muted">Assign scenarios to your classes and control when they&apos;re available.</p>
        </div>
        <Link
          href="/assignments/new"
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-primary/90"
        >
          <Plus size={14} /> New assignment
        </Link>
      </div>

      <form className="mb-6 flex flex-wrap items-end gap-3" method="GET">
        <FilterSelect name="classId" label="Class" value={classId} defaultLabel="All classes" options={filterOptions.classes.map((c) => ({ value: c.id, label: c.displayName }))} />
        <FilterSelect name="scenarioId" label="Scenario" value={scenarioId} defaultLabel="All scenarios" options={filterOptions.scenarios.map((s) => ({ value: s.scenarioId, label: s.displayName }))} />
        <FilterSelect name="status" label="Status" value={status} defaultLabel="Any status" options={STATUS_OPTIONS.slice(1)} />
        <button type="submit" className="rounded-full bg-primary px-5 py-2.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-primary/90">
          Apply filters
        </button>
        {hasActiveFilters && (
          <Link href="/assignments" className="text-[12.5px] font-medium text-ink-muted hover:text-ink">
            Clear
          </Link>
        )}
      </form>

      {assignments.length === 0 ? (
        <Card tint>
          <p className="text-[13.5px] text-ink-muted">No assignments yet. Create one to let students pair against a scenario.</p>
        </Card>
      ) : filtered.length === 0 ? (
        <Card tint>
          <p className="text-[13.5px] text-ink-muted">No assignments match your filters.</p>
          <Link href="/assignments" className="mt-2 inline-block text-[12.5px] font-medium text-primary hover:underline">
            Clear filters
          </Link>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((a) => (
            <Link key={a.id} href={`/assignments/${encodeURIComponent(a.id)}`}>
              <Card className="transition-colors hover:border-primary/40" padded={false}>
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                  <div>
                    <div className="text-[13.5px] font-medium text-ink">
                      {a.title || a.scenarioDisplayName}{" "}
                      <span className="text-ink-subtle">
                        · {a.classDisplayName}
                        {formatAcademicPeriod(a.classAcademicYear, a.classSemester) && ` (${formatAcademicPeriod(a.classAcademicYear, a.classSemester)})`}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[12px] text-ink-muted">
                      {a.scenarioDisplayName} · {a.sessionCount} session{a.sessionCount === 1 ? "" : "s"}
                      {a.averageVerifiedScore !== null ? ` · avg ${Math.round(a.averageVerifiedScore * 100)}%` : ""}
                    </div>
                  </div>
                  <AssignmentStatusBadge status={a.status} />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterSelect({
  name,
  label,
  value,
  defaultLabel,
  options,
}: {
  name: string;
  label: string;
  value?: string;
  defaultLabel: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
        {label}
      </label>
      <select
        id={name}
        name={name}
        defaultValue={value ?? ""}
        className="rounded-full border border-border bg-surface px-4 py-2 text-[12.5px] text-ink outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        <option value="">{defaultLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
