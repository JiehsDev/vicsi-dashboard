import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { CookieOptions } from "@supabase/ssr";

export const DASHBOARD_SESSION_COOKIE = "vicsi-dashboard-session";
export const DASHBOARD_IDLE_MS = 30 * 60 * 1000;
export const DASHBOARD_MAX_MS = 8 * 60 * 60 * 1000;

export type DashboardSession = { userId: string; startedAt: number; activeAt: number };

function signature(payload: string): string {
  // Domain separation keeps this cookie independent of other uses of the key.
  const secret = process.env.DASHBOARD_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Missing dashboard session signing secret.");
  return createHmac("sha256", secret).update(`vicsi-dashboard-session-v1:${payload}`).digest("base64url");
}

export function encodeDashboardSession(session: DashboardSession): string {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function readDashboardSession(value: string | undefined, now = Date.now()): DashboardSession | null {
  if (!value || value.length > 2048) return null;
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const [payload, supplied] = parts;
  const expected = Buffer.from(signature(payload));
  const actual = Buffer.from(supplied);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString()) as DashboardSession;
    if (!session || typeof session.userId !== "string" || !session.userId ||
        !Number.isSafeInteger(session.startedAt) || !Number.isSafeInteger(session.activeAt) ||
        session.startedAt < 0 || session.startedAt > session.activeAt || session.activeAt > now ||
        now - session.activeAt >= DASHBOARD_IDLE_MS || now - session.startedAt >= DASHBOARD_MAX_MS) return null;
    return session;
  } catch {
    return null;
  }
}

export function dashboardSessionExpiresAt(session: DashboardSession): number {
  return Math.min(session.activeAt + DASHBOARD_IDLE_MS, session.startedAt + DASHBOARD_MAX_MS);
}

export function isSupabaseAuthCookie(name: string): boolean {
  return /^sb-.+-auth-token(?:\.\d+)?$/.test(name);
}

// Strip the SSR package's 400-day persistence, including on token refresh.
// Preserve Max-Age=0/expiry on deletions so logout still removes all chunks.
export function dashboardCookieOptions(options: CookieOptions = {}): CookieOptions {
  if (options.maxAge === 0) return { ...options, path: "/" };
  const sessionOptions = { ...options, path: "/", sameSite: "lax" as const,
    httpOnly: true, secure: process.env.NODE_ENV === "production" };
  delete sessionOptions.maxAge;
  delete sessionOptions.expires;
  return sessionOptions;
}
