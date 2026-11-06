import type {EnrolledStudent} from "./classes";
import type {ResultSummary} from "./results";

export function studentHistoryPath(classId: string, studentId: string) {
  return `/classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(studentId)}`;
}

/** Student-owned history, including attempts before enrollment. Never infer
 * headset activity from the absence of an uploaded record. */
export function buildClassOverview(students: EnrolledStudent[], sessions: ResultSummary[]) {
  const byStudent = new Map<string, ResultSummary[]>();
  for (const session of sessions) {
    if (session.isTestSession) continue;
    const attempts = byStudent.get(session.studentId) ?? [];
    attempts.push(session);
    byStudent.set(session.studentId, attempts);
  }
  return [...students].sort((a,b) => a.fullName.localeCompare(b.fullName) || a.studentId.localeCompare(b.studentId)).map(student => {
    const attempts = (byStudent.get(student.studentId) ?? []).sort((a,b) =>
      Date.parse(b.serverReceivedAtUtc) - Date.parse(a.serverReceivedAtUtc) || a.sessionId.localeCompare(b.sessionId));
    const latest = attempts[0] ?? null;
    return {...student, sessionCount: attempts.length, latest,
      status: !latest ? "No session received" : !latest.completedAtUtc ? "Incomplete" : "Completed"};
  });
}
