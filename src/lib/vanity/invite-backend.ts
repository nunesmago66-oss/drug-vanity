/**
 * Browser side of the invite lookup: the page never calls discord.com itself.
 * It asks the site's own backend (GET /api/public/invites/{code}, same
 * origin, so no CORS), which queries Discord's official route server-side
 * and returns the evidence. Failures between the page and the backend are
 * reported as such — never as a Discord answer or a rate limit.
 */
import {
  REQUEST_TIMEOUT_MS,
  isValidCode,
  normalizeCode,
  type CheckResult,
  type RequestTrace,
} from "./check-rules";
import { describeError, newRequestId, withTimeout } from "./invite-check.browser";

export const backendUrl = (code: string) => `/api/public/invites/${encodeURIComponent(code)}`;

/** Backend waits up to REQUEST_TIMEOUT_MS for Discord; leave room for the round trip. */
const BACKEND_TIMEOUT_MS = REQUEST_TIMEOUT_MS + 5000;

export async function checkInviteViaBackend(
  { data, signal }: { data: { code: string }; signal?: AbortSignal },
  fetchImpl: typeof fetch = fetch,
): Promise<CheckResult> {
  const code = normalizeCode(data.code);
  if (!isValidCode(code)) throw new Error("Código inválido: use 2–3 caracteres (a-z, 0-9, -).");
  const id = newRequestId();
  const url = backendUrl(code);
  const started = Date.now();
  const fail = (
    errorKind: "network" | "timeout" | "app_error",
    reason: string,
    extra: Partial<RequestTrace> = {},
  ): CheckResult => {
    const trace: RequestTrace = {
      id,
      url,
      at: new Date(started).toISOString(),
      layer: "browser",
      durationMs: Date.now() - started,
      errorName: null,
      errorMessage: null,
      probe: null,
      ...extra,
    };
    console.warn(
      `[discord-check ${id}] browser GET ${url} failed after ${trace.durationMs}ms: ${trace.errorName ?? errorKind}: ${trace.errorMessage ?? reason}`,
    );
    return {
      code,
      status: "inconclusive",
      httpStatus: null,
      retryAfterSeconds: null,
      reason,
      checkedAt: new Date().toISOString(),
      discordQueried: null,
      errorKind,
      availability: "UNKNOWN",
      trace,
    };
  };

  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "GET",
      headers: { "X-Request-Id": id },
      cache: "no-store",
      signal: withTimeout(signal, BACKEND_TIMEOUT_MS),
    });
  } catch (err) {
    const { name, message } = describeError(err);
    const timedOut = name === "TimeoutError" || name === "AbortError";
    return fail(
      timedOut ? "timeout" : "network",
      timedOut
        ? "O servidor do site não respondeu a tempo. Não é um resultado."
        : `Sem conexão com o servidor do site (o Discord não foi consultado). Erro original: ${name}: ${message}. Não é um resultado.`,
      { errorName: name, errorMessage: message },
    );
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* handled below */
  }
  const r = body as Partial<CheckResult> | null;
  if (!res.ok || !r || typeof r !== "object" || r.code !== code) {
    const msg =
      r && typeof (r as { error?: unknown }).error === "string"
        ? (r as { error: string }).error
        : `HTTP ${res.status}`;
    return fail(
      "app_error",
      `O servidor do site falhou (HTTP ${res.status}): ${msg}. O Discord pode não ter sido consultado. Não é um resultado.`,
      { errorName: `HTTP ${res.status}`, errorMessage: msg },
    );
  }
  console.info(
    `[discord-check ${id}] browser -> backend -> Discord: HTTP ${r.httpStatus ?? "none"} in ${Date.now() - started}ms`,
  );
  return r as CheckResult;
}
