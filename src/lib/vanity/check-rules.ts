/** Client-safe rules shared by the server check and the browser scanner. */
import {
  DEFAULT_429_WAIT_SECONDS,
  MAX_SERVER_WAIT_SECONDS,
  MAX_TEMP_RETRIES,
  MAX_THROTTLE_RETRIES,
  PACE_FLOOR_MS,
  THROTTLE_WAIT_MS,
  cooldownSeconds,
  effectiveInterval,
  finiteWait,
  initialPace,
  paceAfterError,
  paceAfterLimit,
  paceAfterSuccess,
  temporaryBackoffMs,
  type LimitKind,
  type PaceState,
} from "./pacing";
import { classifyAvailability, type Availability, type OfficialConfirmation } from "./availability";
import { inlineLimitWaitMs, isSuspectedEdgeBlock } from "./rate-limit-manager";

export { DEFAULT_429_WAIT_SECONDS, MAX_SERVER_WAIT_SECONDS };

/** Hard floor between two consecutive requests (adaptive pace never goes faster). */
export const MIN_INTERVAL_MS = PACE_FLOOR_MS;
/** 0 = automatic pace that adapts to Discord's real answers; others are fixed (slower) choices. */
export const AUTO_INTERVAL = 0;
export const INTERVAL_OPTIONS_MS = [AUTO_INTERVAL, 2000, 5000, 10000, 20000, 30000] as const;
/** Scanner auto-pauses after this many checks; the user must tap "Retomar". */
export const BATCH_OPTIONS = [50, 100, 250] as const;
/** Consecutive errors (non-429) that pause the scanner. */
export const MAX_CONSECUTIVE_ERRORS = 3;
export const REQUEST_TIMEOUT_MS = 8000;
/** Browser-side deadline for one check (server timeout + margin), so the queue never hangs. */
export const CLIENT_TIMEOUT_MS = REQUEST_TIMEOUT_MS + 7000;

export type CheckStatus = "exists" | "not_found" | "inconclusive";

export const STATUS_LABEL: Record<CheckStatus, string> = {
  exists: "Convite existente",
  not_found: "Não encontrado — disponibilidade não confirmada",
  inconclusive: "Erro/limite de taxa",
};

export interface CheckResult {
  code: string;
  status: CheckStatus;
  httpStatus: number | null;
  retryAfterSeconds: number | null;
  reason: string;
  checkedAt: string;
  /**
   * true = a request was actually sent to Discord; false = the app answered by
   * itself (preventive block / server throttle) without contacting Discord;
   * null/undefined = unknown (e.g. the check function did not reply).
   */
  discordQueried?: boolean | null;
  /**
   * Which layer answered a 429, from response evidence: "discord_api" (JSON
   * with retry_after / X-RateLimit-* headers) or "cloudflare_edge" (HTML or
   * error 1015 page from the Cloudflare protection in front of discord.com).
   */
  limitLayer?: LimitLayer | null;
  /** X-RateLimit-Scope ("user" | "global" | "shared") when Discord sent it. */
  limitScope?: string | null;
  /** Discord's "global" flag on a 429 (header or JSON body). */
  limitGlobal?: boolean | null;
  /**
   * Seconds Discord asked us to wait before the NEXT request even though this
   * one succeeded (X-RateLimit-Remaining: 0 + X-RateLimit-Reset-After).
   */
  nextAllowedInSeconds?: number | null;
  /** Kind of failure when no valid 200/404 was obtained. */
  errorKind?: ErrorKind | null;
  /**
   * Seconds the site's server blocks every visitor after this 429 (Discord's
   * wait + safety margin + progressive backoff). The client never resumes earlier.
   */
  blockedForSeconds?: number | null;
  /** VERIFIED AVAILABILITY state derived from evidence only (see availability.ts). */
  availability?: Availability;
  /** `code` of a Discord JSON error body (e.g. 10006 Unknown Invite). */
  discordErrorCode?: number | null;
  /** `expires_at` of the invite when Discord returned one. */
  expiresAt?: string | null;
  /**
   * HTTP 200 body evidence: true = real invite object for this code,
   * false/null = invalid or unreadable body (never ACTIVE).
   */
  inviteBodyValid?: boolean | null;
  /** Official confirmation bound to this code; the only way to "Liberada". */
  officialConfirmation?: OfficialConfirmation | null;
  /** What really happened on the wire for this attempt (no tokens, no user data). */
  trace?: RequestTrace | null;
  /** Raw headers of a 429/block answer, so its real origin can be proven later. */
  limitHeaders?: LimitHeaders | null;
}

