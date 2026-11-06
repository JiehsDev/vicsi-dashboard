import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getMyProfile } from "@/lib/supabaseClient";
import { signOut } from "@/app/login/actions";
import {getAdminIdentity} from "@/lib/admin";
export default async function ResultsLayout({ children }: { children: React.ReactNode }) {
  if(await getAdminIdentity())redirect('/admin');
  const profile = await getMyProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "student") redirect("/class-results");
  return <Suspense fallback={<p className="p-8">Loading learning record…</p>}><AppShell role="student" name={profile?.fullName ?? "Student"} onSignOut={signOut}>{children}</AppShell></Suspense>;
}
