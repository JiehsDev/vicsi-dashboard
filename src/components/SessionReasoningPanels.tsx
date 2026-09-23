// src/components/SessionReasoningPanels.tsx
//
// Shared reasoning-review panels used identically by the student session-detail
// page (src/app/results/[sessionId]/page.tsx) and the instructor session-detail
// page (src/app/(dashboard)/class-results/[sessionId]/page.tsx) — extracted here
// rather than duplicated so the two views can never drift apart, same "reuse
// the exact layout" precedent BUSINESS_RULES.md already documents for
// /student vs. the instructor student-profile page.
//
// Every id -> text resolution goes through src/lib/scenarioContent.ts, never
// inline here — this file only decides LAYOUT, never CONTENT.
import { Card } from "./Card";
import type { ResultDetail } from "@/lib/results";
import { resolveFindingName, resolveInsight, isTestOnlyFinding } from "@/lib/scenarioContent";

export function ConfirmedFindingsCard({ findingIds }: { findingIds: string[] }) {
  const real = findingIds.filter((id) => !isTestOnlyFinding(id));
  if (real.length === 0) return null;

  return (
    <Card className="mb-6">
      <div className="mb-3 text-[13px] font-semibold text-ink">Confirmed findings ({real.length})</div>
      <ul className="flex flex-col gap-1.5">
        {real.map((id) => (
          <li key={id} className="text-[12.5px] text-ink-muted">
            {resolveFindingName(id)}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function InsightsCard({ insightIds }: { insightIds: string[] }) {
  if (insightIds.length === 0) return null;

  return (
    <Card className="mb-6">
      <div className="mb-3 text-[13px] font-semibold text-ink">Investigative insights ({insightIds.length})</div>
      <ul className="flex flex-col gap-3">
        {insightIds.map((id) => {
          const insight = resolveInsight(id);
          return (
            <li key={id}>
              <div className="text-[13px] font-medium text-ink">{insight.displayName}</div>
              {insight.description && <p className="mt-0.5 text-[12.5px] text-ink-muted">{insight.description}</p>}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** Compact "how the investigation went" stat row — every number here is
 *  derived from data already on ResultDetail, nothing recalculated or
 *  invented. Evidence totals compare against evidenceResults.length (the
 *  scenario's own tracked item count for this session), not a hardcoded
 *  scenario size, so it stays correct if the scenario's evidence roster
 *  ever changes. */
export function InvestigationReview({ result }: { result: ResultDetail }) {
  const totalEvidence = result.evidenceResults.length;
  const discovered = result.evidenceResults.filter((e) => e.finalStatus !== "NotFound").length;
  const processed = result.evidenceResults.filter((e) => e.finalStatus === "Processed").length;
  const findingsConfirmed = result.confirmedFindingIds.filter((id) => !isTestOnlyFinding(id)).length;
  const relationshipsCompleted = result.relationships.filter((r) => r.state === "Completed").length;

  const stats: { label: string; value: string }[] = [
    { label: "Evidence discovered", value: totalEvidence > 0 ? `${discovered} / ${totalEvidence}` : "—" },
    { label: "Evidence fully processed", value: totalEvidence > 0 ? `${processed} / ${totalEvidence}` : "—" },
    { label: "Findings confirmed", value: String(findingsConfirmed) },
    { label: "Relationships completed", value: String(relationshipsCompleted) },
    { label: "Procedural violations", value: String(result.procedureViolations.length) },
    { label: "Duration", value: result.durationSeconds ? `${Math.round(result.durationSeconds / 60)} min` : "—" },
  ];

  return (
    <Card className="mb-6">
      <div className="mb-3 text-[13px] font-semibold text-ink">Investigation coverage</div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label}>
            <div className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">{s.label}</div>
            <div className="mt-0.5 text-[15px] font-semibold text-ink">{s.value}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
