// src/app/(dashboard)/layout.tsx
import { Suspense } from "react";
import { redirect } from "next/navigation";
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

  // Proxy only checks "signed in", not role — students authenticate
  // through the same login. Keep them off the instructor roster.
  const profile = await getMyProfile();
  if (profile?.role === "student") {
    redirect("/student");
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