/**
 * Raw evidence of a 429 / block answer as received by the site's server
 * (strings exactly as sent, truncated; no cookies, no IPs). `isolateSent1s` /
 * `isolateSent10s` = requests THIS server instance sent to Discord in the last
 * 1 s / 10 s: a "global" 429 while it sent ~1 request/s cannot come from this
 * app's own traffic (Discord's global limit is far higher), so it proves the
 * limit was consumed by other traffic on the same outbound address.
 */
export interface LimitHeaders {
  status: number;
  contentType: string | null;
  retryAfter: string | null;
  bodyRetryAfter: number | null;
  bodyGlobal: boolean | null;
  scope: string | null;
  global: string | null;
  bucket: string | null;
  server: string | null;
  cfRay: string | null;
  cfMitigated: string | null;
  html: boolean;
  isolateSent1s: number | null;
  isolateSent10s: number | null;
}

export function sanitizeLimitHeaders(raw: unknown): LimitHeaders | null {
  if (!raw || typeof raw !== "object") return null;
  const h = raw as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
  const status = n(h["status"]);
  if (status == null) return null;
  return {
    status: Math.round(status),
    contentType: str(h["contentType"], 80),
    retryAfter: str(h["retryAfter"], 40),
    bodyRetryAfter: n(h["bodyRetryAfter"]),
    bodyGlobal: typeof h["bodyGlobal"] === "boolean" ? h["bodyGlobal"] : null,
    scope: str(h["scope"], 20),
    global: str(h["global"], 10),
    bucket: str(h["bucket"], 80),
    server: str(h["server"], 40),
    cfRay: str(h["cfRay"], 60),
    cfMitigated: str(h["cfMitigated"], 40),
    html: h["html"] === true,
    isolateSent1s: n(h["isolateSent1s"]),
    isolateSent10s: n(h["isolateSent10s"]),
  };
}

/**
 * Wire-level record of one attempt, so a failure is never just "no connection":
 * correlation id, exact URL, calling layer, duration and the ORIGINAL error.
 * `probe` is the browser's follow-up check after a failed fetch:
 * "reachable_unreadable" = discord.com answered but the browser refused to let
 * the page read it (CORS: Cloudflare challenge/block page, or an extension);
 * "unreachable" = no answer at all (DNS, TLS, firewall, content blocker);
 * "offline" = the device reports no network.
 */
export interface RequestTrace {
  id: string;
  url: string;
  at: string;
  layer: "browser" | "background" | "server";
  durationMs: number;
  errorName: string | null;
  errorMessage: string | null;
  probe: "reachable_unreadable" | "unreachable" | "offline" | null;
}

const TRACE_LAYERS: readonly string[] = ["browser", "background", "server"];
const TRACE_PROBES: readonly string[] = ["reachable_unreadable", "unreachable", "offline"];
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : null);

export function sanitizeTrace(raw: unknown): RequestTrace | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  const url = str(t["url"], 200);
  const id = str(t["id"], 40);
  if (!url || !id || !(url.startsWith("https://discord.com/") || url.startsWith("/api/public/")))
    return null;
  const d = t["durationMs"];
  return {
    id,
    url,
    at: str(t["at"], 40) ?? "",
    layer:
      typeof t["layer"] === "string" && TRACE_LAYERS.includes(t["layer"])
        ? (t["layer"] as RequestTrace["layer"])
        : "browser",
    durationMs: typeof d === "number" && Number.isFinite(d) && d >= 0 ? Math.round(d) : 0,
    errorName: str(t["errorName"], 60),
    errorMessage: str(t["errorMessage"], 300),
    probe:
      typeof t["probe"] === "string" && TRACE_PROBES.includes(t["probe"])
        ? (t["probe"] as RequestTrace["probe"])
        : null,
  };
}

