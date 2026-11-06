/**
 * Adaptive request pacing, 429 cooldowns and scan-duration estimates.
 *
 * Discord's public invite lookup sends no X-RateLimit-* headers on 200/404, so
 * the only real signal of the allowed pace is a 429. The pacer therefore uses
 * AIMD: it speeds up slowly after streaks of clean answers and slows down
 * sharply after each 429, never going below PACE_FLOOR_MS and never sending
 * two requests at once. Pure functions only; tested beside this file.
 */

/** Fastest pace the app ever uses (one request at a time). */
export const PACE_FLOOR_MS = 1500;
/** Pace used when nothing is known yet. */
export const PACE_START_MS = 3000;
/** Slowest automatic pace. */
export const PACE_MAX_MS = 30_000;
/** Clean answers in a row before the pacer speeds up one step. */
export const SPEED_UP_AFTER = 5;
export const SPEED_UP_FACTOR = 0.85;

export type LimitKind = "global" | "route" | "edge" | "app" | "unknown";
/** How much slower the pacer gets after a 429 of each kind. */
export const SLOW_DOWN: Record<LimitKind, number> = {
  global: 1.5,
  route: 1.25,
  edge: 3,
  app: 1.25,
  unknown: 1.5,
};

/** 429s inside this window make the next cooldown progressively longer. */
export const LIMIT_WINDOW_MS = 10 * 60_000;
export const MAX_PROGRESSIVE_STEPS = 4;
export const MAX_PROGRESSIVE_COOLDOWN_SECONDS = 15 * 60;
/** Wait used when a 429 carries no usable Retry-After. */
export const DEFAULT_429_WAIT_SECONDS = 60;
/** Safety margin added on top of every wait Discord asks for. */
export const SAFETY_RATIO = 0.2;
export const SAFETY_EXTRA_SECONDS = 1;
/** Largest wait we accept from a single signal; longer values are malformed. */
export const MAX_SERVER_WAIT_SECONDS = 24 * 60 * 60;

/** Temporary failures (timeout, connection, 5xx) are retried this many times. */
export const MAX_TEMP_RETRIES = 2;
/** Server "busy with other visitors" answers are retried this many times. */
export const MAX_THROTTLE_RETRIES = 8;
export const THROTTLE_WAIT_MS = 500;

export interface PaceState {
  v: 1;
  intervalMs: number;
  streak: number;
  /** Epoch ms of recent 429s (pruned to LIMIT_WINDOW_MS). */
  limits: number[];
  /** Why the last run stopped on a 429, kept across reloads. */
  note?: { at: number; text: string } | null;
}

export const initialPace = (): PaceState => ({
  v: 1,
  intervalMs: PACE_START_MS,
  streak: 0,
  limits: [],
  note: null,
});

const clampPace = (ms: number) =>
  Math.round(
    Math.min(PACE_MAX_MS, Math.max(PACE_FLOOR_MS, Number.isFinite(ms) ? ms : PACE_START_MS)),
  );

export const finiteWait = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= MAX_SERVER_WAIT_SECONDS ? v : null;

export function paceAfterSuccess(p: PaceState): PaceState {
  const streak = p.streak + 1;
  if (streak < SPEED_UP_AFTER) return { ...p, streak };
  return { ...p, streak: 0, intervalMs: clampPace(p.intervalMs * SPEED_UP_FACTOR) };
}

export const paceAfterError = (p: PaceState): PaceState => ({ ...p, streak: 0 });

export function paceAfterLimit(p: PaceState, kind: LimitKind, now = Date.now()): PaceState {
  const limits = [...p.limits.filter((t) => now - t < LIMIT_WINDOW_MS && t <= now), now].slice(-20);
  return { ...p, streak: 0, limits, intervalMs: clampPace(p.intervalMs * SLOW_DOWN[kind]) };
}

export const recentLimitCount = (p: PaceState, now = Date.now()) =>
  p.limits.filter((t) => now - t < LIMIT_WINDOW_MS && t <= now).length;

/** Delay between requests: the adaptive pace, or the user's fixed choice if slower. */
export const effectiveInterval = (p: PaceState, fixedMs: number) =>
  Math.max(fixedMs > 0 ? fixedMs : 0, clampPace(p.intervalMs));

/**
 * Cooldown after a 429: Discord's wait plus a safety margin, doubled for each
 * other 429 in the last LIMIT_WINDOW_MS (capped), 60 s when no wait was given.
 * `padded` = the value already includes the margin (server-side block).
 */
export function cooldownSeconds(
  retryAfterSeconds: number | null | undefined,
  recentLimits = 1,
  padded = false,
): number {
  const r = finiteWait(retryAfterSeconds) ?? DEFAULT_429_WAIT_SECONDS;
  const base = padded ? r : r * (1 + SAFETY_RATIO) + SAFETY_EXTRA_SECONDS;
  const steps = Math.min(MAX_PROGRESSIVE_STEPS, Math.max(0, Math.floor(recentLimits) - 1));
  let s = base * 2 ** steps;
  if (steps > 0) s = Math.min(s, Math.max(base, MAX_PROGRESSIVE_COOLDOWN_SECONDS));
  return Math.ceil(Math.max(s, PACE_FLOOR_MS / 1000));
}

