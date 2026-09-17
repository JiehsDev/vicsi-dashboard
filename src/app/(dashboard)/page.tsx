// src/app/(dashboard)/page.tsx
//
// Legacy "Class Overview" - superseded by /class-results (the verified
// assessment pipeline). Kept as a redirect, not deleted, so an old bookmark
// or link still lands somewhere useful instead of 404ing. The legacy
// student_session_summary-backed table this page used to render is gone
// from normal runtime; see src/lib/supabaseClient.ts's own note on why
// (no unique data, a looser un-class-scoped RLS model, no timestamp
// columns at all - strictly less than assessment_sessions).
//
// `q` is carried over as-is: /class-results reads the same param as a
// student name/ID filter (see class-results/page.tsx), so a bookmarked
// search still narrows to the same student, just through the real pipeline.
import { redirect } from "next/navigation";

export default async function LegacyOverviewRedirect({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  redirect(`/class-results${q ? `?q=${encodeURIComponent(q)}` : ""}`);
}
