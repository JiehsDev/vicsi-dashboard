// src/components/TrendPill.tsx
import { ArrowDown, ArrowUp } from "lucide-react";

export function TrendPill({ pts }: { pts: number }) {
  const isDown = pts < 0;
  const Icon = isDown ? ArrowDown : ArrowUp;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold tabular-nums ${
        isDown ? "bg-critical/10 text-critical" : "bg-ink/5 text-ink-muted"
      }`}
    >
      <Icon size={11} strokeWidth={2.5} />
      {pts > 0 ? "+" : ""}
      {pts} pts
    </span>
  );
}