export type LimitLayer = "discord_api" | "cloudflare_edge";
export type ErrorKind =
  | "rate_limit"
  | "server_error"
  | "unexpected"
  | "timeout"
  | "network"
  | "app_block"
  | "app_throttle"
  | "invalid_reply"
  /** discord.com answered but the browser could not read it (CORS-less block page). */
  | "cors_blocked"
  /** HTML challenge/block page from Discord's Cloudflare on a non-429 status. */
  | "edge_challenge"
  /** The app's own check function threw before any request result existed. */
  | "app_error";
const LIMIT_LAYERS: readonly string[] = ["discord_api", "cloudflare_edge"];
const ERROR_KINDS: readonly string[] = [
  "rate_limit",
  "server_error",
  "unexpected",
  "timeout",
  "network",
  "app_block",
  "app_throttle",
  "invalid_reply",
  "cors_blocked",
  "edge_challenge",
  "app_error",
];

/** Where a rate-limit stop came from, so a preventive block is never shown as a Discord 429. */
export type RateLimitSource =
  | "discord"
  | "cloudflare_edge"
  | "app_block"
  | "unknown"
  | "suspected_edge"
  /** discord.com answered with a response the browser may not read (no CORS). */
  | "blocked_response";

export function rateLimitSourceOf(
  r: Pick<CheckResult, "httpStatus" | "discordQueried"> & { limitLayer?: LimitLayer | null },
): RateLimitSource | null {
  if (r.httpStatus !== 429) return null;
  if (r.discordQueried === true)
    return r.limitLayer === "cloudflare_edge" ? "cloudflare_edge" : "discord";
  if (r.discordQueried === false) return "app_block";
  return "unknown";
}

/**
 * What kind of failure a result is, so a temporary block is never treated as a
 * definitive answer: "rate_limit" (429 or the app's own preventive block —
 * the code stays pending), "temporary" (timeout, connection, 5xx, 403/408,
 * invalid reply — worth retrying), "permanent" (other HTTP codes), null for 200/404.
 */
export type ErrorClass = "rate_limit" | "temporary" | "permanent";
export function errorClassOf(
  r: Pick<CheckResult, "httpStatus" | "status" | "errorKind" | "discordQueried">,
): ErrorClass | null {
  if (r.status !== "inconclusive") return null;
  if (r.httpStatus === 429 || r.errorKind === "app_block" || r.errorKind === "app_throttle")
    return "rate_limit";
  if (r.discordQueried === false) return "rate_limit";
  if (r.httpStatus === null) return "temporary";
  if (r.httpStatus >= 500 || r.httpStatus === 403 || r.httpStatus === 408) return "temporary";
  return "permanent";
}

/** Which limit a 429 hit, from response evidence (drives how much the pace slows down). */
export function limitKindOf(
  r: Pick<CheckResult, "discordQueried" | "limitLayer" | "limitGlobal" | "limitScope">,
): LimitKind {
  if (r.discordQueried === false) return "app";
  if (r.limitLayer === "cloudflare_edge") return "edge";
  if (r.limitGlobal === true || r.limitScope === "global") return "global";
  if (r.limitScope === "user" || r.limitScope === "shared") return "route";
  return "unknown";
}

/** Vanity codes: lowercase letters, digits and hyphen, 2–3 characters here. */
const CODE_RE = /^[a-z0-9-]{2,3}$/;

export function normalizeCode(raw: string): string {
  return raw
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?(discord\.gg\/|discord\.com\/invite\/)/i, "")
    .toLowerCase();
}

export function isValidCode(code: string): boolean {
  return CODE_RE.test(code) && !code.startsWith("-") && !code.endsWith("-");
}

/**
 * 200 → exists, 404 → not found (never "available"), everything else —
 * 429, 5xx, other codes, timeout, connection failure — → error/rate limit,
 * so a communication failure is never shown as a valid result.
 */
export function classifyHttpStatus(httpStatus: number | null): CheckStatus {
  if (httpStatus === 200) return "exists";
  if (httpStatus === 404) return "not_found";
  return "inconclusive";
}

/**
 * Accepts only a well-formed CheckResult for `code`; anything else (missing,
 * malformed, wrong code) becomes an error result so the scanner never crashes.
 */
