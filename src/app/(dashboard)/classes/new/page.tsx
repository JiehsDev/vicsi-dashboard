// src/app/(dashboard)/classes/new/page.tsx
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClassAction } from "../actions";
import { Card } from "@/components/Card";
import { AcademicPeriodFields } from "@/components/AcademicPeriodFields";

export default async function NewClassPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; name?: string; section?: string; academicYear?: string; semester?: string }>;
}) {
  const { error, name, section, academicYear, semester } = await searchParams;

  return (
    <div className="mx-auto max-w-[560px]">
      <Link href="/classes" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-muted hover:text-ink">
        <ArrowLeft size={14} /> Back to classes
      </Link>

      <div className="mt-4 mb-6">
        <div className="text-[11px] font-bold uppercase tracking-wide text-primary">Classes</div>
        <h1 className="mt-1 text-[24px] font-bold tracking-tight text-ink">New class</h1>
      </div>

      {error && (
        <Card tint className="mb-5 border-critical/30">
          <p className="text-[13px] text-critical" role="alert">
            {error}
          </p>
        </Card>
      )}

      <Card>
        <form action={createClassAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="name" className="text-[12.5px] font-semibold text-ink">
              Class name <span className="text-critical">*</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              maxLength={200}
              defaultValue={name ?? ""}
              placeholder="e.g. Criminology 101"
              className="rounded-xl border border-border bg-bg px-4 py-2.5 text-[13.5px] text-ink outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="section" className="text-[12.5px] font-semibold text-ink">
              Section
            </label>
            <input
              id="section"
              name="section"
              type="text"
              maxLength={50}
              defaultValue={section ?? ""}
              placeholder="e.g. Z (optional)"
              className="rounded-xl border border-border bg-bg px-4 py-2.5 text-[13.5px] text-ink outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
            />
          </div>

          <AcademicPeriodFields academicYear={academicYear} semester={semester} />

          <button
            type="submit"
            className="mt-2 rounded-full bg-primary px-5 py-3 text-[13.5px] font-semibold text-white transition-colors hover:bg-primary/90 active:scale-[0.98]"
          >
            Create class
          </button>
        </form>
      </Card>
    </div>
  );
}
