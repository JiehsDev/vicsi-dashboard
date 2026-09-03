// src/components/KpiCard.tsx
import { ArrowDown, ArrowUp } from "lucide-react";
import { Card } from "./Card";

interface KpiCardProps {
  label: string;
  value: number | string;
  suffix?: string;
  trendText?: string; // e.g. "+3 pts vs last month" or "0:22 faster vs last month"
  trendDirection?: "up" | "down";
}

export function KpiCard({
  label,
  value,
  suffix = "",
  trendText,
  trendDirection = "up",
}: KpiCardProps) {
  const TrendIcon = trendDirection === "down" ? ArrowDown : ArrowUp;

  return (
    <Card tint className="min-w-[200px] flex-1">
      <div className="text-[11px] font-bold uppercase tracking-wide text-primary">
        {label}
      </div>
      <div className="mt-2 text-[34px] font-bold tabular-nums text-ink">
        {value}
        <span className="text-[16px] font-medium text-ink-muted">
          {suffix}
        </span>
      </div>
      {trendText && (
        <div
          className={`mt-2 flex items-center gap-1 text-[12px] font-medium ${
            trendDirection === "down" ? "text-critical" : "text-ink-muted"
          }`}
        >
          <TrendIcon size={12} strokeWidth={2.5} />
          {trendText}
        </div>
      )}
    </Card>
  );
}
