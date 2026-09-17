// src/components/AcademicPeriodFields.tsx

const SEMESTER_OPTIONS = ["1st", "2nd", "Summer"] as const;

/** Shared academic-year/semester form fields for /classes/new and
 *  /classes/[classId]/edit - kept as one component specifically so the two
 *  forms can never drift into showing the period inconsistently (different
 *  placeholder, different semester options, etc.). HTML5 `pattern` +
 *  `required` give instant client-side feedback, but the real enforcement
 *  is validate_academic_period (016_class_assignment_management.sql) -
 *  these attributes are UX only, never trusted on their own. */
export function AcademicPeriodFields({
  academicYear,
  semester,
}: {
  academicYear?: string | null;
  semester?: string | null;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="academicYear" className="text-[12.5px] font-semibold text-ink">
          Academic year <span className="text-critical">*</span>
        </label>
        <input
          id="academicYear"
          name="academicYear"
          type="text"
          required
          pattern="\d{4}-\d{4}"
          title="e.g. 2026-2027 - the ending year must be one more than the starting year"
          defaultValue={academicYear ?? ""}
          placeholder="e.g. 2026-2027"
          className="rounded-xl border border-border bg-bg px-4 py-2.5 text-[13.5px] text-ink outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
        />
        <p className="text-[11.5px] text-ink-subtle">Format: 2026-2027 - the second year must be exactly one more than the first.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="semester" className="text-[12.5px] font-semibold text-ink">
          Semester <span className="text-critical">*</span>
        </label>
        <select
          id="semester"
          name="semester"
          required
          defaultValue={semester ?? ""}
          className="rounded-xl border border-border bg-bg px-4 py-2.5 text-[13.5px] text-ink outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          <option value="" disabled>
            Select…
          </option>
          {SEMESTER_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/** Consistent read-only display of a class's period, used anywhere a class
 *  is referenced (class detail, assignment list/detail/new) so the same
 *  class always reads the same way. Returns null (renders nothing) when
 *  neither field is set yet - a legacy class with no period shows no period
 *  text at all, never a fabricated placeholder. */
export function formatAcademicPeriod(academicYear: string | null, semester: string | null): string | null {
  const parts = [academicYear, semester].filter((v): v is string => Boolean(v));
  return parts.length > 0 ? parts.join(" ") : null;
}
