// src/app/results/page.tsx
//
// Student-facing results list (Part 5). Lives OUTSIDE the (dashboard) route
// group for the same reason /pairing does - (dashboard)/layout.tsx blocks
// any signed-in student outright.
import Link from "next/link";
import { Fingerprint } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getMyProfile } from "@/lib/supabaseClient";
import { getMyResultSummaries } from "@/lib/results";
import { VerificationStatusBadge } from "@/components/VerificationStatusBadge";
import { Card } from "@/components/Card";
import { signOut } from "@/app/login/actions";

export default async function MyResultsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <CenteredCard>
        <p className="text-[13.5px] text-ink-muted">Sign in to see your results.</p>
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
        <p className="text-[13.5px] text-ink-muted">This page shows a student&apos;s own assessment results.</p>
        <Link href="/class-results" className="mt-6 inline-block rounded-full bg-primary px-6 py-3 text-[14px] font-semibold text-white">
          Go to results
        </Link>
      </CenteredCard>
    );
  }

  const results = await getMyResultSummaries();

  return (
    <div className="mx-auto max-w-[860px] p-6 lg:p-12">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-white">
            <Fingerprint size={20} strokeWidth={1.75} />
          </div>
          <div>
            <div className="text-[19px] font-bold tracking-tight text-ink">My results</div>
            <div className="text-[12.5px] text-ink-muted">{profile.fullName ?? profile.studentId}</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/pairing" className="text-[12.5px] font-semibold text-primary hover:underline">
            Pair headset
          </Link>
          <form action={signOut}>
            <button type="submit" className="text-[12.5px] font-semibold text-ink-muted hover:text-ink">
              Sign out
            </button>
          </form>
        </div>
      </div>

      {results.length === 0 ? (
        <Card tint>
          <p className="text-[13.5px] text-ink-muted">No sessions yet. Pair your headset and complete an assessment to see results here.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {results.map((r) => (
            <Link key={r.sessionId} href={`/results/${encodeURIComponent(r.sessionId)}`}>
              <Card className="transition-colors hover:border-primary/40">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[14px] font-semibold text-ink">{r.scenarioDisplayName}</div>
                    <div className="mt-0.5 text-[12.5px] text-ink-muted">
                      {r.completedAtUtc ? new Date(r.completedAtUtc).toLocaleString() : "In progress"}
                      {r.durationSeconds ? ` · ${Math.round(r.durationSeconds / 60)} min` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {r.verificationStatus === "verified" && r.verifiedScore !== null && (
                      <div className="text-[18px] font-bold text-ink">{Math.round(r.verifiedScore * 100)}%</div>
                    )}
                    <VerificationStatusBadge status={r.verificationStatus} />
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
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
