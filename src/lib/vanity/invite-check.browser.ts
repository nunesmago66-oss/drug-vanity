/**
 * Checks an invite code straight from the visitor's browser, over the
 * visitor's own internet connection. Discord's public invite endpoint allows
 * cross-origin GETs, so each visitor is limited only by their own usage
 * instead of sharing the hosting's outbound address with thousands of sites.
 * Pacing, cooldowns and manual resume stay in the browser verification queue.
 */
import {
  REQUEST_TIMEOUT_MS,
  classifyHttpStatus,
  isValidCode,
  normalizeCode,
  type CheckResult,
  type RequestTrace,
} from "./check-rules";
import { classifyAvailability, readInviteBody } from "./availability";
import { readLimitEvidence, readNextAllowed } from "./invite-response";

export interface BrowserCheckInput {
  data: { code: string };
  signal?: AbortSignal;
}

function result(code: string, partial: Omit<CheckResult, "code" | "checkedAt">): CheckResult {
  return { code, checkedAt: new Date().toISOString(), ...partial };
}

export const inviteUrl = (code: string) =>
  `https://discord.com/api/v10/invites/${encodeURIComponent(code)}?with_counts=false`;

/** Short correlation id shown in the diagnostics and in console logs of every layer. */
export function newRequestId(): string {
  try {
    return crypto.randomUUID().slice(0, 8);
  } catch {
    return Math.random().toString(36).slice(2, 10);
  }
}

/**
 * Combines the caller's signal with a timeout. `AbortSignal.any` only exists
 * since Safari/iOS 17.4 and Chrome 116; older iPhones would otherwise fail
 * before any request is sent.
 */
export function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const hasAny = typeof (AbortSignal as { any?: unknown }).any === "function";
  const hasTimeout = typeof (AbortSignal as { timeout?: unknown }).timeout === "function";
  if (hasTimeout && (!signal || hasAny)) {
    const t = AbortSignal.timeout(ms);
    return signal ? AbortSignal.any([signal, t]) : t;
  }
  const c = new AbortController();
  const timer = setTimeout(() => c.abort(new DOMException("Timeout", "TimeoutError")), ms);
  signal?.addEventListener("abort", () => c.abort(signal.reason), { once: true });
  c.signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
  return c.signal;
}

/** Original error text including Node's `cause` (ENOTFOUND, ECONNREFUSED, TLS codes). */
export function describeError(err: unknown): { name: string; message: string } {
  if (!(err instanceof Error)) return { name: typeof err, message: String(err).slice(0, 300) };
  const cause = (err as { cause?: { code?: unknown; message?: unknown } }).cause;
  const extra =
    cause && typeof cause === "object"
      ? [cause.code, cause.message].filter((x) => typeof x === "string" && x).join(" ")
      : "";
  return {
    name: err.name || "Error",
    message: `${err.message}${extra ? ` (${extra})` : ""}`.slice(0, 300),
  };
}

const PROBE_TIMEOUT_MS = 8000;

/**
 * After a failed fetch in a browser: one opaque `no-cors` request to the same
 * URL. If it resolves, discord.com is reachable and answered, but the browser
 * refused to hand the answer to the page (no CORS header — typically a
 * Cloudflare block/challenge page). If it fails too, nothing answered at all.
 */
export async function probeFailure(
  url: string,
  fetchImpl: typeof fetch,
): Promise<RequestTrace["probe"]> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "offline";
  if (typeof window === "undefined") return null; // Node: no CORS, the error itself is exact.
  try {
    await fetchImpl(url, {
      method: "GET",
      mode: "no-cors",
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      signal: withTimeout(undefined, PROBE_TIMEOUT_MS),
    });
    return "reachable_unreadable";
  } catch {
    return "unreachable";
  }
}

const PROBE_REASON: Record<NonNullable<RequestTrace["probe"]>, string> = {
  reachable_unreadable:
    "O discord.com respondeu, mas o navegador bloqueou a leitura da resposta (sem permissão CORS). Isso acontece quando a proteção Cloudflare do Discord devolve uma página de bloqueio/desafio para a sua conexão, ou quando uma extensão/bloqueador altera a resposta. Não é um resultado.",
  unreachable:
    "O discord.com não respondeu a este aparelho (falha de DNS, TLS ou conexão; ou bloqueado por rede, firewall, VPN, DNS filtrado ou bloqueador de conteúdo). Não é um resultado.",
  offline: "Este aparelho está sem internet. Não é um resultado.",
};

