// src/components/TopNav.tsx
"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { LogOut, Search } from "lucide-react";

// No tab list here on purpose: Class Overview is currently the only screen
// that exists past auth (see Part 2 of the task this was built under —
// student detail / scenario diagnostics / session replay are separate,
// later work). A row of tabs where only one link actually goes anywhere
// would read as broken, not as "more is coming".
export function TopNav({
  userEmail,
  onSignOut,
}: {
  userEmail: string | null;
  onSignOut: () => Promise<void>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");

  function navigateToResults(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("q", value);
    else params.delete("q");
    router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ""}`);
  }

  function handleChange(value: string) {
    setQuery(value);
    navigateToResults(value);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") navigateToResults(query);
  }

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto max-w-[1220px] px-6 sm:px-10">
        <div className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-[12px] font-bold text-white">
              VR
            </div>
            <div className="text-[15px] font-extrabold tracking-tight text-ink">
              TRACEBOARD
            </div>
          </div>

          <div className="hidden text-[13px] text-ink-muted md:block">
            Partido State University — Lagonoy Campus · Criminology Dept.
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle"
              />
              <input
                value={query}
                onChange={(e) => handleChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search students…"
                className="w-[180px] rounded-full border border-border bg-bg py-2 pl-8 pr-3 text-[13px] text-ink outline-none transition focus:border-primary sm:w-[220px]"
              />
            </div>
            <div className="hidden text-[13px] text-ink-muted sm:block">
              Instructor: <span className="font-medium text-ink">{userEmail ?? "—"}</span>
            </div>
            <form action={onSignOut}>
              <button
                type="submit"
                aria-label="Sign out"
                className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-tint hover:text-ink"
              >
                <LogOut size={14} />
              </button>
            </form>
          </div>
        </div>
      </div>
    </header>
  );
}
