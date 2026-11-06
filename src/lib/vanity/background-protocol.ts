import { isValidCode, classifyHttpStatus } from "./check-rules";
import { initialPace, validatePace, type PaceState } from "./pacing";
import { emptyDiag, validateDiag, type RateLimitDiag } from "./rate-limit-manager";
import {
  DEFAULT_SCANNER_CONFIG,
  sanitizeCompact,
  type ResultsMap,
  type ScannerConfig,
} from "./scanner";
import { EMPTY_STATS, validateStats, type StatsLog } from "./stats";

export type BackgroundMode = "a" | "m";
export interface BackgroundSnapshot {
  v: 1;
  revision: number;
  mode: BackgroundMode;
  status: "idle" | "running" | "stopped" | "done" | "rate_limited" | "errors";
  codes: string[];
  config: ScannerConfig;
  results: ResultsMap;
  meaningResults: ResultsMap;
  stats: StatsLog;
  pace: PaceState;
  cooldownUntil: number;
  lastCheckAt: number;
  current: string | null;
  nextAt: number;
  recent: import("./check-rules").CheckResult[];
  error: string | null;
  /** Shared rate-limit diagnostics (requests, 429s, last limit, recoveries). */
  diag?: RateLimitDiag;
}
export const emptyBackground = (): BackgroundSnapshot => ({
  v: 1,
  revision: 0,
  mode: "a",
  status: "idle",
  codes: [],
  config: { ...DEFAULT_SCANNER_CONFIG },
  results: {},
  meaningResults: {},
  stats: structuredClone(EMPTY_STATS),
  pace: initialPace(),
  cooldownUntil: 0,
  lastCheckAt: 0,
  current: null,
  nextAt: 0,
  recent: [],
  error: null,
  diag: emptyDiag(0),
});
export function validateResults(raw: unknown): ResultsMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("Resultados inválidos");
  const out: ResultsMap = {};
  for (const [code, r] of Object.entries(raw)) {
    if (
      !isValidCode(code) ||
      !Array.isArray(r) ||
      r.length < 3 ||
      r.length > 6 ||
      !(r[1] === null || (Number.isInteger(r[1]) && r[1] >= 100 && r[1] <= 599)) ||
      !Number.isFinite(r[2]) ||
      r[2] < 0 ||
      (r.length >= 4 && !(r[3] === null || ["d", "c", "t", "f", "a"].includes(r[3])))
    )
      throw new Error("Resultado corrompido");
    const status = classifyHttpStatus(r[1]);
    const expected = status === "exists" ? "e" : status === "not_found" ? "n" : "x";
    if (r[0] !== expected) throw new Error("Classificação inválida");
    // Safe migration: an availability key without supporting evidence (e.g. a
    // legacy "F" with no official confirmation for this code) is dropped.
    const rec = sanitizeCompact(code, r);
    if (!rec) throw new Error("Resultado corrompido");
    out[code] = rec;
  }
  return out;
}
export function validateBackground(raw: unknown): BackgroundSnapshot {
  if (!raw || typeof raw !== "object") throw new Error("Estado inválido");
  const r = raw as BackgroundSnapshot;
  if (
    r.v !== 1 ||
    !["a", "m"].includes(r.mode) ||
    !["idle", "running", "stopped", "done", "rate_limited", "errors"].includes(r.status) ||
    !Array.isArray(r.codes) ||
    r.codes.length > 50_000 ||
    !r.codes.every((c) => typeof c === "string" && isValidCode(c)) ||
    ![r.revision, r.cooldownUntil, r.lastCheckAt].every((n) => Number.isFinite(n) && n >= 0) ||
    !r.config ||
    !Number.isFinite(r.config.intervalMs) ||
    r.config.intervalMs < 0
  )
    throw new Error("Estado corrompido");
  const pace = validatePace(r.pace);
  const stats = validateStats(r.stats);
  if (!pace || !stats) throw new Error("Ritmo ou histórico corrompido");
  return {
    ...emptyBackground(),
    ...r,
    results: validateResults(r.results),
    meaningResults: validateResults(r.meaningResults),
    pace,
    stats,
    diag: validateDiag(r.diag),
    codes: [...new Set(r.codes)],
    current: null,
    nextAt: 0,
    recent: [],
  };
}
export function mergeResults(a: ResultsMap, b: ResultsMap): ResultsMap {
  const out = { ...a };
  for (const [code, r] of Object.entries(b))
    if (!out[code] || r[2] >= (out[code]?.[2] ?? 0)) out[code] = r;
  return out;
}
