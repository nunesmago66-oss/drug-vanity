/** Pure parsing of Discord invite responses, shared by the server and browser checks. */
import {
  MAX_SERVER_WAIT_SECONDS,
  parseRetryAfter,
  type LimitHeaders,
  type LimitLayer,
} from "./check-rules";

const num = (v: string | null): number | null => {
  if (v == null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= MAX_SERVER_WAIT_SECONDS ? n : null;
};

export interface LimitEvidence {
  layer: LimitLayer | null;
  scope: string | null;
  global: boolean | null;
  retryAfterSeconds: number | null;
}

/**
 * Reads a 429 response and decides, from evidence only, whether it came from
 * Discord's API (JSON body with retry_after / X-RateLimit-* headers) or from
 * the Cloudflare protection in front of discord.com (HTML / error 1015 page).
 */
export function readLimitEvidence(headers: Headers, bodyText: string): LimitEvidence {
  const contentType = headers.get("content-type") ?? "";
  let body: { retry_after?: unknown; global?: unknown } | null = null;
  if (contentType.includes("json")) {
    try {
      body = JSON.parse(bodyText) as { retry_after?: unknown; global?: unknown };
    } catch {
      body = null;
    }
  }
  const scope = headers.get("x-ratelimit-scope");
  const globalHeader = headers.get("x-ratelimit-global");
  const looksLikeEdge =
    !!headers.get("cf-mitigated") ||
    contentType.includes("text/html") ||
    /error\s*1015|cloudflare ray id|cf-error/i.test(bodyText);
  const hasApiEvidence =
    !!scope || !!headers.get("x-ratelimit-bucket") || (body !== null && "retry_after" in body);
  // A Cloudflare mitigation marker or HTML page wins: it is never Discord's API.
  const layer: LimitLayer | null = looksLikeEdge
    ? "cloudflare_edge"
    : hasApiEvidence
      ? "discord_api"
      : null;
  const global =
    typeof body?.global === "boolean"
      ? body.global
      : globalHeader != null
        ? globalHeader.toLowerCase() === "true"
        : null;
  const header = parseRetryAfter(headers.get("retry-after"), body?.retry_after);
  const resetAfter = num(headers.get("x-ratelimit-reset-after"));
  // Use the longest wait any signal asked for; never the shortest.
  const retry =
    header == null && resetAfter == null ? null : Math.max(header ?? 0, resetAfter ?? 0);
  return {
    layer,
    scope: scope ? scope.slice(0, 20) : null,
    global,
    retryAfterSeconds: retry == null ? null : Math.min(retry, MAX_SERVER_WAIT_SECONDS),
  };
}

/** Raw snapshot of a 429/block answer (headers as sent, body flags), for diagnosis. */
export function readLimitHeaders(
  status: number,
  headers: Headers,
  bodyText: string,
  isolate: { sent1s: number; sent10s: number } | null = null,
): LimitHeaders {
  const contentType = headers.get("content-type");
  let body: { retry_after?: unknown; global?: unknown } | null = null;
  try {
    body = JSON.parse(bodyText) as { retry_after?: unknown; global?: unknown };
  } catch {
    body = null;
  }
  const cut = (v: string | null, max: number) => (v == null ? null : v.slice(0, max));
  const bra = body?.retry_after;
  return {
    status,
    contentType: cut(contentType, 80),
    retryAfter: cut(headers.get("retry-after"), 40),
    bodyRetryAfter: typeof bra === "number" && Number.isFinite(bra) && bra >= 0 ? bra : null,
    bodyGlobal: typeof body?.global === "boolean" ? body.global : null,
    scope: cut(headers.get("x-ratelimit-scope"), 20),
    global: cut(headers.get("x-ratelimit-global"), 10),
    bucket: cut(headers.get("x-ratelimit-bucket"), 80),
    server: cut(headers.get("server"), 40),
    cfRay: cut(headers.get("cf-ray"), 60),
    cfMitigated: cut(headers.get("cf-mitigated"), 40),
    html: /text\/html/i.test(contentType ?? "") || /^\s*<(!doctype|html)/i.test(bodyText),
    isolateSent1s: isolate?.sent1s ?? null,
    isolateSent10s: isolate?.sent10s ?? null,
  };
}

/**
 * Plain-language origin of a 429, from evidence only. A "global" Discord 429
 * while this instance sent at most a couple of requests in the last second
 * cannot be caused by this app (Discord's global limit is ~50 req/s per
 * address): the shared outbound address was exhausted by other traffic.
 */
export function explainLimitOrigin(h: LimitHeaders, layer: LimitLayer | null): string {
  if (layer === "cloudflare_edge")
    return "Origem: proteção Cloudflare na frente do Discord (bloqueio de borda, não limite da API).";
  const isGlobal =
    h.bodyGlobal === true || h.global?.toLowerCase() === "true" || h.scope === "global";
  if (isGlobal && h.isolateSent1s != null && h.isolateSent1s <= 2)
    return `Origem: limite GLOBAL do Discord para o endereço de saída do servidor do site. Este servidor enviou só ${h.isolateSent1s} consulta(s) no último segundo, então o limite foi consumido por outro tráfego que compartilha o mesmo endereço da hospedagem.`;
  if (isGlobal) return "Origem: limite GLOBAL do Discord para o endereço de saída do servidor do site.";
  if (h.scope === "user" || h.scope === "shared")
    return `Origem: limite da rota de convites do Discord (escopo ${h.scope}).`;
  return "Origem: não identificada pela resposta (sem cabeçalhos de limite do Discord).";
}

/** Seconds to wait before the next request when Discord reports an empty bucket. */
export function readNextAllowed(headers: Headers): number | null {
  const remaining = num(headers.get("x-ratelimit-remaining"));
  if (remaining !== 0) return null;
  return num(headers.get("x-ratelimit-reset-after"));
}
