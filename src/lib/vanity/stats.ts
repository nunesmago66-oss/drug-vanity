/**
 * Verification history and dashboard statistics. Everything here is computed from
 * real data the app stored: the per-check log written by the scanner and the saved
 * results maps. Nothing is estimated or invented.
 */
import {
  AVAILABILITY_KEYS,
  AVAILABILITY_TO_KEY,
  KEY_TO_AVAILABILITY,
  availabilityFromHttp,
  emptyAvailabilityCounts,
  storedAvailabilityIsConsistent,
  isOfficialConfirmation,
  migrateStoredAvailability,
  type OfficialConfirmation,
  type Availability,
  type AvailabilityCounts,
  type AvailabilityKey,
} from "./availability";
import { classifyHttpStatus, isValidCode, type CheckResult } from "./check-rules";
import { availabilityOf, type ResultsMap, type StatusKey } from "./scanner";

export const STATS_KEY = "dvf:stats:v1";
/** Days of daily aggregates kept (older days stay counted in `total`). */
export const MAX_DAYS = 120;
/** Individual checks kept in the history list. */
export const MAX_RECENT = 200;
/** A response time above this is treated as corrupt rather than real. */
const MAX_LATENCY_MS = 120_000;

export type ScanMode = "a" | "m";
/** c = checks, e/n/x = by status, r = HTTP 429, ms = summed response time, mc = checks with a measured time. */
export interface DayStats {
  c: number;
  e: number;
  n: number;
  x: number;
  r: number;
  ms: number;
  mc: number;
}
/**
 * [code, status, http, checkedAt (s), mode, responseMs | null, availability?, confirmation?]
 * The availability key is stored only when the HTTP status does not imply it;
 * "F" (Liberada) only together with the official confirmation for that code.
 */
export type HistoryEntry = [
  string,
  StatusKey,
  number | null,
  number,
  ScanMode,
  number | null,
  AvailabilityKey?,
  OfficialConfirmation?,
];

/** Category (VERIFIED AVAILABILITY) of a history entry — one per entry. */
export function historyAvailability(e: HistoryEntry): Availability {
  const key = e[6];
  if (key === "F")
    return e[2] === 404 && isOfficialConfirmation(e[0], e[7])
      ? "CONFIRMED_FREE"
      : availabilityFromHttp(e[2]);
  return key && KEY_TO_AVAILABILITY[key] ? KEY_TO_AVAILABILITY[key] : availabilityFromHttp(e[2]);
}

export interface StatsLog {
  /** When the log started (s); 0 = not started yet. */
  since: number;
  /** Checks imported once from results saved before the log existed (no response time). */
  seeded: number;
  total: DayStats;
  days: Record<string, DayStats>;
  recent: HistoryEntry[];
}

export const emptyDay = (): DayStats => ({ c: 0, e: 0, n: 0, x: 0, r: 0, ms: 0, mc: 0 });
export const EMPTY_STATS: StatsLog = {
  since: 0,
  seeded: 0,
  total: emptyDay(),
  days: {},
  recent: [],
};

const pad = (n: number) => String(n).padStart(2, "0");
/** Local calendar day for a timestamp in milliseconds. */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addTo(day: DayStats, status: StatusKey, http: number | null, ms: number | null): DayStats {
  const next: DayStats = { ...day, c: day.c + 1 };
  next[status] += 1;
  if (http === 429) next.r += 1;
  if (ms !== null) {
    next.ms += ms;
    next.mc += 1;
  }
  return next;
}

function pruneDays(days: Record<string, DayStats>): Record<string, DayStats> {
  const keys = Object.keys(days).sort();
  if (keys.length <= MAX_DAYS) return days;
  const out: Record<string, DayStats> = {};
  for (const k of keys.slice(-MAX_DAYS)) out[k] = days[k] as DayStats;
  return out;
}

export interface CheckEvent {
  code: string;
  status: StatusKey;
  http: number | null;
  /** Milliseconds since epoch. */
  at: number;
  mode: ScanMode;
  responseMs: number | null;
  availability?: Availability;
  /** Required for "Liberada": official confirmation bound to `code`. */
  officialConfirmation?: OfficialConfirmation | null;
}

const STATUS_KEY = { exists: "e", not_found: "n", inconclusive: "x" } as const;

export function eventFromResult(
  r: CheckResult,
  mode: ScanMode,
  startedAt: number | null,
  now = Date.now(),
): CheckEvent {
  const t = Date.parse(r.checkedAt);
  const at = Number.isFinite(t) ? t : now;
  const elapsed = startedAt ? now - startedAt : null;
  return {
    code: r.code,
    status: STATUS_KEY[classifyHttpStatus(r.httpStatus)],
    http: r.httpStatus,
    at,
    mode,
    responseMs:
      elapsed !== null && elapsed >= 0 && elapsed <= MAX_LATENCY_MS ? Math.round(elapsed) : null,
    ...(r.availability ? { availability: r.availability } : {}),
    ...(r.officialConfirmation ? { officialConfirmation: r.officialConfirmation } : {}),
  };
}

