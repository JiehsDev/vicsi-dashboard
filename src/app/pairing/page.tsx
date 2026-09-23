// src/app/pairing/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { Fingerprint, Gamepad2, Clock, CheckCircle2, XCircle } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getMyProfile } from "@/lib/supabaseClient";
import { getEnrolledActiveAssignments, getLatestPairingCodeStatus } from "@/lib/pairingCodes";
import { generatePairingCodeAction, cancelPairingCodeAction } from "./actions";
import { signOut } from "@/app/login/actions";

// TEMPORARY DEVELOPMENT BYPASS - restore student pairing before final
// deployment. When true, this whole page is unreachable: visiting /pairing
// (whether by an old bookmark, a stray link, or typing the URL) redirects to
// /results instead of exposing the real pairing-code flow below. Nothing
// below this flag was deleted or altered - the entire pairing implementation
// (this component, pairing/actions.ts, PairingCodeIdentityPanel on the Unity
// side) is fully intact and works exactly as before the moment this flag is
// flipped back to false. See PreSessionFlowController.cs's own matching
// TEMPORARY DEVELOPMENT BYPASS on the Unity side.
// TODO BEFORE FINAL STUDENT EVALUATION: restore headset pairing and remove
// John Doe development identity.
const PAIRING_UI_BYPASSED = true;

/** Student-facing pairing page. Lives OUTSIDE the (dashboard) route group on
 *  purpose — (dashboard)/layout.tsx redirects any signed-in student to
 *  /results now (see that layout's own bypass comment), so this page needs
 *  its own top-level route (same structural choice as /login and /signup)
 *  rather than living under that layout. */
export default async function PairingPage({
  searchParams,
}: {
  searchParams: Promise<{ generated?: string; code?: string; expiresAt?: string; assignmentId?: string; error?: string }>;
}) {
  if (PAIRING_UI_BYPASSED) {
    redirect("/results");
  }

  const { generated, code, expiresAt, error } = await searchParams;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <CenteredCard>
        <p className="text-[13.5px] text-ink-muted">Sign in to pair your headset.</p>
        <Link href="/login" className="mt-6 inline-block rounded-full bg-primary px-6 py-3 text-[14px] font-semibold text-white">
          Go to sign in
        </Link>
      </CenteredCard>
    );
  }

  const profile = await getMyProfile();
  if (profile?.role !== "student") {
    return (
      <CenteredCard>
        <p className="text-[13.5px] text-ink-muted">
          Pairing codes are issued to student accounts only. Instructors don&apos;t need one.
        </p>
        <Link href="/class-results" className="mt-6 inline-block rounded-full bg-primary px-6 py-3 text-[14px] font-semibold text-white">
          Go to results
        </Link>
      </CenteredCard>
    );
  }

  const assignments = await getEnrolledActiveAssignments(supabase);
  const statuses = await Promise.all(
    assignments.map(async (assignment) => ({
      assignment,
      status: await getLatestPairingCodeStatus(user.id, assignment.assignmentId),
    })),
  );

  return (
    <div className="flex min-h-screen items-start justify-center p-6 lg:p-12">
      <div className="w-full max-w-[640px]">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-white">
              <Fingerprint size={20} strokeWidth={1.75} />
            </div>
            <div>
              <div className="text-[19px] font-bold tracking-tight text-ink">Pair your headset</div>
              <div className="text-[12.5px] text-ink-muted">{profile.fullName ?? profile.studentId}</div>
            </div>
          </div>
          <form action={signOut}>
            <button type="submit" className="text-[12.5px] font-semibold text-ink-muted hover:text-ink">
              Sign out
            </button>
          </form>
        </div>

        <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-border bg-surface-tint px-4 py-3.5 text-[12.5px] leading-relaxed text-ink-muted">
          <Gamepad2 size={16} className="mt-0.5 flex-shrink-0 text-primary" />
          <span>
            Generate a code below, then put on the headset and enter it on the pairing screen. Codes expire after 5
            minutes and can only be used once.
          </span>
        </div>

        {error && (
          <div className="mb-5 rounded-xl border border-critical/20 bg-critical/10 px-4 py-3 text-[12.5px] text-critical">
            {error}
          </div>
        )}

        {generated === "1" && code && (
          <div className="mb-6 rounded-2xl border border-primary/30 bg-primary/5 px-6 py-6 text-center">
            <div className="text-[12.5px] font-semibold text-ink-muted">Your pairing code</div>
            <div className="mt-2 font-mono text-[40px] font-bold tracking-[0.25em] text-ink">{code}</div>
            {expiresAt && (
              <div className="mt-2 flex items-center justify-center gap-1.5 text-[12.5px] text-ink-muted">
                <Clock size={14} />
                Expires at {new Date(expiresAt).toLocaleTimeString()}
              </div>
            )}
            <p className="mt-3 text-[12px] text-ink-subtle">
              This code is shown once. Leaving this page hides it — generate a new one if you need it again.
            </p>
          </div>
        )}

        {assignments.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface px-6 py-10 text-center text-[13.5px] text-ink-muted">
            No active assignments right now. Check back once your instructor opens one.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {statuses.map(({ assignment, status }) => (
              <AssignmentCard key={assignment.assignmentId} assignment={assignment} status={status} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-[420px] rounded-2xl border border-border bg-surface px-9 py-10 text-center shadow-[0_20px_60px_-20px_rgba(24,24,21,0.20)]">
        <div className="text-[22px] font-bold tracking-tight text-ink">TRACEBOARD</div>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}

function AssignmentCard({
  assignment,
  status,
}: {
  assignment: Awaited<ReturnType<typeof getEnrolledActiveAssignments>>[number];
  status: Awaited<ReturnType<typeof getLatestPairingCodeStatus>>;
}) {
  const canGenerate = !status || status.state === "expired";

  return (
    <div className="rounded-2xl border border-border bg-surface px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[14px] font-semibold text-ink">{assignment.title ?? assignment.scenarioDisplayName}</div>
          <div className="text-[12.5px] text-ink-muted">{assignment.classDisplayName}</div>
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="mt-3.5 flex items-center gap-2.5">
        {canGenerate && (
          <form action={generatePairingCodeAction}>
            <input type="hidden" name="classId" value={assignment.classId} />
            <input type="hidden" name="assignmentId" value={assignment.assignmentId} />
            <input type="hidden" name="scenarioId" value={assignment.scenarioId} />
            <button
              type="submit"
              className="rounded-full bg-primary px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-primary/90 active:scale-[0.98]"
            >
              {status?.state === "expired" ? "Generate new code" : "Generate pairing code"}
            </button>
          </form>
        )}

        {status?.state === "active" && (
          <form action={cancelPairingCodeAction}>
            <input type="hidden" name="codeId" value={status.id} />
            <button
              type="submit"
              className="rounded-full border border-border px-5 py-2.5 text-[13px] font-semibold text-ink-muted transition-colors hover:border-critical/40 hover:text-critical"
            >
              Cancel code
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Awaited<ReturnType<typeof getLatestPairingCodeStatus>> }) {
  if (!status) return null;

  if (status.state === "consumed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-good/10 px-2.5 py-1 text-[11.5px] font-semibold text-good">
        <CheckCircle2 size={13} /> Connected
      </span>
    );
  }
  if (status.state === "active") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11.5px] font-semibold text-primary">
        <Clock size={13} /> Code active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-ink-subtle/10 px-2.5 py-1 text-[11.5px] font-semibold text-ink-subtle">
      <XCircle size={13} /> Expired
    </span>
  );
}
