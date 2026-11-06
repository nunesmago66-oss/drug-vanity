/**
 * DRUG URL — standalone invite lookup backend (Node.js, one process).
 *
 * Runs on a server with its own fixed public IPv4 so Discord sees a dedicated
 * outbound address instead of shared Worker egress. It reuses the site's
 * lookup/classification code unchanged (invite-check.server.ts →
 * invite-response.ts, availability.ts, check-rules.ts, server-limiter.ts) and
 * returns the same CheckResult JSON as /api/public/invites/{code}.
 *
 * Process-wide guarantees (this process is the single coordinator — run ONE
 * instance; several instances would each keep an independent queue):
 *  - one global FIFO queue for every visitor, one Discord request at a time;
 *  - spacing between requests and the 429 block of server-limiter.ts apply to
 *    every request of the process (module-level limiter = process memory);
 *  - one queued/in-flight request per visitor, bounded queue length;
 *  - CORS limited to ALLOWED_ORIGINS; codes validated; no IPs/cookies logged.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { isValidCode, normalizeCode, type CheckResult } from "../../src/lib/vanity/check-rules";
import { checkInviteOnDiscord } from "../../src/lib/vanity/invite-check.server";
import { GLOBAL_MIN_GAP_MS } from "../../src/lib/vanity/server-limiter";

export interface ApiConfig {
  allowedOrigins: string[];
  trustProxy: boolean;
  maxQueue: number;
  gapMs: number;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  return {
    allowedOrigins: (env["ALLOWED_ORIGINS"] ?? "")
      .split(",")
      .map((s) => s.trim().replace(/\/$/, ""))
      .filter(Boolean),
    trustProxy: env["TRUST_PROXY"] === "1",
    maxQueue: Math.max(1, Number(env["MAX_QUEUE"] ?? 30) || 30),
    gapMs: Math.max(GLOBAL_MIN_GAP_MS, Number(env["MIN_GAP_MS"] ?? 0) || 0),
  };
}

type Check = (code: string, clientKey: string, requestId?: string) => Promise<CheckResult>;

/** Global serial queue: every visitor's lookup runs one after another, spaced by gapMs. */
export function createQueue(cfg: ApiConfig, check: Check = checkInviteOnDiscord) {
  let tail: Promise<unknown> = Promise.resolve();
  let lastStart = 0;
  let size = 0;
  const pendingClients = new Set<string>();

  function busy(code: string, reason: string, retry: number): CheckResult {
    return {
      code,
      status: "inconclusive",
      httpStatus: null,
      retryAfterSeconds: retry,
      reason,
      checkedAt: new Date().toISOString(),
      discordQueried: false,
      errorKind: "app_throttle",
      availability: "UNKNOWN",
    };
  }

  return {
    size: () => size,
    run(code: string, clientKey: string, requestId?: string): Promise<CheckResult> {
      if (pendingClients.has(clientKey))
        return Promise.resolve(
          busy(code, "Já existe uma consulta sua na fila do servidor. Nenhuma consulta foi enviada ao Discord.", 1),
        );
      if (size >= cfg.maxQueue)
        return Promise.resolve(
          busy(code, "Fila do servidor cheia. Nenhuma consulta foi enviada ao Discord. Aguarde alguns segundos.", 3),
        );
      size++;
      pendingClients.add(clientKey);
      const job = tail.then(async () => {
        const wait = lastStart + cfg.gapMs - Date.now();
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        lastStart = Date.now();
        return check(code, clientKey, requestId);
      });
      tail = job.catch(() => undefined);
      return job.finally(() => {
        size--;
        pendingClients.delete(clientKey);
      });
    },
  };
}

function clientKeyOf(req: IncomingMessage, cfg: ApiConfig): string {
  if (cfg.trustProxy) {
    const xff = req.headers["x-forwarded-for"];
    const first = (Array.isArray(xff) ? xff[0] : xff)?.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.socket.remoteAddress ?? "unknown";
}

export function createApi(cfg: ApiConfig, check?: Check) {
  const queue = createQueue(cfg, check);
  const send = (res: ServerResponse, status: number, body: unknown, cors: Record<string, string>) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...cors,
    });
    res.end(JSON.stringify(body));
  };

  return createServer(async (req, res) => {
    const origin = typeof req.headers.origin === "string" ? req.headers.origin : null;
    const allowed = origin && cfg.allowedOrigins.includes(origin) ? origin : null;
    const cors: Record<string, string> = allowed
      ? {
          "Access-Control-Allow-Origin": allowed,
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-Request-Id",
          "Access-Control-Max-Age": "86400",
          Vary: "Origin",
        }
      : { Vary: "Origin" };
    const url = new URL(req.url ?? "/", "http://localhost");

    if (req.method === "OPTIONS") {
      res.writeHead(allowed ? 204 : 403, cors);
      return res.end();
    }
    if (req.method !== "GET") return send(res, 405, { error: "Método não permitido." }, cors);
    if (url.pathname === "/health") return send(res, 200, { ok: true, queue: queue.size() }, cors);

    const m = /^\/api\/public\/invites\/([^/]{1,64})$/.exec(url.pathname);
    if (!m) return send(res, 404, { error: "Não encontrado." }, cors);
    // Browsers always send Origin cross-site; refuse other sites' pages.
    if (origin && !allowed) return send(res, 403, { error: "Origem não permitida." }, cors);

    let code = "";
    try {
      code = normalizeCode(decodeURIComponent(m[1]!));
    } catch {
      /* invalid escape */
    }
    if (!isValidCode(code))
      return send(res, 400, { error: "Código inválido: use 2–3 caracteres (a-z, 0-9, -)." }, cors);

    const rawId = req.headers["x-request-id"];
    const requestId =
      typeof rawId === "string" && /^[a-z0-9-]{4,40}$/i.test(rawId) ? rawId : undefined;
    try {
      send(res, 200, await queue.run(code, clientKeyOf(req, cfg), requestId), cors);
    } catch (err) {
      console.error("invite api failed", err instanceof Error ? err.message : "unknown");
      send(res, 500, { error: "Falha interna do servidor do site." }, cors);
    }
  });
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));
if (isMain) {
  const cfg = readConfig();
  const port = Number(process.env["PORT"] ?? 8787);
  const host = process.env["HOST"] ?? "0.0.0.0";
  if (cfg.allowedOrigins.length === 0)
    console.warn("ALLOWED_ORIGINS vazio: navegadores de outros sites serão recusados, inclusive o seu.");
  const server = createApi(cfg);
  server.listen(port, host, () =>
    console.info(`invite api on http://${host}:${port} (queue ${cfg.maxQueue}, gap ${cfg.gapMs}ms)`),
  );
  const stop = () => server.close(() => process.exit(0));
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
