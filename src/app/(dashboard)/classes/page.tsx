// src/app/(dashboard)/classes/page.tsx
import Link from "next/link";
import { Plus } from "lucide-react";
import { getInstructorClasses } from "@/lib/classes";
import { Card } from "@/components/Card";

export default async function ClassesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const classes = await getInstructorClasses();

  const query = q?.trim().toLowerCase();
  const filtered = query
    ? classes.filter((c) => c.name.toLowerCase().includes(query) || (c.section ?? "").toLowerCase().includes(query))
    : classes;

  const active = filtered.filter((c) => !c.archivedAt);
  const archived = filtered.filter((c) => c.archivedAt);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-primary">Classes</div>
          <h1 className="mt-1 text-[24px] font-bold tracking-tight text-ink">Your classes</h1>
          <p className="mt-1 text-[13px] text-ink-muted">Create and manage the classes you teach.</p>
        </div>
        <Link
          href="/classes/new"
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-primary/90"
        >
          <Plus size={14} /> New class
        </Link>
      </div>

      <form className="mb-6 flex items-end gap-3" method="GET">
        <div className="flex flex-col gap-1">
          <label htmlFor="q" className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            Search classes
          </label>
          <input
            id="q"
            name="q"
            type="text"
            defaultValue={q ?? ""}
            placeholder="Name or section…"
            className="rounded-full border border-border bg-surface px-4 py-2 text-[12.5px] text-ink outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
          />
        </div>
        <button
          type="submit"
          className="rounded-full border border-border px-5 py-2 text-[12.5px] font-semibold text-ink-muted transition-colors hover:border-primary/40 hover:text-ink"
        >
          Search
        </button>
        {q && (
          <Link href="/classes" className="text-[12.5px] font-medium text-ink-muted hover:text-ink">
            Clear
          </Link>
        )}
      </form>

      {classes.length === 0 ? (
        <Card tint>
          <p className="text-[13.5px] text-ink-muted">You haven&apos;t created any classes yet.</p>
        </Card>
      ) : filtered.length === 0 ? (
        <Card tint>
          <p className="text-[13.5px] text-ink-muted">No classes match &quot;{q}&quot;.</p>
          <Link href="/classes" className="mt-2 inline-block text-[12.5px] font-medium text-primary hover:underline">
            Clear search
          </Link>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          <ClassList title="Active" classes={active} />
          {archived.length > 0 && <ClassList title="Archived" classes={archived} />}
        </div>
      )}
    </div>
  );
}

function ClassList({ title, classes }: { title: string; classes: Awaited<ReturnType<typeof getInstructorClasses>> }) {
  if (classes.length === 0) return null;
  return (
    <div>
      <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink-muted">{title}</div>
      <div className="flex flex-col gap-2">
        {classes.map((c) => (
          <Link key={c.id} href={`/classes/${encodeURIComponent(c.id)}`}>
            <Card className="transition-colors hover:border-primary/40" padded={false}>
              <div className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div>
                  <div className="text-[13.5px] font-medium text-ink">{c.name}</div>
                  {c.section && <div className="mt-0.5 text-[12px] text-ink-muted">Section {c.section}</div>}
                </div>
                {c.archivedAt && (
                  <span className="inline-flex items-center rounded-full bg-ink-subtle/10 px-2.5 py-1 text-[11.5px] font-semibold text-ink-subtle">
                    Archived
                  </span>
                )}
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