export function normalizeCheckResult(code: string, raw: unknown): CheckResult {
  const r = raw as Partial<CheckResult> | null | undefined;
  const http = typeof r?.httpStatus === "number" ? r.httpStatus : null;
  if (!r || typeof r !== "object" || r.code !== code || typeof r.status !== "string") {
    return {
      code,
      status: "inconclusive",
      httpStatus: null,
      retryAfterSeconds: null,
      reason: "Resposta inválida da função de verificação.",
      checkedAt: new Date().toISOString(),
      discordQueried: null,
      errorKind: "invalid_reply",
    };
  }
  const status = classifyHttpStatus(http);
  const layer =
    typeof r.limitLayer === "string" && LIMIT_LAYERS.includes(r.limitLayer)
      ? (r.limitLayer as LimitLayer)
      : null;
  const kind =
    typeof r.errorKind === "string" && ERROR_KINDS.includes(r.errorKind)
      ? (r.errorKind as ErrorKind)
      : null;
  const discordErrorCode = typeof r.discordErrorCode === "number" ? r.discordErrorCode : null;
  const expiresAt = http === 200 && typeof r.expiresAt === "string" ? r.expiresAt : null;
  // Body evidence of a 200 is preserved: only an explicit `true` is valid;
  // false/null/malformed → false (UNKNOWN). Absent → legacy (no evidence carried).
  const inviteBodyValid =
    http !== 200 ? null : r.inviteBodyValid === undefined ? undefined : r.inviteBodyValid === true;
  const discordQueried =
    status !== "inconclusive"
      ? true
      : typeof r.discordQueried === "boolean"
        ? r.discordQueried
        : null;
  const errorKind =
    status === "inconclusive" ? (http === 429 && kind !== "app_block" ? "rate_limit" : kind) : null;
  return {
    code,
    // Recomputed from evidence: a reply can never claim CONFIRMED_FREE by itself.
    availability: classifyAvailability({
      code,
      httpStatus: http,
      discordQueried,
      errorKind,
      expiresAt,
      ...(inviteBodyValid !== undefined ? { inviteBodyValid } : {}),
      // officialConfirmation is deliberately NOT taken from a reply: no backend
      // produces one (Discord has no such public operation), so a wire answer
      // can never make itself "Liberada".
    }),
    discordErrorCode,
    expiresAt,
    ...(inviteBodyValid !== undefined ? { inviteBodyValid } : {}),
    // Re-derive status from the HTTP code so a 404 can never be shown as anything else.
    status: classifyHttpStatus(http),
    httpStatus: http,
    retryAfterSeconds: finiteWait(r.retryAfterSeconds),
    reason: typeof r.reason === "string" ? r.reason : "",
    checkedAt: typeof r.checkedAt === "string" ? r.checkedAt : new Date().toISOString(),
    // 200/404 can only come from Discord; otherwise trust only an explicit boolean.
    discordQueried:
      status !== "inconclusive"
        ? true
        : typeof r.discordQueried === "boolean"
          ? r.discordQueried
          : null,
    limitLayer: http === 429 ? layer : null,
    limitScope: http === 429 && typeof r.limitScope === "string" ? r.limitScope.slice(0, 20) : null,
    limitGlobal: http === 429 && typeof r.limitGlobal === "boolean" ? r.limitGlobal : null,
    nextAllowedInSeconds: status !== "inconclusive" ? finiteWait(r.nextAllowedInSeconds) : null,
    blockedForSeconds: http === 429 ? finiteWait(r.blockedForSeconds) : null,
    errorKind:
      status === "inconclusive"
        ? http === 429 && kind !== "app_block"
          ? "rate_limit"
          : kind
        : null,
    trace: sanitizeTrace(r.trace),
    limitHeaders: status === "inconclusive" ? sanitizeLimitHeaders(r.limitHeaders) : null,
  };
}

/** Larger of Retry-After header (seconds) and JSON body retry_after (seconds). */
export function parseRetryAfter(
  header: string | null,
  bodyRetryAfter?: unknown,
  nowMs = Date.now(),
): number | null {
  const values: number[] = [];
  if (header != null && header.trim() !== "") {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) {
      values.push(seconds);
    } else {
      // HTTP Retry-After also permits an HTTP-date, not only delay-seconds.
      const dateMs = Date.parse(header);
      if (Number.isFinite(dateMs)) values.push(Math.max(0, (dateMs - nowMs) / 1000));
    }
  }
  if (
    typeof bodyRetryAfter === "number" &&
    Number.isFinite(bodyRetryAfter) &&
    bodyRetryAfter >= 0
  ) {
    values.push(bodyRetryAfter);
  }
  return values.length ? Math.max(...values) : null;
}

