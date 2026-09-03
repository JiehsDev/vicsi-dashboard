// src/components/ScenarioCompletionCard.tsx
import { Card } from "./Card";
import type { ScenarioAggregate } from "@/lib/types";

export function ScenarioCompletionCard({
  scenarios,
}: {
  scenarios: ScenarioAggregate[];
}) {
  return (
    <Card tint>
      <div className="mb-4 text-[15px] font-bold text-ink">
        Scenario completion rates
      </div>
      <div className="flex flex-col gap-3.5">
        {scenarios.length === 0 ? (
          <div className="text-[13px] text-ink-muted">
            No scenario data yet.
          </div>
        ) : (
          scenarios.map((s) => (
            <div key={s.scenarioId}>
              <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
                <span className="text-ink">{s.scenarioName}</span>
                <span className="font-semibold text-ink">
                  {s.completionRate}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${s.completionRate}%` }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
