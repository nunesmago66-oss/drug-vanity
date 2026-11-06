/**
 * Central rate-limit manager shared by the scanner (both modes), the quick
 * check and the background helper. Pure functions + a small persisted
 * diagnostics record; tested beside this file.
 *
 * Measured on the real endpoint (GET /invites/{code}, unauthenticated):
 * 200/404 answers carry NO X-RateLimit-* headers, and a 429 arrives after
 * ~20 fast or ~40 one-per-second requests with `retry_after` well under one
 * second, `global: false`, scope "user". Browsers can read the JSON body
 * (CORS allows the origin) but not Retry-After / X-RateLimit-* headers
 * (they are not exposed). The right reaction to such a 429 is therefore to
 * wait exactly what Discord asked (+ margin) and continue — not to stop the
 * whole scan for minutes and wait for a manual tap.
 */
import {
  LIMIT_WINDOW_MS,
  SAFETY_EXTRA_SECONDS,
  SAFETY_RATIO,
  finiteWait,
  recentLimitCount,
  type PaceState,
} from "./pacing";
import type { CheckResult, RateLimitSource } from "./check-rules";

/** The only Discord route this app calls. */
export const INVITE_ROUTE = "GET /invites/{code}";
/** A Discord API route 429 asking for at most this long is waited out inline. */
export const INLINE_MAX_WAIT_SECONDS = 30;
/** Inline waits in a row for the same code before the run stops into a cooldown. */
export const MAX_INLINE_LIMIT_RETRIES = 3;
/** Wait applied after a suspected Cloudflare edge block (no readable response). */
export const SUSPECTED_EDGE_WAIT_SECONDS = 60;

export type LimitOrigin = RateLimitSource | "suspected_edge";

/**
 * Milliseconds to wait before retrying the SAME code inline, or null when the
 * 429 must stop the run into a (persisted, auto-resuming) cooldown. Only a
 * short, per-route Discord API limit with an explicit wait is handled inline;
 * global limits, Cloudflare edge blocks, app-side blocks and unknown waits stop.
 */
export function inlineLimitWaitMs(
  r: Pick<
    CheckResult,
    | "httpStatus"
    | "discordQueried"
    | "limitLayer"
    | "limitGlobal"
    | "limitScope"
    | "retryAfterSeconds"
  >,
  inlineRetries: number,
): number | null {
  if (r.httpStatus !== 429 || r.discordQueried !== true) return null;
  if (r.limitLayer !== "discord_api") return null;
  if (r.limitGlobal === true || r.limitScope === "global") return null;
  const retry = finiteWait(r.retryAfterSeconds);
  if (retry == null || retry > INLINE_MAX_WAIT_SECONDS) return null;
  if (inlineRetries >= MAX_INLINE_LIMIT_RETRIES) return null;
  // Full wait + safety margin, doubled for each inline retry of the same code.
  const base = (retry * (1 + SAFETY_RATIO) + SAFETY_EXTRA_SECONDS) * 1000;
  return Math.ceil(base * 2 ** Math.max(0, inlineRetries));
}

/**
 * A connection failure right after a recent 429 is most likely the Cloudflare
 * protection in front of discord.com: its block page has no CORS header, so
 * the browser only sees a network error. Retrying would extend the block, so
 * it is treated as a rate limit (code stays pending) instead of a quick retry.
 */
export function isSuspectedEdgeBlock(
  r: Pick<CheckResult, "errorKind" | "httpStatus">,
  pace: Pick<PaceState, "limits">,
  now = Date.now(),
): boolean {
  return (
    r.httpStatus === null &&
    r.errorKind === "network" &&
    recentLimitCount({ limits: pace.limits } as PaceState, now) > 0
  );
}

/* ---------------- persisted diagnostics ---------------- */

export const DIAG_KEY = "dvf:ratelimit:v1";

export interface LimitEvent {
  at: number;
  origin: LimitOrigin;
  scope: string | null;
  global: boolean | null;
  /** Wait Discord itself asked for (s), when readable. */
  retryAfter: number | null;
  /** When Discord's own requested wait ends (epoch ms; 0 = unknown). */
  discordUntil: number;
  /** When the app allows the next request (Discord's wait + margin / backoff). */
  appUntil: number;
  code: string;
  /** true = waited out inline, the scan kept running. */
  inline: boolean;
}

