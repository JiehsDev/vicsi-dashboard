// src/app/(dashboard)/class-results/students/[studentId]/page.tsx
//
// Read-only student profile for an instructor (Part 3, minus enroll/remove -
// those require new RLS write policies this stage doesn't add; see the
// completion report). getInstructorStudentSessions filters the already
// RLS-scoped getInstructorResultSummaries() result, so an instructor can
// never reach a student outside their own classes even by guessing an id in
// the URL - the filtered list is simply empty for that id.
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getInstructorStudentSessions } from "@/lib/results";
import { VerificationStatusBadge } from "@/components/VerificationStatusBadge";
import { Card } from "@/components/Card";
import { resolveEndingTitle } from "@/lib/scenarioContent";

export default async function StudentProfilePage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  const sessions = await getInstructorStudentSessions(studentId);

  if (sessions.length === 0) {
    return (
      <div>
        <BackLink />
        <Card tint className="mt-6">
          <p className="text-[13.5px] text-ink-muted">
            No sessions found for this student in one of your classes.
          </p>
        </Card>
      </div>
    );
  }

  const { studentDisplayName, classDisplayName } = sessions[0];
  const verified = sessions.filter((s) => s.verificationStatus === "verified" && s.verifiedScore !== null);
  const averageScore = verified.length > 0 ? verified.reduce((sum, s) => sum + (s.verifiedScore as number), 0) / verified.length : null;

  return (
    <div>
      <BackLink />

      <div className="mt-4 mb-6">
        <div className="text-[11px] font-bold uppercase tracking-wide text-primary">{classDisplayName}</div>
        <h1 className="mt-1 text-[24px] font-bold tracking-tight text-ink">{studentDisplayName}</h1>
        <p className="mt-1 text-[13px] text-ink-muted">
          {sessions.length} session{sessions.length === 1 ? "" : "s"}
          {averageScore !== null ? ` · average verified score ${Math.round(averageScore * 100)}%` : ""}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {sessions.map((r, attemptIndexFromEnd) => {
          const attemptNumber = sessions.length - attemptIndexFromEnd;
          return (
            <Link key={r.sessionId} href={`/class-results/${encodeURIComponent(r.sessionId)}`}>
              <Card className="transition-colors hover:border-primary/40" padded={false}>
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                  <div>
                    <div className="text-[13.5px] font-medium text-ink">
                      {r.scenarioDisplayName} <span className="text-ink-subtle">· attempt {attemptNumber}</span>
                    </div>
                    <div className="mt-0.5 text-[12px] text-ink-muted">
                      {r.completedAtUtc ? new Date(r.completedAtUtc).toLocaleString() : "In progress"}
                      {r.durationSeconds ? ` · ${Math.round(r.durationSeconds / 60)} min` : ""}
                      {r.resolvedEndingId ? ` · ${resolveEndingTitle(r.resolvedEndingId)}` : ""}
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
}

function BackLink() {
  return (
    <Link href="/class-results" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-muted hover:text-ink">
      <ArrowLeft size={14} /> Back to results
    </Link>
  );
}
