"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {isPublicDashboardPath} from '@/lib/dashboardRefresh';

/** User activity renews the lease; status polls, focus and hidden tabs do not. */
export function DashboardSessionGuard({initialSession}:{initialSession?:{startedAt:number;expiresAt:number}|null}) {
  const pathname = usePathname();
  const publicRoute=isPublicDashboardPath(pathname);
  const sessionStart=initialSession?.startedAt??0;
  const initialDeadline=initialSession?.expiresAt??0;
  useEffect(() => {
    if (publicRoute) return;
    let stopped = false;
    let busy = false;
    let lastActivity = 0;
    let lastRenewal = Date.now();
    let nextStatus = 0;
    // A trusted server deadline bounds cached data even if the first status
    // request is offline. Navigation must not reset activity/renewal clocks.
    let expiresAt = initialDeadline;
    const controller = new AbortController();

    async function check() {
      if (stopped || busy) return;
      const now = Date.now();
      // Check the old deadline before allowing any activity to renew it.
      // Another active tab may already have extended the server lease.
      const renew = now < expiresAt && now - lastActivity < 60_000 && !document.hidden && now - lastRenewal >= 60_000;
      if (!renew && now < nextStatus && now < expiresAt) return;
      busy = true;
      try {
        const response = await fetch("/api/auth/session", {
          method: renew ? "POST" : "GET", cache: "no-store", credentials: "same-origin",
          signal: controller.signal,
        });
        if (stopped) return;
        if (response.status === 401) {
          window.dispatchEvent(new Event('vicsi-dashboard-auth-expired'));
          window.location.replace("/login?expired=1");
          return;
        }
        if (!response.ok) throw new Error("Session check unavailable");
        const status = await response.json();
        if (!Number.isFinite(status.expiresAt)) throw new Error("Invalid session deadline");
        expiresAt = status.expiresAt;
        nextStatus = Date.now() + 60_000;
        if (renew) {
          lastRenewal = Date.now();
          lastActivity = 0;
        }
      } catch {
        // A network failure cannot extend the server deadline.
        nextStatus = Date.now() + 15_000;
        if (!stopped && Date.now() >= expiresAt) {
          window.dispatchEvent(new Event('vicsi-dashboard-auth-expired'));
          window.location.replace("/login?expired=1");
        }
      } finally {
        busy = false;
      }
    }

    function activity(event: Event) {
      if (!event.isTrusted || document.hidden) return;
      lastActivity = Date.now();
      void check();
    }
    function visible() {
      if (!document.hidden) {
        nextStatus = 0;
        void check();
      }
    }
    const events = ["pointerdown", "pointermove", "keydown", "scroll", "touchstart"];
    events.forEach(name => window.addEventListener(name, activity, { passive: true }));
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("pageshow", visible);
    const interval = window.setInterval(() => { void check(); }, 15_000);
    void check();
    return () => {
      stopped = true;
      controller.abort();
      window.clearInterval(interval);
      events.forEach(name => window.removeEventListener(name, activity));
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("pageshow", visible);
    };
  }, [publicRoute,sessionStart,initialDeadline]);
  return null;
}
