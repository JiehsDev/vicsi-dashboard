// src/components/TopNav.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LogOut, Search } from "lucide-react";

const TABS = [
  { href: "/", label: "Class Overview" },
  { href: "/class", label: "Class List" },
];

export function TopNav({
  userEmail,
  onSignOut,
}: {
  userEmail: string | null;
  onSignOut: () => Promise<void>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");

  function navigateToResults(value: string) {
    const params = new URLSearchParams();
    if (value) params.set("q", value);
    router.replace(`/${params.toString() ? `?${params.toString()}` : ""}`);
  }

  function handleChange(value: string) {
    setQuery(value);
    // Live-filter only when already on the roster; elsewhere, typing
    // shouldn't yank the instructor off whatever page they're reading.
    if (pathname === "/") navigateToResults(value);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") navigateToResults(query);
  }

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto max-w-[1220px] px-6 sm:px-10">
        {/* Row 1 — brand, course context, instructor identity */}
        <div className="flex items-center justify-between gap-6 py-4">
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
            <div className="hidden text-[13px] text-ink-muted sm:block">
              Instructor:{" "}
              <span className="font-medium text-ink">
                {userEmail ?? "—"}
              </span>
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

        {/* Row 2 — tabs, search */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-3">
          <div className="flex items-center gap-2 overflow-x-auto text-[13px] font-semibold">
            {TABS.map((tab) => {
              const active = pathname === tab.href;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`whitespace-nowrap rounded-full px-4 py-2 transition-colors ${
                    active
                      ? "bg-primary text-white"
                      : "text-ink-muted hover:bg-surface-tint hover:text-ink"
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>

          <div className="relative w-full sm:w-auto">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle"
            />
            <input
              value={query}
              onChange={(e) => handleChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search students…"
              className="w-full rounded-full border border-border bg-bg py-2 pl-8 pr-3 text-[13px] text-ink outline-none transition focus:border-primary sm:w-[200px]"
            />
          </div>
        </div>
      </div>
    </header>
  );
}
