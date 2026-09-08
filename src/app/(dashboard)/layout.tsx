// src/app/(dashboard)/layout.tsx
import { Suspense } from "react";
import { TopNav } from "@/components/TopNav";
import { signOut } from "@/app/login/actions";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getMyProfile } from "@/lib/supabaseClient";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  let userEmail: string | null = null;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userEmail = user?.email ?? null;
  } catch (error) {
    console.error("[dashboard layout] Supabase auth check failed:", error);
  }

  // Proxy only checks "signed in", not role — students authenticate through
  // the same login. There is no student-facing area built yet (that's
  // separate, later work per this task's own roadmap), so a student landing
  // here gets an honest inline message instead of a redirect to a route
  // that doesn't exist - the old version of this check redirected to
  // "/student", which would now 404.
  const profile = await getMyProfile();
  if (profile?.role === "student") {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-[420px] rounded-2xl border border-border bg-surface px-9 py-10 text-center shadow-[0_20px_60px_-20px_rgba(24,24,21,0.20)]">
          <div className="text-[22px] font-bold tracking-tight text-ink">
            TRACEBOARD
          </div>
          <p className="mt-3 text-[13.5px] leading-relaxed text-ink-muted">
            The student view isn&apos;t built yet — only the instructor
            dashboard exists right now.
          </p>
          <form action={signOut} className="mt-8">
            <button
              type="submit"
              className="w-full rounded-full bg-primary py-3.5 text-[14px] font-semibold text-white transition-colors hover:bg-primary/90 active:scale-[0.98]"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Suspense fallback={null}>
        <TopNav userEmail={userEmail} onSignOut={signOut} />
      </Suspense>
      <div className="mx-auto max-w-[1220px] px-6 pb-16 pt-8 sm:px-10">
        {children}
      </div>
    </div>
  );
}
