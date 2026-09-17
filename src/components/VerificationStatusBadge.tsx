// src/components/VerificationStatusBadge.tsx
import { CheckCircle2, Clock, AlertTriangle, XCircle } from "lucide-react";

const STATUS_META: Record<string, { label: string; icon: typeof CheckCircle2; className: string }> = {
  verified: { label: "Verified", icon: CheckCircle2, className: "bg-good/10 text-good" },
  pending_verification: { label: "Pending verification", icon: Clock, className: "bg-primary/10 text-primary" },
  requires_review: { label: "Requires review", icon: AlertTriangle, className: "bg-amber-500/10 text-amber-600" },
  verification_failed: { label: "Verification failed", icon: XCircle, className: "bg-critical/10 text-critical" },
};

export function VerificationStatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, icon: Clock, className: "bg-ink-subtle/10 text-ink-subtle" };
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${meta.className}`}>
      <Icon size={13} /> {meta.label}
    </span>
  );
}