export interface RateLimitDiag {
  v: 1;
  since: number;
  /** Requests that really reached Discord (any answer). */
  requests: number;
  /** HTTP 429 answers received (plus suspected edge blocks). */
  limited: number;
  /** 429s recovered automatically (inline wait or auto-resume). */
  recoveries: number;
  lastOkAt: number;
  lastLimit: LimitEvent | null;
  /** Scanner mode that should resume by itself when the cooldown ends. */
  autoResume: "a" | "m" | null;
}

export const emptyDiag = (now = 0): RateLimitDiag => ({
  v: 1,
  since: now,
  requests: 0,
  limited: 0,
  recoveries: 0,
  lastOkAt: 0,
  lastLimit: null,
  autoResume: null,
});

const MAX_AHEAD_MS = 25 * 60 * 60_000;
const count = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.min(1e12, Math.floor(v)) : 0;
const time = (v: unknown, now: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= now + MAX_AHEAD_MS ? v : 0;
const ORIGINS: readonly string[] = [
  "discord",
  "cloudflare_edge",
  "app_block",
  "unknown",
  "suspected_edge",
];

export function validateDiag(raw: unknown, now = Date.now()): RateLimitDiag {
  if (!raw || typeof raw !== "object") return emptyDiag(now);
  const r = raw as Record<string, unknown>;
  if (r["v"] !== 1) return emptyDiag(now);
  const l = r["lastLimit"] as Record<string, unknown> | null | undefined;
  const lastLimit: LimitEvent | null =
    l && typeof l === "object" && typeof l["origin"] === "string" && ORIGINS.includes(l["origin"])
      ? {
          at: time(l["at"], now),
          origin: l["origin"] as LimitOrigin,
          scope: typeof l["scope"] === "string" ? l["scope"].slice(0, 20) : null,
          global: typeof l["global"] === "boolean" ? l["global"] : null,
          retryAfter: finiteWait(l["retryAfter"]),
          discordUntil: time(l["discordUntil"], now),
          appUntil: time(l["appUntil"], now),
          code: typeof l["code"] === "string" ? l["code"].slice(0, 8) : "",
          inline: l["inline"] === true,
        }
      : null;
  const ar = r["autoResume"];
  return {
    v: 1,
    since: time(r["since"], now),
    requests: count(r["requests"]),
    limited: count(r["limited"]),
    recoveries: count(r["recoveries"]),
    lastOkAt: time(r["lastOkAt"], now),
    lastLimit,
    autoResume: ar === "a" || ar === "m" ? ar : null,
  };
}

/** Counts one answer from the check function (only real Discord contacts count as requests). */
export function noteResponse(d: RateLimitDiag, r: CheckResult, now = Date.now()): RateLimitDiag {
  const next = { ...d, since: d.since || now };
  if (r.discordQueried === true) next.requests++;
  if (r.httpStatus === 429 && r.discordQueried === true) next.limited++;
  if (r.httpStatus === 200 || r.httpStatus === 404) next.lastOkAt = now;
  return next;
}

/** Records the latest limit and how the app reacted to it. */
export function noteLimit(
  d: RateLimitDiag,
  r: CheckResult,
  reaction: { inline: boolean; appUntil: number; origin?: LimitOrigin | undefined },
  now = Date.now(),
): RateLimitDiag {
  const retry = r.discordQueried === true ? finiteWait(r.retryAfterSeconds) : null;
  const origin: LimitOrigin =
    reaction.origin ??
    (r.discordQueried === false
      ? "app_block"
      : r.discordQueried === true
        ? r.limitLayer === "cloudflare_edge"
          ? "cloudflare_edge"
          : "discord"
        : "unknown");
  return {
    ...d,
    since: d.since || now,
    limited: d.limited + (origin === "suspected_edge" ? 1 : 0),
    lastLimit: {
      at: now,
      origin,
      scope: r.limitScope ?? null,
      global: r.limitGlobal ?? null,
      retryAfter: retry,
      discordUntil: retry != null ? now + Math.ceil(retry * 1000) : 0,
      appUntil: Math.max(now, reaction.appUntil),
      code: r.code,
      inline: reaction.inline,
    },
  };
}

export type LimitStateKey = "normal" | "waiting" | "cooldown" | "recovered" | "offline";

export interface DiagView {
  state: LimitStateKey;
  normal: boolean;
  connection: string;
  limit: string;
  origin: string;
  route: string;
  remainingSeconds: number;
  requests: number;
  limited: number;
  recovery: string;
  /** Distinguishes Discord's own (external) wait from the app's internal margin. */
  external: string;
}

export const ORIGIN_LABEL: Record<LimitOrigin, string> = {
  discord: "Discord (API)",
  cloudflare_edge: "Cloudflare (proteção do Discord)",
  suspected_edge: "Provável Cloudflare (sem resposta legível)",
  app_block: "Bloqueio preventivo do app",
  unknown: "Não identificada",
};

const hhmmss = (ms: number) =>
  new Date(ms).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

export function describeDiag(
  d: RateLimitDiag,
  ctx: {
    cooldownUntil: number;
    now: number;
    running: boolean;
    online: boolean;
    inlineUntil?: number;
  },
): DiagView {
  const { now } = ctx;
  const l = d.lastLimit;
  const inlineWait = ctx.running && (ctx.inlineUntil ?? 0) > now;
  const cooling = ctx.cooldownUntil > now;
  const remainingMs = Math.max(
    cooling ? ctx.cooldownUntil - now : 0,
    inlineWait ? (ctx.inlineUntil ?? 0) - now : 0,
  );
  const recentLimit = !!l && now - l.at < LIMIT_WINDOW_MS;
  const state: LimitStateKey = !ctx.online
    ? "offline"
    : cooling
      ? "cooldown"
      : inlineWait
        ? "waiting"
        : recentLimit
          ? "recovered"
          : "normal";
  const limit =
    state === "offline"
      ? "Sem internet neste aparelho"
      : state === "cooldown"
        ? "Em espera — nenhuma consulta é enviada"
        : state === "waiting"
          ? "Aguardando o tempo pedido pelo Discord (automático)"
          : state === "recovered"
            ? "Liberado — último limite já expirou"
            : "Normal";
  const route = l
    ? `${INVITE_ROUTE}${l.global || l.scope === "global" ? " — limite global" : l.scope ? ` — escopo ${l.scope}` : ""}`
    : INVITE_ROUTE;
  const recovery = cooling
    ? d.autoResume
      ? `Retomada automática às ${hhmmss(ctx.cooldownUntil)}`
      : `Liberado às ${hhmmss(ctx.cooldownUntil)} (pausado por você)`
    : inlineWait
      ? "Repetindo o mesmo código automaticamente"
      : d.recoveries > 0
        ? `${d.recoveries} recuperação(ões) automática(s)`
        : "—";
  const external = !l
    ? "Nenhum limite registrado"
    : l.origin === "app_block"
      ? "Bloqueio interno do app (o Discord não foi consultado)"
      : l.discordUntil
        ? l.discordUntil > now
          ? `Bloqueio real do Discord ativo até ${hhmmss(l.discordUntil)}`
          : `Bloqueio real do Discord terminou às ${hhmmss(l.discordUntil)}${cooling ? "; resta só a margem de segurança do app" : ""}`
        : cooling
          ? "Duração do bloqueio externo desconhecida; o app aguarda por segurança"
          : "Sem bloqueio ativo conhecido";
  return {
    state,
    normal: state === "normal" || state === "recovered",
    connection: !ctx.online
      ? "Sem internet"
      : d.lastOkAt
        ? `OK — última resposta válida às ${hhmmss(d.lastOkAt)}`
        : "Online (nenhuma resposta ainda)",
    limit,
    origin: l ? ORIGIN_LABEL[l.origin] : "—",
    route,
    remainingSeconds: Math.ceil(remainingMs / 1000),
    requests: d.requests,
    limited: d.limited,
    recovery,
    external,
  };
}

/* ---------------- browser store (shared by every component and tab) ---------------- */

type Store = Pick<Storage, "getItem" | "setItem">;
const listeners = new Set<() => void>();
let cache: RateLimitDiag | null = null;

function store(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadDiag(s: Pick<Storage, "getItem"> | null = store()): RateLimitDiag {
  try {
    const raw = s?.getItem(DIAG_KEY);
    return raw ? validateDiag(JSON.parse(raw)) : emptyDiag(Date.now());
  } catch {
    return emptyDiag(Date.now());
  }
}

export function getDiag(): RateLimitDiag {
  if (!cache) cache = loadDiag();
  return cache;
}

/** Read-modify-write against the latest stored copy, so tabs never overwrite each other's counts. */
export function updateDiag(fn: (d: RateLimitDiag) => RateLimitDiag): RateLimitDiag {
  const next = fn(loadDiag());
  cache = next;
  try {
    store()?.setItem(DIAG_KEY, JSON.stringify(next));
  } catch {
    /* diagnostics never block a scan */
  }
  listeners.forEach((l) => l());
  return next;
}

export function subscribeDiag(l: () => void): () => void {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== DIAG_KEY) return;
    cache = loadDiag();
    l();
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}
