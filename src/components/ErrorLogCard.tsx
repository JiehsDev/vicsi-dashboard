// src/components/ErrorLogCard.tsx
import { Card } from "./Card";
import type { ErrorLogEntry } from "@/lib/types";

export function ErrorLogCard({ entries }: { entries: ErrorLogEntry[] }) {
  const max = Math.max(...entries.map((e) => e.occurrences), 1);

  return (
    <Card tint>
      <div className="mb-4 text-[15px] font-bold text-ink">
        Common error log — classwide
      </div>
      <div className="flex flex-col gap-3.5">
        {entries.length === 0 ? (
          <div className="text-[13px] text-ink-muted">
            No procedural errors recorded.
          </div>
        ) : (
          entries.map((e) => (
            <div key={e.label}>
              <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
                <span className="text-ink">{e.label}</span>
                <span className="text-ink-muted">
                  {e.occurrences} occurrences
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${(e.occurrences / max) * 100}%` }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
