import { MIN_INTERVAL_MS } from "./check-rules";
import { LIMIT_WINDOW_MS, cooldownSeconds } from "./pacing";

/**
 * Server-side request guard for the Discord lookup.
 *
 * Scope: one Worker isolate (in-memory). Every visitor of this isolate shares
 * the same outbound address towards Discord, so the guard spaces requests of
 * all visitors, allows one request in flight per visitor, and — after any 429
 * — blocks everyone for Discord's wait plus a safety margin, progressively
 * longer when 429s repeat. A cross-isolate shared counter would need extra
 * storage; the browser queue remains the primary limiter.
 */
/** Spacing between any two visitors' requests (the browser floor minus network jitter). */
export const GLOBAL_MIN_GAP_MS = MIN_INTERVAL_MS - 100;
/** Spacing between one visitor's own requests (floor minus a larger jitter tolerance). */
export const CLIENT_MIN_GAP_MS = MIN_INTERVAL_MS - 200;
export const MAX_TRACKED_CLIENTS = 5000;

export type LimiterDecision =
  | { ok: true }
  | { ok: false; kind: "blocked"; waitSeconds: number }
  | { ok: false; kind: "client" | "global"; waitMs: number }
  | { ok: false; kind: "busy" };

export function createLimiter() {
  let blockedUntil = 0;
  let lastGlobal = 0;
  let limits: number[] = [];
  const lastByClient = new Map<string, number>();
  const inFlight = new Set<string>();

  function evict(now: number) {
    if (lastByClient.size <= MAX_TRACKED_CLIENTS) return;
    // Drop only entries whose gap already expired, so no client gets a free pass.
    for (const [k, t] of lastByClient) if (now - t >= CLIENT_MIN_GAP_MS) lastByClient.delete(k);
  }

  const api = {
    /** Reserve a slot. On success the caller MUST call release(clientKey). */
    acquire(clientKey: string, now = Date.now()): LimiterDecision {
      if (now < blockedUntil)
        return { ok: false, kind: "blocked", waitSeconds: Math.ceil((blockedUntil - now) / 1000) };
      if (inFlight.has(clientKey)) return { ok: false, kind: "busy" };
      const sinceClient = now - (lastByClient.get(clientKey) ?? 0);
      if (sinceClient < CLIENT_MIN_GAP_MS)
        return { ok: false, kind: "client", waitMs: CLIENT_MIN_GAP_MS - sinceClient };
      const sinceGlobal = now - lastGlobal;
      if (sinceGlobal < GLOBAL_MIN_GAP_MS)
        return { ok: false, kind: "global", waitMs: GLOBAL_MIN_GAP_MS - sinceGlobal };
      evict(now);
      lastByClient.set(clientKey, now);
      lastGlobal = now;
      inFlight.add(clientKey);
      return { ok: true };
    },
    release(clientKey: string) {
      inFlight.delete(clientKey);
    },
    /** Block every visitor until `untilMs`; never shortens an active block. */
    blockUntil(untilMs: number) {
      if (Number.isFinite(untilMs)) blockedUntil = Math.max(blockedUntil, untilMs);
    },
    /**
     * Records a 429 and blocks every visitor for Discord's wait + safety margin,
     * doubled for each other 429 in the last 10 minutes. Returns the block in seconds.
     */
    recordLimit(retryAfterSeconds: number | null, now = Date.now()): number {
      limits = [...limits.filter((t) => now - t < LIMIT_WINDOW_MS), now].slice(-20);
      const secs = cooldownSeconds(retryAfterSeconds, limits.length);
      api.blockUntil(now + secs * 1000);
      return secs;
    },
    blockedUntil: () => blockedUntil,
  };
  return api;
}
