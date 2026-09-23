// src/app/results/[sessionId]/page.tsx
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getMyProfile } from "@/lib/supabaseClient";
import { getResultDetail } from "@/lib/results";
import { ResultCategoryGrid } from "@/components/ResultCategoryGrid";
import { VerificationStatusBadge } from "@/components/VerificationStatusBadge";
import { Card } from "@/components/Card";
import { resolveConclusion, resolveEndingTitle, resolveRelationshipName } from "@/lib/scenarioContent";
import { ConfirmedFindingsCard, InsightsCard, InvestigationReview } from "@/components/SessionReasoningPanels";

export default async function MyResultDetailPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return <NotFoundCard />;
  }

  const profile = await getMyProfile();
  if (profile?.role !== "student") {
    return <NotFoundCard />;
  }

  const result = await getResultDetail(sessionId);
  if (!result) {
    return <NotFoundCard />;
  }

  return (
    <div className="mx-auto max-w-[860px] p-6 lg:p-12">
      <Link href="/results" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-muted hover:text-ink">
        <ArrowLeft size={14} /> Back to my results
      </Link>

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

      {result.verificationStatus === "pending_verification" && (
        <Card tint className="mb-6">
          <p className="text-[13px] text-ink-muted">
            Your session was uploaded successfully. Score verification is still processing.
          </p>
        </Card>
      )}

      {result.verificationStatus === "requires_review" && (
        <Card tint className="mb-6">
          <p className="text-[13px] text-ink-muted">
            Your session was uploaded and scored, but an instructor needs to review a data-quality note before it&apos;s finalized.
          </p>
        </Card>
      )}

      {result.verificationStatus === "verification_failed" && (
        <Card tint className="mb-6">
          <p className="text-[13px] text-ink-muted">
            Score verification hit a problem. Your session is safely stored — this will be retried; contact your instructor if it doesn&apos;t resolve.
          </p>
        </Card>
      )}

      {result.verificationStatus === "verified" && result.verifiedScore !== null && (
        <Card className="mb-6">
          <div className="text-[12.5px] font-semibold text-ink-muted">Overall verified score</div>
          <div className="mt-1 text-[40px] font-bold text-ink">{Math.round(result.verifiedScore * 100)}%</div>
        </Card>
      )}

      <Card className="mb-6">
        <div className="mb-3 text-[13px] font-semibold text-ink">Category scores</div>
        <ResultCategoryGrid categories={result.categories} />
      </Card>

      <InvestigationReview result={result} />

      <Card className="mb-6">
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

      <ConfirmedFindingsCard findingIds={result.confirmedFindingIds} />

      <InsightsCard insightIds={result.unlockedInsightIds} />

      {result.procedureViolations.length > 0 && (
        <Card className="mb-6">
          <div className="mb-3 text-[13px] font-semibold text-ink">Procedural notes ({result.procedureViolations.length})</div>
          <ul className="flex flex-col gap-1.5">
            {result.procedureViolations.slice(0, 20).map((v, i) => (
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

function NotFoundCard() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-[420px] rounded-2xl border border-border bg-surface px-9 py-10 text-center shadow-[0_20px_60px_-20px_rgba(24,24,21,0.20)]">
        <div className="text-[22px] font-bold tracking-tight text-ink">TRACEBOARD</div>
        <p className="mt-3 text-[13.5px] text-ink-muted">That session couldn&apos;t be found.</p>
        <Link href="/results" className="mt-6 inline-block rounded-full bg-primary px-6 py-3 text-[14px] font-semibold text-white">
          Back to my results
        </Link>
      </div>
    </div>
  );
}
