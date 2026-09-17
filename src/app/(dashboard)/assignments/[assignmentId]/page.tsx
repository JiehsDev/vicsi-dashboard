// src/app/(dashboard)/assignments/[assignmentId]/page.tsx
import Link from "next/link";
import { ArrowLeft, Pencil, PauseCircle, PlayCircle, CheckCircle2, XCircle } from "lucide-react";
import { getAssignmentDetail, computePairingEligibility } from "@/lib/assignments";
import { setAssignmentActiveAction } from "../actions";
import { AssignmentStatusBadge } from "@/components/AssignmentStatusBadge";
import { Card } from "@/components/Card";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { formatAcademicPeriod } from "@/components/AcademicPeriodFields";

const SUCCESS_MESSAGES: Record<string, string> = {
  created: "Assignment created.",
  updated: "Assignment updated.",
  activated: "Assignment reactivated.",
  deactivated: "Assignment deactivated. Existing results and history are unaffected.",
};

export default async function AssignmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ assignmentId: string }>;
  searchParams: Promise<{ error?: string } & Record<string, string | undefined>>;
}) {
  const { assignmentId } = await params;
  const { error, ...rest } = await searchParams;
  const successKey = Object.keys(SUCCESS_MESSAGES).find((k) => rest[k] === "1");

  const assignment = await getAssignmentDetail(assignmentId);

  if (!assignment) {
    return (
      <div>
        <BackLink />
        <Card tint className="mt-6">
          <p className="text-[13.5px] text-ink-muted">That assignment doesn&apos;t exist, or isn&apos;t one of yours.</p>
        </Card>
      </div>
    );
  }

  const { eligible: pairingEligible, withinWindow } = computePairingEligibility(assignment);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <BackLink />
        <div className="flex items-center gap-2">
          <Link
            href={`/assignments/${encodeURIComponent(assignmentId)}/edit`}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-[12.5px] font-semibold text-ink-muted transition-colors hover:border-primary/40 hover:text-ink"
          >
            <Pencil size={14} /> Edit
          </Link>
          <form action={setAssignmentActiveAction}>
            <input type="hidden" name="assignmentId" value={assignmentId} />
            <input type="hidden" name="active" value={assignment.isActive ? "false" : "true"} />
            <ConfirmSubmitButton
              confirmMessage={
                assignment.isActive
                  ? "Deactivate this assignment? Students won't be able to pair against it until it's reactivated. Existing results are never affected."
                  : "Reactivate this assignment?"
              }
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-[12.5px] font-semibold text-ink-muted transition-colors hover:border-critical/40 hover:text-critical"
            >
              {assignment.isActive ? (
                <>
                  <PauseCircle size={14} /> Deactivate
                </>
              ) : (
                <>
                  <PlayCircle size={14} /> Reactivate
                </>
              )}
            </ConfirmSubmitButton>
          </form>
        </div>
      </div>

      <div className="mt-4 mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-primary">
            {assignment.classDisplayName}
            {formatAcademicPeriod(assignment.classAcademicYear, assignment.classSemester) && ` · ${formatAcademicPeriod(assignment.classAcademicYear, assignment.classSemester)}`}
          </div>
          <h1 className="mt-1 text-[24px] font-bold tracking-tight text-ink">{assignment.title || assignment.scenarioDisplayName}</h1>
          <p className="mt-1 text-[13px] text-ink-muted">{assignment.scenarioDisplayName}</p>
        </div>
        <AssignmentStatusBadge status={assignment.status} />
      </div>

      {error && (
        <Card tint className="mb-6 border-critical/30">
          <p className="text-[13px] text-critical" role="alert">
            {error}
          </p>
        </Card>
      )}
      {successKey && (
        <Card tint className="mb-6 border-good/30">
          <p className="text-[13px] text-good" role="status">
            {SUCCESS_MESSAGES[successKey]}
          </p>
        </Card>
      )}
      {assignment.classArchived && (
        <Card tint className="mb-6 border-critical/30">
          <p className="text-[13px] text-critical">This assignment&apos;s class is archived. Restore the class to reactivate this assignment.</p>
        </Card>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Sessions" value={String(assignment.sessionCount)} />
        <StatTile label="Avg. verified score" value={assignment.averageVerifiedScore !== null ? `${Math.round(assignment.averageVerifiedScore * 100)}%` : "—"} />
        <StatTile label="Opens" value={assignment.opensAt ? new Date(assignment.opensAt).toLocaleString() : "No limit"} />
        <StatTile label="Due" value={assignment.closesAt ? new Date(assignment.closesAt).toLocaleString() : "No limit"} />
      </div>

      <Card className="mb-6">
        <div className="mb-2 text-[13px] font-semibold text-ink">Pairing status</div>
        <div className="flex items-center gap-2 text-[12.5px]">
          {pairingEligible ? (
            <>
              <CheckCircle2 size={15} className="text-good" />
              <span className="text-ink-muted">Enrolled students can currently generate a pairing code for this assignment from their own dashboard.</span>
            </>
          ) : (
            <>
              <XCircle size={15} className="text-critical" />
              <span className="text-ink-muted">
                Students cannot pair right now
                {!assignment.isActive
                  ? " — the assignment is deactivated."
                  : assignment.classArchived
                    ? " — the class is archived."
                    : !withinWindow
                      ? assignment.status === "upcoming"
                        ? " — it hasn't opened yet."
                        : " — it has closed."
                      : "."}
              </span>
            </>
          )}
        </div>
        <p className="mt-2 text-[11.5px] text-ink-subtle">
          Pairing codes are generated by students themselves from their own dashboard, not by instructors - see the Pairing page.
        </p>
      </Card>

      {assignment.sessionCount > 0 && (
        <Link
          href={`/class-results?classId=${encodeURIComponent(assignment.classId)}&scenarioId=${encodeURIComponent(assignment.scenarioId)}`}
          className="flex items-center gap-1.5 text-[12.5px] font-semibold text-primary hover:underline"
        >
          View results for this assignment →
        </Link>
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/assignments" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-muted hover:text-ink">
      <ArrowLeft size={14} /> Back to assignments
    </Link>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <Card tint className="px-4 py-3.5">
      <div className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="mt-1 text-[15px] font-bold text-ink">{value}</div>
    </Card>
  );
}