/** Progressive wait before retrying a temporary failure (2 s, 4 s, 8 s … max 30 s). */
export const temporaryBackoffMs = (attempt: number) =>
  Math.min(30_000, 2000 * 2 ** Math.max(0, attempt - 1));

/** Average start-to-start time of the last `window` requests; null with fewer than 2. */
export function averageCycleMs(starts: number[], window = 30): number | null {
  const s = starts.slice(-window);
  if (s.length < 2) return null;
  const span = (s[s.length - 1] as number) - (s[0] as number);
  return span > 0 ? span / (s.length - 1) : null;
}

export function average(values: number[], window = 30): number | null {
  const v = values.slice(-window).filter((x) => Number.isFinite(x) && x >= 0);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export interface EstimateInput {
  pending: number;
  /** Measured average start-to-start time; null when not enough data. */
  cycleMs: number | null;
  /** Used when nothing was measured yet (pace + typical response time). */
  fallbackCycleMs: number;
  /** Checks done in this session and total 429 wait observed among them. */
  sessionChecks: number;
  sessionLimitWaitMs: number;
  batch: number;
}

export interface Estimate {
  ms: number;
  measured: boolean;
  perMinute: number;
  /** Manual pauses (batch) still ahead; not included in `ms`. */
  batchPauses: number;
  /** Part of `ms` that comes from expected rate-limit waits. */
  limitMs: number;
}

/** Remaining time from the real recent pace, plus the observed share of 429 waits. */
export function estimateDuration(i: EstimateInput): Estimate {
  const pending = Math.max(0, Math.floor(i.pending));
  const cycle = i.cycleMs && i.cycleMs > 0 ? i.cycleMs : Math.max(PACE_FLOOR_MS, i.fallbackCycleMs);
  // Only extrapolate rate-limit waits from a meaningful sample.
  const limitPerCheck =
    i.sessionChecks >= 20 && i.sessionLimitWaitMs > 0 ? i.sessionLimitWaitMs / i.sessionChecks : 0;
  const limitMs = Math.round(pending * limitPerCheck);
  return {
    ms: Math.round(pending * cycle) + limitMs,
    measured: !!i.cycleMs,
    perMinute: 60_000 / cycle,
    batchPauses: i.batch > 0 && pending > 0 ? Math.ceil(pending / i.batch) - 1 : 0,
    limitMs,
  };
}

/* ---------- device storage (not part of backups, like cooldown timing) ---------- */

export const PACE_KEY = "dvf:pace:v1";

export function validatePace(raw: unknown, now = Date.now()): PaceState | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r["v"] !== 1 || typeof r["intervalMs"] !== "number" || !Number.isFinite(r["intervalMs"]))
    return null;
  const limits = Array.isArray(r["limits"])
    ? r["limits"]
        .filter(
          (t): t is number =>
            typeof t === "number" &&
            Number.isFinite(t) &&
            t >= 0 &&
            t <= now + 60_000 &&
            now - t < LIMIT_WINDOW_MS,
        )
        .slice(-20)
    : [];
  const n = r["note"] as { at?: unknown; text?: unknown } | null | undefined;
  const note =
    n &&
    typeof n.at === "number" &&
    Number.isFinite(n.at) &&
    n.at >= 0 &&
    n.at <= now + 60_000 &&
    typeof n.text === "string"
      ? { at: n.at, text: n.text.slice(0, 600) }
      : null;
  const streak =
    typeof r["streak"] === "number" && Number.isFinite(r["streak"]) && r["streak"] >= 0
      ? Math.min(1_000_000, Math.floor(r["streak"]))
      : 0;
  // No 429 in the last LIMIT_WINDOW_MS: an old slowdown no longer reflects Discord's
  // current state, so start again from the normal pace instead of staying slow for hours.
  const interval = clampPace(r["intervalMs"]);
  return {
    v: 1,
    intervalMs: limits.length === 0 ? Math.min(interval, PACE_START_MS) : interval,
    streak,
    limits,
    note,
  };
}

export function loadPace(store: Pick<Storage, "getItem"> | null | undefined): PaceState {
  try {
    const raw = store?.getItem(PACE_KEY);
    return (raw && validatePace(JSON.parse(raw))) || initialPace();
  } catch {
    return initialPace();
  }
}

export function savePace(store: Pick<Storage, "setItem"> | null | undefined, p: PaceState) {
  try {
    store?.setItem(PACE_KEY, JSON.stringify(p));
  } catch {
    /* pace is an optimisation; failing to save it never blocks a scan */
  }
}
