// src/components/StatusPill.tsx
import { AlertTriangle, CheckCircle2, type LucideIcon } from "lucide-react";
import type { StudentStatus } from "@/lib/types";

interface StatusMeta {
  label: string;
  colorClass: string;
  bgClass: string;
  Icon: LucideIcon;
}

const STATUS_META: Record<StudentStatus, StatusMeta> = {
  flagged: {
    label: "Flagged",
    colorClass: "text-critical",
    bgClass: "bg-critical/10",
    Icon: AlertTriangle,
  },
  onTrack: {
    label: "On track",
    colorClass: "text-ink-muted",
    bgClass: "bg-ink/5",
    Icon: CheckCircle2,
  },
  strong: {
    label: "Strong",
    colorClass: "text-good",
    bgClass: "bg-good/10",
    Icon: CheckCircle2,
  },
};

export function StatusPill({ status }: { status: StudentStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.colorClass} ${meta.bgClass}`}
    >
      <meta.Icon size={12} strokeWidth={2.5} />
      {meta.label}
    </span>
  );
}
