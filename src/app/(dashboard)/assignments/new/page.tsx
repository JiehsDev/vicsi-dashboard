// src/app/(dashboard)/assignments/new/page.tsx
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getActiveInstructorClasses, getAvailableScenarios } from "@/lib/assignments";
import { createAssignmentAction } from "../actions";
import { Card } from "@/components/Card";
import { formatAcademicPeriod } from "@/components/AcademicPeriodFields";

export default async function NewAssignmentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; classId?: string; scenarioId?: string; title?: string }>;
}) {
  const { error, classId, scenarioId, title } = await searchParams;
  const [classes, scenarios] = await Promise.all([getActiveInstructorClasses(), getAvailableScenarios()]);

  return (
    <div className="mx-auto max-w-[560px]">
      <Link href="/assignments" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-muted hover:text-ink">
        <ArrowLeft size={14} /> Back to assignments
      </Link>

      <div className="mt-4 mb-6">
        <div className="text-[11px] font-bold uppercase tracking-wide text-primary">Assignments</div>
        <h1 className="mt-1 text-[24px] font-bold tracking-tight text-ink">New assignment</h1>
      </div>

      {error && (
        <Card tint className="mb-5 border-critical/30">
          <p className="text-[13px] text-critical" role="alert">
            {error}
          </p>
        </Card>
      )}

      {classes.length === 0 ? (
        <Card tint>
          <p className="text-[13.5px] text-ink-muted">
            You don&apos;t have any active classes yet.{" "}
            <Link href="/classes/new" className="font-medium text-primary hover:underline">
              Create one first
            </Link>
            .
          </p>
        </Card>
      ) : (
        <Card>
          <form action={createAssignmentAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="classId" className="text-[12.5px] font-semibold text-ink">
                Class <span className="text-critical">*</span>
              </label>
              <select
                id="classId"
                name="classId"
                required
                defaultValue={classId ?? ""}
                className="rounded-xl border border-border bg-bg px-4 py-2.5 text-[13.5px] text-ink outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                <option value="" disabled>
                  Select a class…
                </option>
                {classes.map((c) => {
                  const period = formatAcademicPeriod(c.academicYear, c.semester);
                  return (
                    <option key={c.id} value={c.id}>
                      {c.displayName}
                      {period ? ` (${period})` : ""}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="scenarioId" className="text-[12.5px] font-semibold text-ink">
                Scenario <span className="text-critical">*</span>
              </label>
              <select
                id="scenarioId"
                name="scenarioId"
                required
                defaultValue={scenarioId ?? ""}
                className="rounded-xl border border-border bg-bg px-4 py-2.5 text-[13.5px] text-ink outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                <option value="" disabled>
                  Select a scenario…
                </option>
                {scenarios.map((s) => (
                  <option key={s.scenarioId} value={s.scenarioId}>
                    {s.displayName}
                  </option>
                ))}
              </select>
              <p className="text-[11.5px] text-ink-subtle">Only one active assignment per class/scenario pair is allowed at a time.</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="title" className="text-[12.5px] font-semibold text-ink">
                Title
              </label>
              <input
                id="title"
                name="title"
                type="text"
                maxLength={200}
                defaultValue={title ?? ""}
                placeholder="Optional - defaults to the scenario name"
                className="rounded-xl border border-border bg-bg px-4 py-2.5 text-[13.5px] text-ink outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="opensAt" className="text-[12.5px] font-semibold text-ink">
                  Opens
                </label>
                <input
                  id="opensAt"
                  name="opensAt"
                  type="datetime-local"
                  className="rounded-xl border border-border bg-bg px-4 py-2.5 text-[13.5px] text-ink outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="closesAt" className="text-[12.5px] font-semibold text-ink">
                  Due
                </label>
                <input
                  id="closesAt"
                  name="closesAt"
                  type="datetime-local"
                  className="rounded-xl border border-border bg-bg px-4 py-2.5 text-[13.5px] text-ink outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
                />
              </div>
            </div>
            <p className="-mt-2 text-[11.5px] text-ink-subtle">
              Both times are in your browser&apos;s own local timezone. Leave either blank for no limit on that end.
            </p>

            <button
              type="submit"
              className="mt-2 rounded-full bg-primary px-5 py-3 text-[13.5px] font-semibold text-white transition-colors hover:bg-primary/90 active:scale-[0.98]"
            >
              Create assignment
            </button>
          </form>
        </Card>
      )}
    </div>
  );
}
