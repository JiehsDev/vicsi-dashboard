// src/lib/studentAuth.ts

/** Supabase Auth requires an email or phone identity — there is no native
 *  "username + password" account type. Since the signup form deliberately
 *  never asks students for an email (see BUSINESS_RULES.md §2.2), we
 *  synthesize an internal-only email from the Student ID to give Supabase
 *  something to key the account on. This address is never sent, never
 *  shown to the user, and never treated as a real mailbox — it exists
 *  purely as an internal identity string.
 *
 *  Used by both the signup action (to create the account) and the login
 *  action (to resolve a typed Student ID back to the same identity). */
const STUDENT_EMAIL_DOMAIN = "students.traceboard.internal";

export function studentIdToEmail(studentId: string): string {
  return `${studentId.trim().toLowerCase()}@${STUDENT_EMAIL_DOMAIN}`;
}

/** True if the typed login identifier looks like a real email rather than
 *  a Student ID — used to decide whether to pass it through as-is
 *  (instructors) or translate it via studentIdToEmail() (students). */
export function looksLikeEmail(identifier: string): boolean {
  return identifier.includes("@");
}
