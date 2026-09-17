// src/app/(dashboard)/sessions/[sessionId]/page.tsx
//
// Legacy evidence-timeline page - superseded by /class-results/[sessionId]
// (which now shows the same ordered event timeline, sourced from the real
// session_events table). Kept as a redirect rather than deleted so an old
// bookmark still resolves - but there is no reliable id mapping from a
// legacy evidence_events session_id (an arbitrary string like "SES-231")
// to a real assessment_sessions.session_id (a Unity-issued GUID), so this
// can only redirect to the results list, not to the specific session.
import { redirect } from "next/navigation";

export default async function LegacySessionTimelineRedirect() {
  redirect("/class-results");
}
