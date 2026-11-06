import { REQUEST_TIMEOUT_MS, classifyHttpStatus, type CheckResult } from "./check-rules";

import { classifyAvailability, readInviteBody } from "./availability";
import { readLimitEvidence, readNextAllowed } from "./invite-response";
import { createLimiter } from "./server-limiter";

export { readLimitEvidence, readNextAllowed, type LimitEvidence } from "./invite-response";

// Per-isolate guard shared by every visitor of this isolate (global gap,
// per-visitor gap, one in-flight request per visitor, progressive 429 block).
// The browser queue is the primary limiter.
const limiter = createLimiter();

function result(code: string, partial: Omit<CheckResult, "code" | "checkedAt">): CheckResult {
  return { code, checkedAt: new Date().toISOString(), ...partial };
}

export async function checkInviteOnDiscord(code: string, clientKey: string): Promise<CheckResult> {
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
    });
  }

  try {
    const res = await fetch(
      `https://discord.com/api/v10/invites/${encodeURIComponent(code)}?with_counts=false`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "DiscordVanityFinder (public invite lookup, 1.0)",
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );

    if (res.status === 429) {
      let text = "";
      try {
        text = (await res.text()).slice(0, 4000);
      } catch {
        /* ignore */
      }
      const ev = readLimitEvidence(res.headers, text);
      // Discord's wait + safety margin, longer when 429s repeat; blocks every visitor.
      const blocked = limiter.recordLimit(ev.retryAfterSeconds);
      // Diagnostic only: no user data, no IPs, no credentials.
      console.warn("discord 429", {
        code,
        layer: ev.layer ?? "unknown",
        scope: ev.scope,
        global: ev.global,
        retryAfter: ev.retryAfterSeconds,
        blockedFor: blocked,
        contentType: res.headers.get("content-type"),
        cfRay: res.headers.get("cf-ray"),
      });
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
        reason: `${who}${scope} Tente após ${blocked}s.`,
        discordQueried: true,
        limitLayer: ev.layer,
        limitScope: ev.scope,
        limitGlobal: ev.global,
        errorKind: "rate_limit",
        availability: "UNKNOWN",
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
      availability: classifyAvailability({
        code,
        httpStatus: res.status,
        discordQueried: true,
        ...evidence,
      }),
    });
  } catch (err) {
    console.error("invite check failed", code, err);
    const timedOut =
      err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return result(code, {
      status: "inconclusive",
      httpStatus: null,
      retryAfterSeconds: null,
      reason: timedOut
        ? "Tempo esgotado ao consultar o Discord. Não é um resultado."
        : "Falha de conexão ao consultar o Discord. Não é um resultado.",
      discordQueried: true,
      errorKind: timedOut ? "timeout" : "network",
      availability: "UNKNOWN",
    });
  } finally {
    limiter.release(clientKey);
  }
}
