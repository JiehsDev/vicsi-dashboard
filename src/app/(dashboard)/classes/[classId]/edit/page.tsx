// src/app/(dashboard)/classes/[classId]/edit/page.tsx
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getClassDetail } from "@/lib/classes";
import { updateClassAction } from "../../actions";
import { Card } from "@/components/Card";
import { AcademicPeriodFields } from "@/components/AcademicPeriodFields";

export default async function EditClassPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { classId } = await params;
  const { error } = await searchParams;
  const detail = await getClassDetail(classId);

  if (!detail) {
    return (
      <div>
        <BackLink classId={classId} />
        <Card tint className="mt-6">
          <p className="text-[13.5px] text-ink-muted">That class doesn&apos;t exist, or isn&apos;t one of yours.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[560px]">
      <BackLink classId={classId} />

      <div className="mt-4 mb-6">
        <div className="text-[11px] font-bold uppercase tracking-wide text-primary">Classes</div>
        <h1 className="mt-1 text-[24px] font-bold tracking-tight text-ink">Edit class</h1>
      </div>

      {error && (
        <Card tint className="mb-5 border-critical/30">
          <p className="text-[13px] text-critical" role="alert">
            {error}
          </p>
        </Card>
      )}

      <Card>
        <form action={updateClassAction} className="flex flex-col gap-4">
          <input type="hidden" name="classId" value={classId} />

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
              defaultValue={detail.name}
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
              defaultValue={detail.section ?? ""}
              className="rounded-xl border border-border bg-bg px-4 py-2.5 text-[13.5px] text-ink outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
            />
          </div>

          <AcademicPeriodFields academicYear={detail.academicYear} semester={detail.semester} />
          {!detail.academicYear && !detail.semester && (
            <p className="-mt-2 text-[11.5px] text-primary">
              This class has no academic period set yet - filling it in here will save it.
            </p>
          )}

          <button
            type="submit"
            className="mt-2 rounded-full bg-primary px-5 py-3 text-[13.5px] font-semibold text-white transition-colors hover:bg-primary/90 active:scale-[0.98]"
          >
            Save changes
          </button>
        </form>
      </Card>
    </div>
  );
}

function BackLink({ classId }: { classId: string }) {
  return (
    <Link href={`/classes/${encodeURIComponent(classId)}`} className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-muted hover:text-ink">
      <ArrowLeft size={14} /> Back to class
    </Link>
  );
}
