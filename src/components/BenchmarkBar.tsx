// src/components/BenchmarkBar.tsx

export function BenchmarkBar({
  label,
  classValue,
  expertValue,
  unit = "%",
}: {
  label: string;
  classValue: number;
  expertValue: number;
  unit?: string;
}) {
  const max = Math.max(classValue, expertValue, 100);
  const classPct = (classValue / max) * 100;
  const expertPct = (expertValue / max) * 100;

  return (
    <div className="mb-5 last:mb-0">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[13.5px] font-semibold text-ink">{label}</span>
        <span className="text-[12px] text-ink-muted">
          class {classValue}
          {unit} · expert {expertValue}
          {unit}
        </span>
      </div>
      <div className="relative h-3 rounded-full bg-surface-tint">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${classPct}%` }}
        />
        <div
          className="absolute -top-1 h-5 w-[2px] rounded-full bg-ink/50"
          style={{ left: `calc(${expertPct}% - 1px)` }}
        />
      </div>
    </div>
  );
}
