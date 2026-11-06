/** Pure parsing of Discord invite responses, shared by the server and browser checks. */
import { MAX_SERVER_WAIT_SECONDS, parseRetryAfter, type LimitLayer } from "./check-rules";

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
    contentType.includes("text/html") || /error\s*1015|cloudflare ray id|cf-error/i.test(bodyText);
  const hasApiEvidence =
    !!scope || !!headers.get("x-ratelimit-bucket") || (body !== null && "retry_after" in body);
  const layer: LimitLayer | null = hasApiEvidence
    ? "discord_api"
    : looksLikeEdge
      ? "cloudflare_edge"
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

/** Seconds to wait before the next request when Discord reports an empty bucket. */
export function readNextAllowed(headers: Headers): number | null {
  const remaining = num(headers.get("x-ratelimit-remaining"));
  if (remaining !== 0) return null;
  return num(headers.get("x-ratelimit-reset-after"));
}
