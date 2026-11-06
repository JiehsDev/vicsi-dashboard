// src/app/signup/page.tsx
import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { SignupForm } from "@/components/SignupForm";
import {classJoinReturnPath} from "@/lib/classInvites";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string;next?:string }>;
}) {
  const { error,next:rawNext } = await searchParams;
  const next=classJoinReturnPath(rawNext);

  return (
    <div className="flex min-h-screen items-center justify-center p-6 lg:p-12">
      <div className="relative flex w-full max-w-[1040px] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_20px_60px_-20px_rgba(24,24,21,0.20)] lg:flex-row">
        {/* Brand panel */}
        <div className="relative flex flex-col justify-between overflow-hidden border-b border-border auth-brand-panel px-9 py-10 lg:w-[38%] lg:border-b-0 lg:border-r lg:px-12 lg:py-14">
          <div className="relative">
            <BrandLogo className="mb-6"/>
            <p className="mt-3 max-w-[280px] text-[13.5px] leading-relaxed auth-brand-description">
              Create your student account to see your own evidence ID
              accuracy, procedural compliance, and scenario progress after
              every session.
            </p>
          </div>

          <div className="relative mt-10 text-[12px] auth-brand-switcher">
            Already registered?{" "}
            <Link
              href={next?`/login?next=${encodeURIComponent(next)}`:"/login"}
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
            <h1 className="mb-1 mt-1 text-[22px] font-bold text-ink">
              Create your account
            </h1>
            <div className="mb-8 text-[13.5px] text-ink-muted">
              This account is for students only — instructor accounts are
              set up separately.
            </div>

            <SignupForm error={error} next={next??undefined}/>
          </div>
        </div>
      </div>
    </div>
  );
}
