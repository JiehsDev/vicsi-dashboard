// src/app/login/page.tsx
import Link from "next/link";
import { Fingerprint, Gamepad2 } from "lucide-react";
import { signIn } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; created?: string }>;
}) {
  const { error, created } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center p-6 lg:p-12">
      <div className="relative flex w-full max-w-[1040px] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_20px_60px_-20px_rgba(24,24,21,0.20)] lg:min-h-[600px] lg:flex-row">
        {/* Brand panel */}
        <div className="relative flex flex-col justify-between overflow-hidden border-b border-border bg-surface-tint px-9 py-10 lg:w-[42%] lg:border-b-0 lg:border-r lg:px-12 lg:py-14">
          <div className="relative">
            <div className="mb-8 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-white">
              <Fingerprint size={22} strokeWidth={1.75} />
            </div>
            <div className="text-[26px] font-bold leading-tight tracking-tight text-ink">
              TRACEBOARD
            </div>
            <p className="mt-3 max-w-[280px] text-[13.5px] leading-relaxed text-ink-muted">
              VR-CSI Case Analytics — Partido State University, Lagonoy
              Campus, Criminology Department.
            </p>
          </div>

          <div className="relative mt-10 flex items-start gap-2.5 rounded-xl border border-border bg-surface px-3.5 py-3 text-[12px] leading-relaxed text-ink-muted">
            <Gamepad2 size={16} className="mt-0.5 flex-shrink-0 text-primary" />
            <span>
              Playing in the VR headset? You don't need to sign in here —
              just enter your Student ID and 4-digit PIN in the game.
            </span>
          </div>
        </div>

        {/* Form panel */}
        <div className="flex flex-1 items-center justify-center px-8 py-12 lg:px-16 lg:py-14">
          <div className="w-full max-w-[360px]">
            <div className="mb-1 text-[22px] font-bold text-ink">Sign in</div>
            <div className="mb-8 text-[13.5px] text-ink-muted">
              Enter your credentials to continue.
            </div>

            {created && (
              <div className="mb-5 rounded-xl border border-good/20 bg-good/10 px-4 py-3 text-[12.5px] text-good">
                Account created — sign in with your Student ID and password.
              </div>
            )}
            {error && (
              <div className="mb-5 rounded-xl border border-critical/20 bg-critical/10 px-4 py-3 text-[12.5px] text-critical">
                {error}
              </div>
            )}

            <form action={signIn} className="flex flex-col gap-4">
              <label className="text-[12.5px] font-semibold text-ink">
                Email or Student ID
                <input
                  name="identifier"
                  type="text"
                  required
                  autoComplete="username"
                  placeholder="you@psu.edu.ph or 2021-04521"
                  className="mt-1.5 w-full rounded-xl border border-border bg-bg px-4 py-3.5 text-[14px] text-ink outline-none ring-2 ring-transparent transition placeholder:text-ink-subtle focus:border-primary focus:ring-primary/20"
                />
              </label>
              <label className="text-[12.5px] font-semibold text-ink">
                Password
                <input
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="mt-1.5 w-full rounded-xl border border-border bg-bg px-4 py-3.5 text-[14px] text-ink outline-none ring-2 ring-transparent transition placeholder:text-ink-subtle focus:border-primary focus:ring-primary/20"
                />
              </label>
              <button
                type="submit"
                className="mt-3 w-full rounded-full bg-primary py-3.5 text-[14px] font-semibold text-white transition-colors hover:bg-primary/90 active:scale-[0.98]"
              >
                Sign in
              </button>
            </form>

            <div className="mt-6 text-center text-[13px] text-ink-muted">
              New student?{" "}
              <Link
                href="/signup"
                className="font-semibold text-primary hover:underline"
              >
                Create an account
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
