// src/app/student/layout.tsx
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/login/actions";
import { getMyProfile } from "@/lib/supabaseClient";

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Proxy only checks "signed in", not role. An instructor (or an account
  // with no profile row at all) has no business on the student dashboard.
  const profile = await getMyProfile();
  if (profile?.role !== "student") {
    redirect("/");
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-[1220px] items-center justify-between gap-6 px-6 py-4 sm:px-10">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-[12px] font-bold text-white">
              VR
            </div>
            <div className="text-[15px] font-extrabold tracking-tight text-ink">
              TRACEBOARD
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="text-[12.5px] font-medium text-ink">
                {profile.fullName}
              </div>
              <div className="text-[11px] text-ink-muted">
                {profile.studentId}
                {profile.section ? ` · Section ${profile.section}` : ""}
              </div>
            </div>
            <form action={signOut}>
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
      </header>

      <div className="mx-auto max-w-[1220px] px-6 pb-16 pt-8 sm:px-10">
        {children}
      </div>
    </div>
  );
}
