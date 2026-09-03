// src/lib/timeoutFetch.ts

/** A DNS/network failure to an unreachable Supabase host can otherwise hang
 *  for ~25-30s (OS-level resolver retries) before `fetch` rejects. Capping
 *  each request keeps that failure fast so pages fall back to mock data
 *  quickly instead of appearing to hang. */
const TIMEOUT_MS = 5000;

export function timeoutFetch(input: RequestInfo | URL, init?: RequestInit) {
  return fetch(input, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
}