export function recordCheck(stats: StatsLog, ev: CheckEvent): StatsLog {
  const key = dayKey(ev.at);
  const entry: HistoryEntry = [
    ev.code,
    ev.status,
    ev.http,
    Math.floor(ev.at / 1000),
    ev.mode,
    ev.responseMs,
  ];
  if (ev.availability && ev.availability !== availabilityFromHttp(ev.http)) {
    const key = AVAILABILITY_TO_KEY[ev.availability];
    if (storedAvailabilityIsConsistent(ev.http, key, ev.code, ev.officialConfirmation)) {
      entry.push(key);
      if (key === "F") entry.push(ev.officialConfirmation as OfficialConfirmation);
    }
  }
  return {
    since: stats.since || Math.floor(ev.at / 1000),
    seeded: stats.seeded,
    total: addTo(stats.total, ev.status, ev.http, ev.responseMs),
    days: pruneDays({
      ...stats.days,
      [key]: addTo(stats.days[key] ?? emptyDay(), ev.status, ev.http, ev.responseMs),
    }),
    recent: [entry, ...stats.recent].slice(0, MAX_RECENT),
  };
}

/**
 * Starts the log from results saved before it existed: each saved result is one
 * real check at its saved time (response time unknown).
 */
export function seedFromResults(
  results: ResultsMap,
  meaningResults: ResultsMap,
  now = Date.now(),
): StatsLog {
  const entries: Array<[string, ResultsMap[string], ScanMode]> = [
    ...Object.entries(results).map(
      ([c, r]) => [c, r, "a"] as [string, ResultsMap[string], ScanMode],
    ),
    ...Object.entries(meaningResults).map(
      ([c, r]) => [c, r, "m"] as [string, ResultsMap[string], ScanMode],
    ),
  ];
  entries.sort((a, b) => a[1][2] - b[1][2]);
  let stats: StatsLog = { ...EMPTY_STATS, since: Math.floor(now / 1000) };
  for (const [code, r, mode] of entries)
    stats = recordCheck(stats, {
      code,
      status: r[0],
      http: r[1],
      at: r[2] * 1000,
      mode,
      responseMs: null,
      availability: availabilityOf(r, code),
      officialConfirmation: r[5] ?? null,
    });
  return { ...stats, since: Math.floor(now / 1000), seeded: entries.length };
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const count = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && Number.isFinite(v);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function validDay(v: unknown): DayStats | null {
  if (!isObj(v)) return null;
  const keys = ["c", "e", "n", "x", "r", "ms", "mc"] as const;
  if (!keys.every((k) => count(v[k]))) return null;
  const d = Object.fromEntries(keys.map((k) => [k, v[k]])) as unknown as DayStats;
  if (d.e + d.n + d.x !== d.c || d.r > d.x || d.mc > d.c) return null;
  return d;
}

function validEntry(v: unknown): HistoryEntry | null {
  if (!Array.isArray(v) || v.length < 6 || v.length > 8) return null;
  const [code, s, http, ts, mode, ms, avail, proof] = v as unknown[];
  if (typeof code !== "string" || !isValidCode(code)) return null;
  if (s !== "e" && s !== "n" && s !== "x") return null;
  if (!(http === null || (count(http) && http >= 100 && http <= 599))) return null;
  if (STATUS_KEY[classifyHttpStatus(http)] !== s) return null;
  if (!count(ts) || (mode !== "a" && mode !== "m")) return null;
  if (!(ms === null || (count(ms) && ms <= MAX_LATENCY_MS))) return null;
  const entry: HistoryEntry = [code, s, http as number | null, ts, mode, ms as number | null];
  if (avail !== undefined) {
    // A key that does not match the HTTP evidence (e.g. "liberada" on a 429) is rejected.
    if (!AVAILABILITY_KEYS.includes(avail as AvailabilityKey)) return null;
    const kept = migrateStoredAvailability(code, http as number | null, avail, proof);
    if (kept) {
      entry.push(kept);
      if (kept === "F") entry.push(proof as OfficialConfirmation);
    } else if (avail !== "F") return null;
    // Legacy "F" without an official confirmation: safe migration keeps the
    // check (404 → NOT_IN_USE) instead of discarding it.
  }
  return entry;
}

/** Keeps every valid part of a saved log; returns null when the shape is unusable. */
export function validateStats(input: unknown): StatsLog | null {
  if (!isObj(input) || !count(input["since"]) || !count(input["seeded"])) return null;
  const total = validDay(input["total"]);
  if (!total) return null;
  const days: Record<string, DayStats> = {};
  if (isObj(input["days"]))
    for (const [k, v] of Object.entries(input["days"])) {
      const d = DAY_RE.test(k) ? validDay(v) : null;
      if (d) days[k] = d;
    }
  const recent = Array.isArray(input["recent"])
    ? input["recent"]
        .map(validEntry)
        .filter((e): e is HistoryEntry => e !== null)
        .slice(0, MAX_RECENT)
    : [];
  return { since: input["since"], seeded: input["seeded"], total, days: pruneDays(days), recent };
}

const maxDay = (a: DayStats, b: DayStats): DayStats => {
  // Take whichever side recorded more checks for that day, so restoring the same backup twice never double counts.
  return b.c > a.c ? b : a;
};

/** Merges a restored log into the current one without double counting the same checks. */
export function mergeStats(current: StatsLog, incoming: StatsLog): StatsLog {
  const days: Record<string, DayStats> = { ...current.days };
  for (const [k, d] of Object.entries(incoming.days)) days[k] = days[k] ? maxDay(days[k], d) : d;
  const seen = new Set<string>();
  const recent = [...current.recent, ...incoming.recent]
    .filter((e) => {
      const id = `${e[0]}:${e[3]}:${e[4]}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .sort((a, b) => b[3] - a[3])
    .slice(0, MAX_RECENT);
  const since =
    current.since && incoming.since
      ? Math.min(current.since, incoming.since)
      : current.since || incoming.since;
  return {
    since,
    seeded: Math.max(current.seeded, incoming.seeded),
    total: maxDay(current.total, incoming.total),
    days: pruneDays(days),
    recent,
  };
}

// ---------------------------------------------------------------- summaries

export interface CodeTotals {
  /** Unique codes with a saved result in either mode (latest result per code wins). */
  verified: number;
  exists: number;
  notFound: number;
  errors: number;
  byMode: { a: number; m: number };
  len2: number;
  len3: number;
  /** Independent category counters (latest result per code; one category each). */
  categories: AvailabilityCounts;
}

export function codeTotals(results: ResultsMap, meaningResults: ResultsMap): CodeTotals {
  const latest = new Map<string, ResultsMap[string]>();
  for (const map of [results, meaningResults])
    for (const [code, r] of Object.entries(map)) {
      const prev = latest.get(code);
      if (!prev || r[2] > prev[2]) latest.set(code, r);
    }
  const t: CodeTotals = {
    verified: latest.size,
    exists: 0,
    notFound: 0,
    errors: 0,
    byMode: { a: Object.keys(results).length, m: Object.keys(meaningResults).length },
    len2: 0,
    len3: 0,
    categories: emptyAvailabilityCounts(),
  };
  for (const [code, r] of latest) {
    t.categories[availabilityOf(r, code)]++;
    if (r[0] === "e") t.exists++;
    else if (r[0] === "n") t.notFound++;
    else t.errors++;
    if (code.length === 2) t.len2++;
    else if (code.length === 3) t.len3++;
  }
  return t;
}

/** Share of checks that got a valid answer (200 or 404); null when nothing was checked. */
export const successRate = (d: DayStats): number | null => (d.c ? ((d.e + d.n) / d.c) * 100 : null);
export const avgResponseMs = (d: DayStats): number | null =>
  d.mc ? Math.round(d.ms / d.mc) : null;

export interface DayPoint {
  key: string;
  label: string;
  checks: number;
  exists: number;
  notFound: number;
  errors: number;
  rateLimited: number;
  success: number | null;
  avgMs: number | null;
}

/** One point per calendar day for the last `n` days (days without checks are zero). */
export function lastDays(stats: StatsLog, n: number, now = Date.now()): DayPoint[] {
  const out: DayPoint[] = [];
  const base = new Date(now);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i, 12);
    const key = dayKey(d.getTime());
    const s = stats.days[key] ?? emptyDay();
    out.push({
      key,
      label: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`,
      checks: s.c,
      exists: s.e,
      notFound: s.n,
      errors: s.x,
      rateLimited: s.r,
      success: successRate(s),
      avgMs: avgResponseMs(s),
    });
  }
  return out;
}

/** Sum of the daily aggregates for the last `n` days (including today). */
export function sumDays(stats: StatsLog, n: number, now = Date.now()): DayStats {
  const keys = new Set(lastDays(stats, n, now).map((p) => p.key));
  const sum = emptyDay();
  for (const [k, d] of Object.entries(stats.days))
    if (keys.has(k)) for (const f of Object.keys(sum) as (keyof DayStats)[]) sum[f] += d[f];
  return sum;
}
