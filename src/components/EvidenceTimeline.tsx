// src/components/EvidenceTimeline.tsx
import { Check, X, TriangleAlert, FileText } from "lucide-react";
import type { EvidenceEvent } from "@/lib/types";

type Role = "success" | "danger" | "warning" | "neutral";

const ROLE_CLASSES: Record<Role, { text: string; bg: string; ring: string }> = {
  success: { text: "text-good", bg: "bg-good/10", ring: "ring-good/20" },
  danger: { text: "text-critical", bg: "bg-critical/10", ring: "ring-critical/20" },
  warning: { text: "text-warning", bg: "bg-warning/10", ring: "ring-warning/20" },
  neutral: { text: "text-ink-muted", bg: "bg-surface-tint", ring: "ring-border" },
};

/**
 * Maps event_kind/correct to a semantic role, icon, and badge label - the
 * exact table from the session-timeline task's spec. This directly mirrors
 * the schema fields, not an arbitrary palette: an "informational" row (a
 * routine milestone like "Photographed") never renders as pass/fail,
 * because migration 004 made `correct` nullable specifically so "no
 * correctness dimension here" is representable instead of a fabricated
 * true. Anything that doesn't match one of the four defined combinations
 * (shouldn't happen with well-formed data) falls back to neutral rather
 * than guessing at green or red.
 */
function styleFor(event: EvidenceEvent): {
  role: Role;
  icon: typeof Check;
  badge: string;
} {
  if (event.eventKind === "inferential" && event.correct === true) {
    return { role: "success", icon: Check, badge: "identification · correct" };
  }
  if (event.eventKind === "inferential" && event.correct === false) {
    return { role: "danger", icon: X, badge: "identification · incorrect" };
  }
  if (event.eventKind === "procedural") {
    return { role: "warning", icon: TriangleAlert, badge: "procedural violation" };
  }
  return {
    role: "neutral",
    icon: FileText,
    badge: event.action === "Reclaimed marker" ? "self-correction" : "documentation",
  };
}

const LEGEND: { role: Role; label: string }[] = [
  { role: "success", label: "Correct identification" },
  { role: "danger", label: "Incorrect identification" },
  { role: "warning", label: "Procedural violation" },
  { role: "neutral", label: "Documentation" },
];

function LegendDot({ role }: { role: Role }) {
  const c = ROLE_CLASSES[role];
  return <span className={`inline-block h-2 w-2 rounded-full ${c.bg} ring-1 ${c.ring}`} />;
}

export function EvidenceTimeline({ events }: { events: EvidenceEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface px-6 py-5">
        <p className="text-[13px] text-ink-muted">
          No events recorded for this session yet.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-border bg-surface-tint px-4 py-3">
        {LEGEND.map((l) => (
          <div key={l.role} className="flex items-center gap-1.5 text-[12px] text-ink-muted">
            <LegendDot role={l.role} />
            {l.label}
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-surface px-5 py-4">
        {events.map((event, i) => {
          const { role, icon: Icon, badge } = styleFor(event);
          const c = ROLE_CLASSES[role];
          const isLast = i === events.length - 1;
          return (
            <div key={i} className="relative flex gap-3">
              <div className="relative flex flex-col items-center">
                <div
                  className={`z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${c.bg} ring-1 ${c.ring}`}
                >
                  <Icon size={12} className={c.text} strokeWidth={2.5} />
                </div>
                {!isLast && <div className="w-px flex-1 bg-border" />}
              </div>

              <div className={`flex flex-1 items-start justify-between gap-3 ${isLast ? "" : "pb-3.5"}`}>
                <div className="min-w-0">
                  <div className="text-[13px] leading-tight text-ink">
                    <span className="font-semibold">{event.action}</span>
                    <span className="text-ink-muted"> · {event.item}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-medium ${c.bg} ${c.text}`}
                    >
                      {badge}
                    </span>
                    {event.note && (
                      <span className="text-[11.5px] text-ink-muted">{event.note}</span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 pt-0.5 text-[11.5px] tabular-nums text-ink-subtle">
                  {event.timestamp}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
