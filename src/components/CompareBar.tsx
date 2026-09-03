// src/components/CompareBar.tsx

interface CompareBarProps {
  label: string;
  student: number;
  classAvg: number;
  expert: number;
  unit?: string;
}

const ROWS = [
  { key: "student" as const, tag: "Student", color: "bg-primary" },
  { key: "classAvg" as const, tag: "Class avg", color: "bg-ink-subtle" },
  { key: "expert" as const, tag: "Expert", color: "bg-good" },
];

export function CompareBar({
  label,
  student,
  classAvg,
  expert,
  unit = "%",
}: CompareBarProps) {
  const values = { student, classAvg, expert };
  const max = Math.max(student, classAvg, expert, 100);

  return (
    <div className="mb-[18px]">
      <div className="mb-2 text-[12.5px] font-semibold text-ink">{label}</div>
      {ROWS.map((row) => {
        const value = values[row.key];
        return (
          <div key={row.key} className="mb-[7px] flex items-center gap-2.5">
            <span className="w-[70px] text-[11.5px] text-ink-muted">
              {row.tag}
            </span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-tint">
              <div
                className={`h-full rounded-full ${row.color}`}
                style={{ width: `${(value / max) * 100}%` }}
              />
            </div>
            <span className="w-[42px] text-right text-[12.5px] font-semibold tabular-nums text-ink">
              {value}
              {unit}
            </span>
          </div>
        );
      })}
    </div>
  );
}
