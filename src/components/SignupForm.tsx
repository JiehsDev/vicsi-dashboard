// src/components/SignupForm.tsx
"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { PinInput } from "@/components/PinInput";
import { signUp } from "@/app/signup/actions";
import { SECTIONS } from "@/lib/constants";

export function SignupForm({ error }: { error?: string }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pin, setPin] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const passwordsMismatch =
    submitted && confirmPassword.length > 0 && password !== confirmPassword;
  const pinIncomplete = submitted && pin.length > 0 && pin.length < 4;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    setSubmitted(true);
    // Client-side check is UX only — blocks obviously-invalid submits so
    // the round trip to the server action isn't the first feedback the
    // student gets. The server action re-validates everything regardless.
    if (password !== confirmPassword || pin.length !== 4) {
      e.preventDefault();
    }
  }

  return (
    <form onSubmit={handleSubmit} action={signUp} className="flex flex-col gap-4" noValidate>
      {error && (
        <div className="rounded-xl border border-critical/20 bg-critical/10 px-4 py-3 text-[12.5px] text-critical">
          {error}
        </div>
      )}

      <label className="text-[12.5px] font-semibold text-ink">
        Full name
        <input
          name="name"
          type="text"
          required
          autoComplete="name"
          placeholder="Juan Dela Cruz"
          className="mt-1.5 w-full rounded-xl border border-border bg-bg px-4 py-3.5 text-[14px] text-ink outline-none ring-2 ring-transparent transition placeholder:text-ink-subtle focus:border-primary focus:ring-primary/20"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-[12.5px] font-semibold text-ink">
          Student ID
          <input
            name="studentId"
            type="text"
            required
            autoComplete="username"
            placeholder="e.g. 2021-04521"
            className="mt-1.5 w-full rounded-xl border border-border bg-bg px-4 py-3.5 text-[14px] text-ink outline-none ring-2 ring-transparent transition placeholder:text-ink-subtle focus:border-primary focus:ring-primary/20"
          />
        </label>
        <label className="text-[12.5px] font-semibold text-ink">
          Section
          <select
            name="section"
            required
            defaultValue=""
            className="mt-1.5 w-full rounded-xl border border-border bg-bg px-4 py-3.5 text-[14px] text-ink outline-none ring-2 ring-transparent transition focus:border-primary focus:ring-primary/20"
          >
            <option value="" disabled>
              Select…
            </option>
            {SECTIONS.map((section) => (
              <option key={section} value={section}>
                {section}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-[12.5px] font-semibold text-ink">
          Password
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-border bg-bg px-4 py-3.5 text-[14px] text-ink outline-none ring-2 ring-transparent transition placeholder:text-ink-subtle focus:border-primary focus:ring-primary/20"
          />
        </label>
        <label className="text-[12.5px] font-semibold text-ink">
          Confirm password
          <input
            name="confirmPassword"
            type="password"
            required
            autoComplete="new-password"
            placeholder="••••••••"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={`mt-1.5 w-full rounded-xl border bg-bg px-4 py-3.5 text-[14px] text-ink outline-none ring-2 ring-transparent transition placeholder:text-ink-subtle focus:ring-primary/20 ${
              passwordsMismatch
                ? "border-critical focus:border-critical"
                : "border-border focus:border-primary"
            }`}
          />
        </label>
      </div>
      {passwordsMismatch && (
        <div className="-mt-2 text-[12px] text-critical">
          Passwords don't match.
        </div>
      )}

      <div className="mt-2 rounded-xl border border-border bg-surface-tint px-4 py-4">
        <div className="flex items-center gap-2 text-[12.5px] font-semibold text-ink">
          <KeyRound size={14} className="text-primary" />
          4-digit game PIN
        </div>
        <p className="mt-1 mb-3 text-[12px] leading-relaxed text-ink-muted">
          This is what you'll type on the VR headset — your Student ID and
          this PIN log you into the game. Keep it different from your
          password.
        </p>
        <PinInput name="pin" onChange={setPin} />
        {pinIncomplete && (
          <div className="mt-2 text-[12px] text-critical">
            Enter all 4 digits.
          </div>
        )}
      </div>

      <button
        type="submit"
        className="mt-3 w-full rounded-full bg-primary py-3.5 text-[14px] font-semibold text-white transition-colors hover:bg-primary/90 active:scale-[0.98]"
      >
        Create account
      </button>
    </form>
  );
}
