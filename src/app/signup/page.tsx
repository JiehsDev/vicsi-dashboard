// src/app/signup/page.tsx
import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { SignupForm } from "@/components/SignupForm";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center p-6 lg:p-12">
      <div className="relative flex w-full max-w-[1040px] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_20px_60px_-20px_rgba(24,24,21,0.20)] lg:flex-row">
        {/* Brand panel */}
        <div className="relative flex flex-col justify-between overflow-hidden border-b border-border bg-surface-tint px-9 py-10 lg:w-[38%] lg:border-b-0 lg:border-r lg:px-12 lg:py-14">
          <div className="relative">
            <div className="mb-8 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-white">
              <GraduationCap size={22} strokeWidth={1.75} />
            </div>
            <div className="text-[26px] font-bold leading-tight tracking-tight text-ink">
              TRACEBOARD
            </div>
            <p className="mt-3 max-w-[280px] text-[13.5px] leading-relaxed text-ink-muted">
              Create your student account to see your own evidence ID
              accuracy, procedural compliance, and scenario progress after
              every session.
            </p>
          </div>

          <div className="relative mt-10 text-[12px] text-ink-muted">
            Already registered?{" "}
            <Link
              href="/login"
              className="font-semibold text-primary hover:underline"
            >
              Sign in instead
            </Link>
          </div>
        </div>

        {/* Form panel */}
        <div className="flex flex-1 items-center justify-center px-8 py-12 lg:px-14 lg:py-14">
          <div className="w-full max-w-[400px]">
            <div className="text-[11px] font-bold uppercase tracking-wide text-primary">
              Student sign up
            </div>
            <div className="mb-1 mt-1 text-[22px] font-bold text-ink">
              Create your account
            </div>
            <div className="mb-8 text-[13.5px] text-ink-muted">
              This account is for students only — instructor accounts are
              set up separately.
            </div>

            <SignupForm error={error} />
          </div>
        </div>
      </div>
    </div>
  );
}
