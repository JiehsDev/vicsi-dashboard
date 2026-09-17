// src/components/AssignmentStatusBadge.tsx
import { CheckCircle2, Clock, XCircle, PauseCircle } from "lucide-react";
import type { AssignmentStatus } from "@/lib/assignments";

const STATUS_META: Record<AssignmentStatus, { label: string; icon: typeof CheckCircle2; className: string }> = {
  active: { label: "Active", icon: CheckCircle2, className: "bg-good/10 text-good" },
  upcoming: { label: "Upcoming", icon: Clock, className: "bg-primary/10 text-primary" },
  closed: { label: "Closed", icon: XCircle, className: "bg-ink-subtle/10 text-ink-subtle" },
  inactive: { label: "Inactive", icon: PauseCircle, className: "bg-critical/10 text-critical" },
};

export function AssignmentStatusBadge({ status }: { status: AssignmentStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${meta.className}`}>
      <Icon size={13} /> {meta.label}
    </span>
  );
}
