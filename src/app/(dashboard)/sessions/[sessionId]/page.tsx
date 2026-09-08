// src/app/(dashboard)/sessions/[sessionId]/page.tsx
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EvidenceTimeline } from "@/components/EvidenceTimeline";
import { getEvidenceTimeline } from "@/lib/supabaseClient";

export default async function SessionTimelinePage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const events = await getEvidenceTimeline(sessionId);

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-muted hover:text-ink"
        >
          <ArrowLeft size={14} />
          Back to overview
        </Link>
        <div className="mt-3 text-[11px] font-bold uppercase tracking-wide text-primary">
          Session Timeline
        </div>
        <h1 className="mt-1 text-[24px] font-bold tracking-tight text-ink">
          Evidence event log
        </h1>
        <p className="mt-1 break-all text-[13px] text-ink-muted">
          Session <span className="font-mono">{sessionId}</span>
        </p>
      </div>

      <EvidenceTimeline events={events} />
    </div>
  );
}