export async function checkInviteFromBrowser(
  { data, signal }: BrowserCheckInput,
  fetchImpl: typeof fetch = fetch,
): Promise<CheckResult> {
  const code = normalizeCode(data.code);
  if (!isValidCode(code)) throw new Error("Código inválido: use 2–3 caracteres (a-z, 0-9, -).");

  const url = inviteUrl(code);
  const id = newRequestId();
  const layer: RequestTrace["layer"] = typeof window === "undefined" ? "background" : "browser";
  const started = Date.now();
  const trace = (extra: Partial<RequestTrace> = {}): RequestTrace => ({
    id,
    url,
    at: new Date(started).toISOString(),
    layer,
    durationMs: Date.now() - started,
    errorName: null,
    errorMessage: null,
    probe: null,
    ...extra,
  });
  try {
    const combined = withTimeout(signal, REQUEST_TIMEOUT_MS);
    // No custom headers and no cookies: a "simple" request, so no preflight.
    const res = await fetchImpl(url, {
      method: "GET",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: combined,
    });
    console.info(
      `[discord-check ${id}] ${layer} GET ${url} -> HTTP ${res.status} in ${Date.now() - started}ms`,
    );

    if (res.status === 429) {
      let text = "";
      try {
        text = (await res.text()).slice(0, 4000);
      } catch {
        /* ignore */
      }
      const ev = readLimitEvidence(res.headers, text);
      const who =
        ev.layer === "cloudflare_edge"
          ? "A proteção da Cloudflare na frente do Discord bloqueou a consulta (HTTP 429)."
          : "O Discord retornou limite de taxa para a sua conexão (HTTP 429).";
      const scope = ev.scope ? ` Escopo: ${ev.scope}.` : ev.global ? " Limite global." : "";
      const wait =
        ev.retryAfterSeconds != null ? ` Aguarde ${Math.ceil(ev.retryAfterSeconds)}s.` : "";
      return result(code, {
        status: "inconclusive",
        httpStatus: 429,
        retryAfterSeconds: ev.retryAfterSeconds,
        blockedForSeconds: null,
        reason: `${who}${scope}${wait}`,
        discordQueried: true,
        limitLayer: ev.layer,
        limitScope: ev.scope,
        limitGlobal: ev.global,
        errorKind: "rate_limit",
        availability: "UNKNOWN",
        trace: trace(),
      });
    }

    // Small JSON body: needed for VERIFIED AVAILABILITY evidence (error code, expires_at).
    let bodyText = "";
    try {
      bodyText = (await res.text()).slice(0, 8000);
    } catch {
      /* ignore */
    }
    const evidence = readInviteBody(code, res.status, bodyText);
    const status = classifyHttpStatus(res.status);
    const nextAllowed = status === "inconclusive" ? null : readNextAllowed(res.headers);
    const reason =
      status === "exists"
        ? "Existe um convite ativo com este código (HTTP 200)."
        : status === "not_found"
          ? "Nenhum convite encontrado (HTTP 404). Isso NÃO confirma disponibilidade para vanity URL."
          : res.status >= 500
            ? `Falha temporária do servidor do Discord (HTTP ${res.status}). Não é um resultado.`
            : `Resposta inesperada do Discord (HTTP ${res.status}).`;
    return result(code, {
      status,
      httpStatus: res.status,
      retryAfterSeconds: null,
      reason,
      discordQueried: true,
      nextAllowedInSeconds: nextAllowed,
      errorKind:
        status === "inconclusive" ? (res.status >= 500 ? "server_error" : "unexpected") : null,
      discordErrorCode: evidence.discordErrorCode ?? null,
      expiresAt: evidence.expiresAt ?? null,
      inviteBodyValid: evidence.inviteBodyValid ?? null,
      availability: classifyAvailability({
        code,
        httpStatus: res.status,
        discordQueried: true,
        ...evidence,
      }),
      trace: trace(),
    });
  } catch (err) {
    const { name, message } = describeError(err);
    const timedOut = name === "TimeoutError" || name === "AbortError";
    const probe = timedOut ? null : await probeFailure(url, fetchImpl);
    const t = trace({ errorName: name, errorMessage: message, probe });
    console.warn(
      `[discord-check ${id}] ${layer} GET ${url} failed after ${t.durationMs}ms: ${name}: ${message}${probe ? ` | probe: ${probe}` : ""}`,
    );
    const original = ` Erro original: ${name}: ${message}.`;
    return result(code, {
      status: "inconclusive",
      httpStatus: null,
      retryAfterSeconds: null,
      reason: timedOut
        ? `Tempo esgotado (${Math.round(t.durationMs / 1000)}s) ao consultar o Discord. Não é um resultado.`
        : `${probe ? PROBE_REASON[probe] : "Falha de conexão ao consultar o Discord. Não é um resultado."}${original}`,
      // A readable-less answer proves the request reached Discord's edge.
      discordQueried: probe === "reachable_unreadable" ? true : null,
      errorKind: timedOut
        ? "timeout"
        : probe === "reachable_unreadable"
          ? "cors_blocked"
          : "network",
      availability: "UNKNOWN",
      trace: t,
    });
  }
}
