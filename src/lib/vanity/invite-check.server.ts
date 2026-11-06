import {
  REQUEST_TIMEOUT_MS,
  classifyHttpStatus,
  type CheckResult,
  type RequestTrace,
} from "./check-rules";
import { describeError, inviteUrl, newRequestId } from "./invite-check.browser";

import { classifyAvailability, readInviteBody } from "./availability";
import {
  explainLimitOrigin,
  readLimitEvidence,
  readLimitHeaders,
  readNextAllowed,
} from "./invite-response";
import { createLimiter } from "./server-limiter";

export { readLimitEvidence, readNextAllowed, type LimitEvidence } from "./invite-response";

// Per-isolate guard shared by every visitor of this isolate (global gap,
// per-visitor gap, one in-flight request per visitor, progressive 429 block).
// The browser queue is the primary limiter.
const limiter = createLimiter();

// Requests this isolate really sent to Discord (last 10 s), as 429 evidence.
let sentAt: number[] = [];
function noteSent(now: number) {
  sentAt = [...sentAt.filter((t) => now - t < 10_000), now].slice(-200);
}
function sentCounts(now: number) {
  return {
    sent1s: sentAt.filter((t) => now - t < 1000).length,
    sent10s: sentAt.filter((t) => now - t < 10_000).length,
  };
}

function result(code: string, partial: Omit<CheckResult, "code" | "checkedAt">): CheckResult {
  return { code, checkedAt: new Date().toISOString(), ...partial };
}

/** HTML instead of JSON on a non-429: a Cloudflare challenge/block page, not a Discord answer. */
export function isChallengePage(status: number, contentType: string | null, body: string): boolean {
  if (status === 200 || status === 404) return false;
  const html = /text\/html/i.test(contentType ?? "") || /^\s*<(!doctype|html)/i.test(body);
  return html;
}

export async function checkInviteOnDiscord(
  code: string,
  clientKey: string,
  requestId: string = newRequestId(),
): Promise<CheckResult> {
  const url = inviteUrl(code);
  const started = Date.now();
  const trace = (extra: Partial<RequestTrace> = {}): RequestTrace => ({
    id: requestId,
    url,
    at: new Date(started).toISOString(),
    layer: "server",
    durationMs: Date.now() - started,
    errorName: null,
    errorMessage: null,
    probe: null,
    ...extra,
  });
  const gate = limiter.acquire(clientKey);
  if (!gate.ok && gate.kind === "blocked") {
    const wait = gate.waitSeconds;
    return result(code, {
      status: "inconclusive",
      httpStatus: 429,
      retryAfterSeconds: wait,
      blockedForSeconds: wait,
      reason: `Bloqueio preventivo do app: um limite de taxa do Discord recebido há pouco ainda está ativo. Nenhuma consulta foi enviada ao Discord. Aguarde ${wait}s.`,
      discordQueried: false,
      errorKind: "app_block",
      trace: trace(),
    });
  }
  if (!gate.ok) {
    return result(code, {
      status: "inconclusive",
      httpStatus: null,
      // Hint for the queue: how long until this visitor may try again (not a Discord wait).
      retryAfterSeconds: gate.kind === "busy" ? 1 : Math.ceil(gate.waitMs / 100) / 10,
      reason:
        gate.kind === "global"
          ? "O servidor do site está espaçando consultas de todos os visitantes. Nenhuma consulta foi enviada ao Discord. Aguarde alguns segundos."
          : "Consultas muito rápidas. Nenhuma consulta foi enviada ao Discord. Aguarde alguns segundos.",
      discordQueried: false,
      errorKind: "app_throttle",
      trace: trace(),
    });
  }

  try {
    noteSent(Date.now());
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "DiscordVanityFinder (public invite lookup, 1.0)",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    console.info(
      `[discord-check ${requestId}] server GET ${url} -> HTTP ${res.status} in ${Date.now() - started}ms`,
    );

    if (res.status === 429) {
      let text = "";
      try {
        text = (await res.text()).slice(0, 4000);
      } catch {
        /* ignore */
      }
      const ev = readLimitEvidence(res.headers, text);
      const raw = readLimitHeaders(429, res.headers, text, sentCounts(Date.now()));
      // Discord's wait + safety margin, longer when 429s repeat; blocks every visitor.
      const blocked = limiter.recordLimit(ev.retryAfterSeconds);
      const origin = explainLimitOrigin(raw, ev.layer);
      // Diagnostic only: no user data, no IPs, no credentials.
      console.warn("discord 429", { code, layer: ev.layer ?? "unknown", blockedFor: blocked, ...raw });
      const who =
        ev.layer === "cloudflare_edge"
          ? "A proteção da Cloudflare na frente do Discord bloqueou a consulta (HTTP 429)."
          : "O Discord retornou limite de taxa (HTTP 429).";
      const scope = ev.scope ? ` Escopo: ${ev.scope}.` : ev.global ? " Limite global." : "";
      return result(code, {
        status: "inconclusive",
        httpStatus: 429,
        // Discord's own wait (null when it gave none); the padded block is separate.
        retryAfterSeconds: ev.retryAfterSeconds,
        blockedForSeconds: blocked,
        reason: `${who}${scope} ${origin} Tente após ${blocked}s.`,
        limitHeaders: raw,
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
    if (isChallengePage(res.status, res.headers.get("content-type"), bodyText)) {
      console.warn(`[discord-check ${requestId}] challenge/block page`, {
        status: res.status,
        cfRay: res.headers.get("cf-ray"),
      });
      return result(code, {
        status: "inconclusive",
        httpStatus: res.status,
        retryAfterSeconds: null,
        reason: `A proteção Cloudflare do Discord devolveu uma página de desafio/bloqueio (HTTP ${res.status}, HTML) para o servidor do site. Não é um resultado.`,
        discordQueried: true,
        errorKind: "edge_challenge",
        availability: "UNKNOWN",
        limitHeaders: readLimitHeaders(res.status, res.headers, bodyText, sentCounts(Date.now())),
        trace: trace(),
      });
    }

    const status = classifyHttpStatus(res.status);
    const nextAllowed = status === "inconclusive" ? null : readNextAllowed(res.headers);
    // Discord said the bucket is empty: hold every visitor until it resets.
    if (nextAllowed) limiter.blockUntil(Date.now() + Math.ceil(nextAllowed * 1000));
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
    console.error(`[discord-check ${requestId}] server GET ${url} failed: ${name}: ${message}`);
    const timedOut = name === "TimeoutError" || name === "AbortError";
    return result(code, {
      status: "inconclusive",
      httpStatus: null,
      retryAfterSeconds: null,
      reason: timedOut
        ? "Tempo esgotado: o servidor do site não recebeu resposta do Discord. Não é um resultado."
        : `O servidor do site não conseguiu se conectar ao Discord. Erro original: ${name}: ${message}. Não é um resultado.`,
      discordQueried: null,
      errorKind: timedOut ? "timeout" : "network",
      availability: "UNKNOWN",
      trace: trace({ errorName: name, errorMessage: message }),
    });
  } finally {
    limiter.release(clientKey);
  }
}
