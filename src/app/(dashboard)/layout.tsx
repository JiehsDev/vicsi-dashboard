// src/app/(dashboard)/layout.tsx
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { TopNav } from "@/components/TopNav";
import { signOut } from "@/app/login/actions";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getMyProfile } from "@/lib/supabaseClient";

// TODO BEFORE FINAL STUDENT EVALUATION: restore headset pairing and remove
// John Doe development identity. See supabase/seed/seed-john-doe-bypass-identity.mjs
// (vicsi-dashboard) and PreSessionFlowController.cs's own TODO (Unity repo) for the
// matching Unity-side restoration steps - this file's own change is web-only.
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

  // TEMPORARY DEVELOPMENT BYPASS - restore student pairing before final
  // deployment. Previously this branch rendered an inline "student analytics
  // view isn't built yet - pair your headset" card with a Pair headset
  // button. Pairing is now bypassed globally (see PreSessionFlowController's
  // own TEMPORARY DEVELOPMENT BYPASS in the Unity repo - every session is
  // already attributed to John Doe without ever pairing), so that card no
  // longer reflects anything real: the "student analytics view" it claimed
  // wasn't built is exactly /results, which already exists and needs no
  // pairing state to load - see src/app/results/page.tsx. A signed-in
  // student now goes straight there instead of dead-ending here.
  const profile = await getMyProfile();
  if (profile?.role === "student") {
    redirect("/results");
  }

  return (
    <div className="min-h-screen">
      <Suspense fallback={null}>
        <TopNav userEmail={userEmail} onSignOut={signOut} />
      </Suspense>
      <main className="mx-auto max-w-[1220px] px-6 pb-16 pt-8 sm:px-10">
        {children}
      </main>
    </div>
  );
}
