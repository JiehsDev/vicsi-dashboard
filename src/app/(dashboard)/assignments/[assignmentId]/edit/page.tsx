// src/app/(dashboard)/assignments/[assignmentId]/edit/page.tsx
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAssignmentDetail } from "@/lib/assignments";
import { updateAssignmentAction } from "../../actions";
import { Card } from "@/components/Card";

function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function EditAssignmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ assignmentId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { assignmentId } = await params;
  const { error } = await searchParams;
  const assignment = await getAssignmentDetail(assignmentId);

  if (!assignment) {
    return (
      <div>
        <BackLink assignmentId={assignmentId} />
        <Card tint className="mt-6">
          <p className="text-[13.5px] text-ink-muted">That assignment doesn&apos;t exist, or isn&apos;t one of yours.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[560px]">
      <BackLink assignmentId={assignmentId} />

      <div className="mt-4 mb-6">
        <div className="text-[11px] font-bold uppercase tracking-wide text-primary">{assignment.classDisplayName}</div>
        <h1 className="mt-1 text-[24px] font-bold tracking-tight text-ink">Edit assignment</h1>
        <p className="mt-1 text-[13px] text-ink-muted">
          Scenario: {assignment.scenarioDisplayName} <span className="text-ink-subtle">(class and scenario can&apos;t be changed after creation)</span>
        </p>
      </div>

      {error && (
        <Card tint className="mb-5 border-critical/30">
          <p className="text-[13px] text-critical" role="alert">
            {error}
          </p>
        </Card>
      )}

      <Card>
        <form action={updateAssignmentAction} className="flex flex-col gap-4">
          <input type="hidden" name="assignmentId" value={assignmentId} />

          <div className="flex flex-col gap-1.5">
            <label htmlFor="title" className="text-[12.5px] font-semibold text-ink">
              Title
            </label>
            <input
              id="title"
              name="title"
              type="text"
              maxLength={200}
              defaultValue={assignment.title ?? ""}
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
                defaultValue={toLocalInputValue(assignment.opensAt)}
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
                defaultValue={toLocalInputValue(assignment.closesAt)}
                className="rounded-xl border border-border bg-bg px-4 py-2.5 text-[13.5px] text-ink outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
              />
            </div>
          </div>
          <p className="-mt-2 text-[11.5px] text-ink-subtle">Both times are in your browser&apos;s own local timezone. Leave either blank for no limit on that end.</p>

          <button
            type="submit"
            className="mt-2 rounded-full bg-primary px-5 py-3 text-[13.5px] font-semibold text-white transition-colors hover:bg-primary/90 active:scale-[0.98]"
          >
            Save changes
          </button>
        </form>
      </Card>
    </div>
  );
}

function BackLink({ assignmentId }: { assignmentId: string }) {
  return (
    <Link href={`/assignments/${encodeURIComponent(assignmentId)}`} className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-muted hover:text-ink">
      <ArrowLeft size={14} /> Back to assignment
    </Link>
  );
}
