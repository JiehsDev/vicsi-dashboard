// src/app/(dashboard)/class-results/[sessionId]/page.tsx
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { getResultDetail } from "@/lib/results";
import { ResultCategoryGrid } from "@/components/ResultCategoryGrid";
import { VerificationStatusBadge } from "@/components/VerificationStatusBadge";
import { Card } from "@/components/Card";
import { resolveConclusion, resolveEndingTitle, resolveRelationshipName, resolveEvidenceName } from "@/lib/scenarioContent";
import { ConfirmedFindingsCard, InsightsCard, InvestigationReview } from "@/components/SessionReasoningPanels";

export default async function InstructorResultDetailPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const result = await getResultDetail(sessionId);

  if (!result) {
    return (
      <div>
        <Link href="/class-results" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-muted hover:text-ink">
          <ArrowLeft size={14} /> Back to results
        </Link>
        <Card tint className="mt-6">
          <p className="text-[13.5px] text-ink-muted">
            That session doesn&apos;t exist, or isn&apos;t in one of your classes.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <Link href="/class-results" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-muted hover:text-ink">
          <ArrowLeft size={14} /> Back to results
        </Link>
        <a
          href={`/api/v1/class-results/${encodeURIComponent(sessionId)}/export`}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-[12.5px] font-semibold text-ink-muted transition-colors hover:border-primary/40 hover:text-ink"
        >
          <Download size={14} /> Export CSV
        </a>
      </div>

      <div className="mt-4 mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-primary">{result.scenarioDisplayName}</div>
          <h1 className="mt-1 text-[24px] font-bold tracking-tight text-ink">Session result</h1>
          <p className="mt-1 text-[12.5px] text-ink-muted">
            {result.completedAtUtc ? new Date(result.completedAtUtc).toLocaleString() : "In progress"}
            {result.durationSeconds ? ` · ${Math.round(result.durationSeconds / 60)} min` : ""}
          </p>
        </div>
        <VerificationStatusBadge status={result.verificationStatus} />
      </div>

      {result.verificationStatus === "verified" && result.verifiedScore !== null && (
        <Card className="mb-6">
          <div className="text-[12.5px] font-semibold text-ink-muted">Overall verified score</div>
          <div className="mt-1 text-[40px] font-bold text-ink">{Math.round(result.verifiedScore * 100)}%</div>
        </Card>
      )}

      {result.verificationMessage && (
        <Card tint className="mb-6">
          <div className="text-[12px] font-semibold text-ink-muted">Verification note</div>
          <p className="mt-1 text-[13px] text-ink">{result.verificationMessage}</p>
        </Card>
      )}

      <Card className="mb-6">
        <div className="mb-3 text-[13px] font-semibold text-ink">Category scores</div>
        <ResultCategoryGrid categories={result.categories} />
      </Card>

      <InvestigationReview result={result} />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <div className="mb-3 text-[13px] font-semibold text-ink">Final conclusion</div>
          {result.selectedConclusionId ? (
            <>
              <div className="text-[14px] font-medium text-ink">{resolveConclusion(result.selectedConclusionId).displayName}</div>
              <p className="mt-1 text-[12.5px] text-ink-muted">{resolveConclusion(result.selectedConclusionId).description}</p>
            </>
          ) : (
            <div className="text-[13px] text-ink-muted">No conclusion submitted.</div>
          )}
          <div className="mt-3 border-t border-border pt-3 text-[13px] text-ink-muted">
            Case outcome:{" "}
            <span className="font-medium text-ink">
              {result.resolvedEndingId ? resolveEndingTitle(result.resolvedEndingId) : "Not yet resolved"}
            </span>
          </div>
        </Card>

        <Card>
          <div className="mb-3 text-[13px] font-semibold text-ink">Client-reported (unverified)</div>
          {result.clientReported.hasScores ? (
            <ul className="flex flex-col gap-1 text-[12.5px] text-ink-muted">
              <li>Relationships correct: {result.clientReported.relationshipsCorrect ?? "—"}</li>
              <li>Relationships incorrect: {result.clientReported.relationshipsIncorrect ?? "—"}</li>
              <li>Objectives completed: {result.clientReported.objectivesCompleted ?? "—"}</li>
              <li>Objectives failed: {result.clientReported.objectivesFailed ?? "—"}</li>
              <li>Procedural violations (client count): {result.clientReported.proceduralViolationCount ?? "—"}</li>
            </ul>
          ) : (
            <p className="text-[12.5px] text-ink-muted">Not reported by the client.</p>
          )}
        </Card>
      </div>

      <ConfirmedFindingsCard findingIds={result.confirmedFindingIds} />

      <InsightsCard insightIds={result.unlockedInsightIds} />

      {result.missedEvidence.length > 0 && (
        <Card className="mb-6">
          <div className="mb-3 text-[13px] font-semibold text-ink">Missed / incomplete evidence ({result.missedEvidence.length})</div>
          <ul className="flex flex-col gap-1.5">
            {result.missedEvidence.map((e) => (
              <li key={e.evidenceId} className="text-[12.5px] text-ink-muted">
                {resolveEvidenceName(e.evidenceId)} — final status: {e.finalStatus}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {result.procedureViolations.length > 0 && (
        <Card className="mb-6">
          <div className="mb-3 text-[13px] font-semibold text-ink">Procedural violations ({result.procedureViolations.length})</div>
          <ul className="flex flex-col gap-1.5">
            {result.procedureViolations.map((v, i) => (
              <li key={i} className="text-[12.5px] text-ink-muted">
                {v.eventType}
                {v.targetId ? ` — ${v.targetId}` : ""}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {result.relationships.length > 0 && (
        <Card className="mb-6">
          <div className="mb-3 text-[13px] font-semibold text-ink">Deduction relationships ({result.relationships.length})</div>
          <ul className="flex flex-col gap-1.5">
            {result.relationships.map((r) => (
              <li key={r.relationshipId} className="flex items-center justify-between gap-3 text-[12.5px]">
                <span className="text-ink-muted">{resolveRelationshipName(r.relationshipId)}</span>
                <span className={r.state === "Completed" ? "font-medium text-good" : "text-ink-subtle"}>{r.state}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {result.events.length > 0 && (
        <Card>
          <div className="mb-3 text-[13px] font-semibold text-ink">Event timeline ({result.events.length})</div>
          <EventTimelineList events={result.events} />
        </Card>
      )}
    </div>
  );
}

function EventTimelineList({ events }: { events: { sequenceNumber: number; timestampMs: number; eventType: string; targetId: string | null }[] }) {
  return (
    <div className="max-h-[420px] overflow-y-auto">
      <ul className="flex flex-col gap-1">
        {events.map((e) => (
          <li key={e.sequenceNumber} className="flex items-center gap-3 border-b border-border py-1.5 text-[12px] last:border-b-0">
            <span className="w-16 flex-shrink-0 tabular-nums text-ink-subtle">{formatElapsed(e.timestampMs)}</span>
            <span className="text-ink-muted">{e.eventType}</span>
            {e.targetId && <span className="text-ink-subtle">— {e.targetId}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
