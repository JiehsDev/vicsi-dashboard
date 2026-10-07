// src/components/ResultCategoryGrid.tsx

/** Maps a score category's DB key (src/lib/scoring/types.ts's ScoreCategories)
 *  to student/instructor-facing copy. Deliberately no raw ground-truth
 *  content here - every label describes a RATIO, never "which specific
 *  answer was correct" (see results.ts's own comment on why). */
const CATEGORY_LABELS: Record<string, string> = {
  criticalRecall: "Critical evidence recall",
  relevantRecall: "Relevant evidence recall",
  precision: "Precision",
  distractorFallRate: "Distractor fall rate",
  reasoningAccuracy: "Deduction (reasoning) accuracy",
  documentationAccuracy: "Documentation accuracy",
  relationshipAccuracy: "Relationship accuracy",
  proceduralCompliance: "Procedural compliance",
  finalConclusionAccuracy: "Final conclusion accuracy",
  scenePhotography: "Scene photography",
  measurement: "Evidence measurement",
  procedureOrderCompliance: "Procedure order compliance",
};

const CATEGORY_ORDER = [
  "criticalRecall",
  "relevantRecall",
  "precision",
  "distractorFallRate",
  "reasoningAccuracy",
  "documentationAccuracy",
  "relationshipAccuracy",
  "proceduralCompliance",
  "finalConclusionAccuracy",
  "scenePhotography",
  "measurement",
  "procedureOrderCompliance",
];

/** Short detail line under a category's percentage, from a companion count
 *  stored alongside it (never itself shown as a percentage). */
function categoryDetail(key: string, categories: Record<string, number>): string | null {
  if (key === "procedureOrderCompliance") {
    const n = categories.procedureOrderWarningCount;
    if (n === undefined || n === null) return null;
    return `${n} out-of-order action${n === 1 ? "" : "s"}`;
  }
  return null;
}

/** distractorFallRate reads better inverted for a student/instructor
 *  ("avoided the distractor 100% of the time") than as a raw fall-rate,
 *  but the STORED value is always the true fall-rate (never inverted at
 *  rest) - inversion happens only here, at render time. */
const INVERT_FOR_DISPLAY = new Set(["distractorFallRate"]);

export function ResultCategoryGrid({ categories }: { categories: Record<string, number> }) {
  const keys = CATEGORY_ORDER.filter((k) => categories[k] !== undefined && categories[k] !== null);
  if (keys.length === 0) {
    return <p className="text-[13px] text-ink-muted">No category scores available yet.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {keys.map((key) => {
        const raw = categories[key];
        const display = INVERT_FOR_DISPLAY.has(key) ? 1 - raw : raw;
        return (
          <div key={key} className="rounded-xl border border-border bg-surface-tint px-3.5 py-3">
            <div className="text-[11px] font-medium leading-snug text-ink-muted">{CATEGORY_LABELS[key] ?? key}</div>
            <div className="mt-1 text-[19px] font-bold text-ink">{Math.round(display * 100)}%</div>
            {categoryDetail(key, categories) && (
              <div className="mt-0.5 text-[11px] text-ink-muted">{categoryDetail(key, categories)}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
