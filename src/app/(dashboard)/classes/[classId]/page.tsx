// src/app/(dashboard)/classes/[classId]/page.tsx
import Link from "next/link";
import { ArrowLeft, Pencil, Archive, ArchiveRestore, Plus } from "lucide-react";
import { getClassDetail } from "@/lib/classes";
import { archiveClassAction, enrollStudentAction, removeStudentAction } from "../actions";
import { Card } from "@/components/Card";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { AssignmentStatusBadge } from "@/components/AssignmentStatusBadge";
import { formatAcademicPeriod } from "@/components/AcademicPeriodFields";

const SUCCESS_MESSAGES: Record<string, string> = {
  created: "Class created.",
  updated: "Class updated.",
  archived: "Class archived. It stays visible, but can't take new enrollments until restored.",
  restored: "Class restored.",
  enrolled: "Student enrolled.",
  removed: "Student removed from this class. Their past results are unaffected.",
};

export default async function ClassDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>;
  searchParams: Promise<{ error?: string } & Record<string, string | undefined>>;
}) {
  const { classId } = await params;
  const { error, ...rest } = await searchParams;
  const successKey = Object.keys(SUCCESS_MESSAGES).find((k) => rest[k] === "1");

  const detail = await getClassDetail(classId);

  if (!detail) {
    return (
      <div>
        <BackLink />
        <Card tint className="mt-6">
          <p className="text-[13.5px] text-ink-muted">That class doesn&apos;t exist, or isn&apos;t one of yours.</p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <BackLink />
        <div className="flex items-center gap-2">
          <Link
            href={`/classes/${encodeURIComponent(classId)}/edit`}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-[12.5px] font-semibold text-ink-muted transition-colors hover:border-primary/40 hover:text-ink"
          >
            <Pencil size={14} /> Edit
          </Link>
          <form action={archiveClassAction}>
            <input type="hidden" name="classId" value={classId} />
            <input type="hidden" name="archive" value={detail.archivedAt ? "false" : "true"} />
            <ConfirmSubmitButton
              confirmMessage={
                detail.archivedAt
                  ? "Restore this class? It will be able to receive new enrollments again."
                  : "Archive this class? It stays visible and its history is kept, but it can't receive new enrollments until restored."
              }
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-[12.5px] font-semibold text-ink-muted transition-colors hover:border-critical/40 hover:text-critical"
            >
              {detail.archivedAt ? (
                <>
                  <ArchiveRestore size={14} /> Restore
                </>
              ) : (
                <>
                  <Archive size={14} /> Archive
                </>
              )}
            </ConfirmSubmitButton>
          </form>
        </div>
      </div>

      <div className="mt-4 mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-primary">Classes</div>
          <h1 className="mt-1 text-[24px] font-bold tracking-tight text-ink">{detail.name}</h1>
          <p className="mt-1 text-[13px] text-ink-muted">
            {detail.section ? `Section ${detail.section}` : "No section set"}
            {formatAcademicPeriod(detail.academicYear, detail.semester) && (
              <>
                {" · "}
                {formatAcademicPeriod(detail.academicYear, detail.semester)}
              </>
            )}
          </p>
        </div>
        {detail.archivedAt && (
          <span className="inline-flex items-center rounded-full bg-ink-subtle/10 px-3 py-1.5 text-[12px] font-semibold text-ink-subtle">
            Archived {new Date(detail.archivedAt).toLocaleDateString()}
          </span>
        )}
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

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Students" value={String(detail.students.length)} />
        <StatTile label="Assignments" value={String(detail.assignments.length)} />
        <StatTile label="Sessions" value={String(detail.sessionCount)} />
        <StatTile label="Avg. verified score" value={detail.averageVerifiedScore !== null ? `${Math.round(detail.averageVerifiedScore * 100)}%` : "—"} />
      </div>

      {detail.sessionCount > 0 && (
        <Link
          href={`/class-results?classId=${encodeURIComponent(classId)}`}
          className="mb-6 flex items-center gap-1.5 text-[12.5px] font-semibold text-primary hover:underline"
        >
          View this class&apos;s results and analytics →
        </Link>
      )}

      <Card className="mb-6" padded={false}>
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <div className="text-[13px] font-semibold text-ink">Assignments ({detail.assignments.length})</div>
          {!detail.archivedAt && (
            <Link
              href={`/assignments/new?classId=${encodeURIComponent(classId)}`}
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary hover:underline"
            >
              <Plus size={13} /> New assignment
            </Link>
          )}
        </div>
        {detail.assignments.length === 0 ? (
          <p className="px-6 pb-5 text-[12.5px] text-ink-muted">No assignments yet.</p>
        ) : (
          <div className="flex flex-col">
            {detail.assignments.map((a) => (
              <Link
                key={a.id}
                href={`/assignments/${encodeURIComponent(a.id)}`}
                className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-3 transition-colors hover:bg-surface-tint"
              >
                <div>
                  <div className="text-[12.5px] font-medium text-ink">{a.title || a.scenarioDisplayName}</div>
                  <div className="mt-0.5 text-[11.5px] text-ink-muted">
                    {a.scenarioDisplayName} · {a.sessionCount} session{a.sessionCount === 1 ? "" : "s"}
                    {a.averageVerifiedScore !== null ? ` · avg ${Math.round(a.averageVerifiedScore * 100)}%` : ""}
                  </div>
                </div>
                <AssignmentStatusBadge status={a.status} />
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Card className="mb-6">
        <div className="mb-3 text-[13px] font-semibold text-ink">Enroll a student</div>
        {detail.archivedAt ? (
          <p className="text-[12.5px] text-ink-muted">This class is archived. Restore it to enroll new students.</p>
        ) : (
          <form action={enrollStudentAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="classId" value={classId} />
            <div className="flex flex-col gap-1">
              <label htmlFor="studentNumber" className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                Student number
              </label>
              <input
                id="studentNumber"
                name="studentNumber"
                type="text"
                required
                maxLength={100}
                placeholder="e.g. 2099-00001"
                className="rounded-full border border-border bg-surface px-4 py-2 text-[12.5px] text-ink outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
              />
            </div>
            <button
              type="submit"
              className="rounded-full bg-primary px-5 py-2.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-primary/90"
            >
              Enroll
            </button>
          </form>
        )}
        <p className="mt-2 text-[11.5px] text-ink-subtle">
          Enrollment requires the student&apos;s exact student number, the same one shown on their results.
        </p>
      </Card>

      <Card padded={false}>
        <div className="px-6 pt-5 pb-3 text-[13px] font-semibold text-ink">Enrolled students ({detail.students.length})</div>
        {detail.students.length === 0 ? (
          <p className="px-6 pb-5 text-[12.5px] text-ink-muted">No students enrolled yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-[13px]">
              <thead>
                <tr className="border-y border-border text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                  <th className="px-6 py-2">Name</th>
                  <th className="px-6 py-2">Student number</th>
                  <th className="px-6 py-2">Enrolled</th>
                  <th className="px-6 py-2" />
                </tr>
              </thead>
              <tbody>
                {detail.students.map((s) => (
                  <tr key={s.studentId} className="border-b border-border last:border-b-0">
                    <td className="px-6 py-3 font-medium text-ink">{s.fullName}</td>
                    <td className="px-6 py-3 text-ink-muted">{s.studentNumber ?? "—"}</td>
                    <td className="px-6 py-3 text-ink-muted">{new Date(s.enrolledAt).toLocaleDateString()}</td>
                    <td className="px-6 py-3 text-right">
                      <form action={removeStudentAction}>
                        <input type="hidden" name="classId" value={classId} />
                        <input type="hidden" name="studentId" value={s.studentId} />
                        <ConfirmSubmitButton
                          confirmMessage={`Remove ${s.fullName} from this class? Their past session results and scores are kept and remain visible to you - only the enrollment itself is removed.`}
                          className="text-[12px] font-semibold text-ink-muted transition-colors hover:text-critical"
                        >
                          Remove
                        </ConfirmSubmitButton>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/classes" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-muted hover:text-ink">
      <ArrowLeft size={14} /> Back to classes
    </Link>
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
