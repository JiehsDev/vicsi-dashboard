// src/app/(dashboard)/layout.tsx
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { signOut } from "@/app/login/actions";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getMyProfile } from "@/lib/supabaseClient";
import {getInstructorClasses} from "@/lib/classes";
import {getAdminIdentity} from "@/lib/admin";

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

  // Students enter through Home under the separately protected /results layout.
  // Existing /results bookmarks still open their searchable session history.
  if(await getAdminIdentity())redirect('/admin');
  const profile = await getMyProfile();
  if (!profile) redirect("/login");
  if (profile?.role === "student") {
    redirect("/results/home");
  }

  const classes=await getInstructorClasses();
  return (
    <Suspense fallback={<p className="p-8">Loading workspace…</p>}>
      <AppShell role="instructor" name={profile?.fullName ?? userEmail ?? "Instructor"} classes={classes} onSignOut={signOut}>{children}</AppShell>
    </Suspense>
  );
}
