// src/app/(dashboard)/class/page.tsx
import { Card } from "@/components/Card";
import { StudentTable } from "@/components/StudentTable";
import { getStudentSessionSummaries } from "@/lib/supabaseClient";
import type { StudentSessionSummary } from "@/lib/types";

const UNASSIGNED = "Unassigned";

function groupBySection(
  students: StudentSessionSummary[],
): Map<string, StudentSessionSummary[]> {
  const groups = new Map<string, StudentSessionSummary[]>();
  for (const student of students) {
    const key = student.section ?? UNASSIGNED;
    const group = groups.get(key);
    if (group) {
      group.push(student);
    } else {
      groups.set(key, [student]);
    }
  }
  // Sections sort alphabetically; students without one drop to the bottom
  // rather than interleaving among lettered sections.
  return new Map(
    [...groups.entries()].sort(([a], [b]) => {
      if (a === UNASSIGNED) return 1;
      if (b === UNASSIGNED) return -1;
      return a.localeCompare(b);
    }),
  );
}

export default async function ClassListPage() {
  const students = await getStudentSessionSummaries();
  const sections = groupBySection(students);

  return (
    <div>
      <div className="mb-6">
        <div className="text-[11px] font-bold uppercase tracking-wide text-primary">
          Class List
        </div>
        <h1 className="mt-1 text-[24px] font-bold tracking-tight text-ink">
          Students by section
        </h1>
        <p className="mt-1 text-[13px] text-ink-muted">
          Every enrolled student, grouped by section.
        </p>
      </div>

      {sections.size === 0 ? (
        <Card>
          <p className="text-[13px] text-ink-muted">No students enrolled yet.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {[...sections.entries()].map(([section, roster]) => (
            <div key={section}>
              <div className="mb-3 flex items-baseline gap-2 px-1">
                <div className="text-[15px] font-bold text-ink">
                  {section === UNASSIGNED ? UNASSIGNED : `Section ${section}`}
                </div>
                <div className="text-[12.5px] text-ink-muted">
                  {roster.length} student{roster.length === 1 ? "" : "s"}
                </div>
              </div>
              <StudentTable students={roster} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
