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

export async function checkInviteFromBrowser(
  { data, signal }: BrowserCheckInput,
  fetchImpl: typeof fetch = fetch,
): Promise<CheckResult> {
  const code = normalizeCode(data.code);
  if (!isValidCode(code)) throw new Error("Código inválido: use 2–3 caracteres (a-z, 0-9, -).");

  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    // No custom headers and no cookies: a "simple" request, so no preflight.
    const res = await fetchImpl(
      `https://discord.com/api/v10/invites/${encodeURIComponent(code)}?with_counts=false`,
      { method: "GET", credentials: "omit", referrerPolicy: "no-referrer", signal: combined },
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
      availability: classifyAvailability({
        code,
        httpStatus: res.status,
        discordQueried: true,
        ...evidence,
      }),
    });
  } catch (err) {
    const timedOut =
      err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return result(code, {
      status: "inconclusive",
      httpStatus: null,
      retryAfterSeconds: null,
      reason: timedOut
        ? "Tempo esgotado ao consultar o Discord. Não é um resultado."
        : "Falha de conexão ao consultar o Discord (sem internet ou resposta bloqueada). Não é um resultado.",
      discordQueried: null,
      errorKind: timedOut ? "timeout" : "network",
      availability: "UNKNOWN",
    });
  }
}