/**
 * Full cooldown after a 429: the whole Retry-After plus a safety margin,
 * progressively longer when other 429s happened recently, 60 s (+ margin)
 * when unknown. Resuming afterwards is manual.
 */
export function cooldownSecondsFor(
  retryAfterSeconds: number | null | undefined,
  recentLimits = 1,
): number {
  return cooldownSeconds(retryAfterSeconds, recentLimits);
}

/**
 * Cooldown for a rate-limited result: never shorter than the server's own
 * block, and an app-side block (already padded) is not padded again.
 */
export function cooldownForResult(
  r: Pick<CheckResult, "retryAfterSeconds" | "blockedForSeconds" | "discordQueried">,
  recentLimits = 1,
): number {
  const server = finiteWait(r.blockedForSeconds) ?? 0;
  if (r.discordQueried === false)
    return cooldownSeconds(Math.max(server, finiteWait(r.retryAfterSeconds) ?? 0) || null, 1, true);
  return Math.max(cooldownSeconds(r.retryAfterSeconds, recentLimits), Math.ceil(server));
}

/** 0 = automatic; a fixed choice is never faster than the floor. */
export const clampInterval = (ms: number) =>
  ms === AUTO_INTERVAL
    ? AUTO_INTERVAL
    : Number.isFinite(ms)
      ? Math.max(MIN_INTERVAL_MS, ms)
      : AUTO_INTERVAL;

export type QueueStopReason =
  "done" | "stopped" | "rate_limited" | "batch" | "errors" | "throttled";

export interface QueueOptions {
  codes: string[];
  batchLimit: number;
  /** AUTO_INTERVAL (0) = adaptive pace; otherwise a fixed, slower interval. */
  intervalMs: number;
  /** Adaptive pace carried across runs (slower after 429s, faster after clean streaks). */
  pace?: PaceState;
  initialDelayMs?: number;
  maxConsecutiveErrors?: number;
  /** Retries for temporary failures before recording them. */
  maxRetries?: number;
  check: (code: string) => Promise<CheckResult>;
  sleep: (ms: number) => Promise<void>;
  shouldStop: () => boolean;
  now?: () => number;
  onStart?: (code: string, index: number) => void;
  /** A definitive or recorded result (never a 429). */
  onResult?: (result: CheckResult, index: number) => void;
  /** A 429 or app-side block: not a result; the code stays pending. */
  onRateLimit?: (result: CheckResult, index: number) => void;
  /** The same code will be tried again after `waitMs`. */
  onRetry?: (
    result: CheckResult,
    kind: "temporary" | "throttle",
    attempt: number,
    waitMs: number,
  ) => void;
  onPace?: (pace: PaceState) => void;
  /** A short Discord 429 being waited out inline; the same code is retried after `waitMs`. */
  onLimitWait?: (result: CheckResult, waitMs: number, attempt: number) => void;
}

export interface QueueOutcome {
  reason: QueueStopReason;
  /** Results recorded in this run (429s are not results). */
  checked: number;
  retryAfterSeconds: number | null;
  /** Set only when reason is "rate_limited". */
  rateLimitSource: RateLimitSource | null;
  /** The 429 that stopped the run, when reason is "rate_limited". */
  limit?: CheckResult | null;
  pace: PaceState;
}

const isTemporary = (r: CheckResult) => errorClassOf(r) === "temporary";

/**
 * Strictly sequential: one request at a time, each code at most once per run.
 * The delay between requests follows the adaptive pace (or a slower fixed
 * choice) and any wait Discord asked for. A 429 stops the run immediately
 * without recording a result, so resuming retries the same code. Temporary
 * failures are retried with progressive backoff before being recorded; the
 * run pauses after `batchLimit` results or too many consecutive errors.
 */
export async function runVerificationQueue(opts: QueueOptions): Promise<QueueOutcome> {
  const { check, sleep, shouldStop } = opts;
  const fixed = clampInterval(opts.intervalMs);
  const maxErrors = opts.maxConsecutiveErrors ?? MAX_CONSECUTIVE_ERRORS;
  const maxRetries = opts.maxRetries ?? MAX_TEMP_RETRIES;
  const now = opts.now ?? Date.now;
  const codes = [...new Set(opts.codes)];
  let pace = opts.pace ?? initialPace();
  const setPace = (p: PaceState) => {
    pace = p;
    opts.onPace?.(p);
  };
  let checked = 0;
  let consecutiveErrors = 0;
  let extraWaitMs = 0;
  let first = true;
  const out = (
    reason: QueueStopReason,
    retryAfterSeconds: number | null = null,
    rateLimitSource: RateLimitSource | null = null,
    limit: CheckResult | null = null,
  ): QueueOutcome => ({ reason, checked, retryAfterSeconds, rateLimitSource, limit, pace });

  for (let i = 0; i < codes.length; i++) {
    if (shouldStop()) return out("stopped");
    if (checked >= opts.batchLimit) return out("batch");
    const code = codes[i] as string;
    let attempts = 0;
    let throttles = 0;
    let inlineLimits = 0;
    for (;;) {
      const delay = first
        ? Math.max(0, opts.initialDelayMs ?? 0, extraWaitMs)
        : Math.max(effectiveInterval(pace, fixed), extraWaitMs);
      first = false;
      extraWaitMs = 0;
      if (delay > 0) {
        await sleep(delay);
        if (shouldStop()) return out("stopped");
      }
      opts.onStart?.(code, i);
      const result = await check(code);

      if (result.httpStatus === 429 || result.errorKind === "app_block") {
        setPace(paceAfterLimit(pace, limitKindOf(result), now()));
        // Short per-route Discord limit: wait exactly what Discord asked and retry the same code.
        const inline = inlineLimitWaitMs(result, inlineLimits);
        if (inline != null) {
          inlineLimits++;
          extraWaitMs = inline;
          opts.onLimitWait?.(result, inline, inlineLimits);
          continue;
        }
        opts.onRateLimit?.(result, i);
        return out("rate_limited", result.retryAfterSeconds, rateLimitSourceOf(result), result);
      }
      if (result.errorKind === "cors_blocked") {
        // discord.com answered but the page may not read it (Cloudflare block page without
        // CORS): an external block for this connection. Retrying fast would extend it.
        // Not a confirmed 429: no progressive backoff, no slower pace afterwards.
        opts.onRateLimit?.(result, i);
        return out("rate_limited", null, "blocked_response", result);
      }
      if (isSuspectedEdgeBlock(result, pace, now())) {
        // Connection failure right after a 429: retrying would extend a Cloudflare block.
        setPace(paceAfterLimit(pace, "edge", now()));
        opts.onRateLimit?.(result, i);
        return out("rate_limited", null, "suspected_edge", result);
      }
      if (result.errorKind === "app_throttle") {
        // The site's server is spacing requests of all visitors: not a result, try again shortly.
        if (throttles >= MAX_THROTTLE_RETRIES) return out("throttled");
        throttles++;
        extraWaitMs = Math.max(
          THROTTLE_WAIT_MS,
          Math.ceil((finiteWait(result.retryAfterSeconds) ?? 0) * 1000),
        );
        opts.onRetry?.(result, "throttle", throttles, extraWaitMs);
        continue;
      }
      if (isTemporary(result) && attempts < maxRetries) {
        attempts++;
        extraWaitMs = temporaryBackoffMs(attempts);
        setPace(paceAfterError(pace));
        opts.onRetry?.(result, "temporary", attempts, extraWaitMs);
        continue;
      }

      checked++;
      opts.onResult?.(result, i);
      if (result.status === "inconclusive") {
        setPace(paceAfterError(pace));
        consecutiveErrors++;
        if (consecutiveErrors >= maxErrors) return out("errors");
      } else {
        consecutiveErrors = 0;
        setPace(paceAfterSuccess(pace));
        if (result.nextAllowedInSeconds)
          extraWaitMs = Math.ceil(result.nextAllowedInSeconds * 1000);
      }
      break;
    }
  }
  return out("done");
}

function csvCell(value: unknown): string {
  let s = value == null ? "" : String(value);
  // Spreadsheet applications may execute cells beginning with formula
  // markers. Prefix dangerous values (including after whitespace/control
  // characters) with an apostrophe before applying normal CSV quoting.
  // eslint-disable-next-line no-control-regex -- control chars are the point of this guard
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}
