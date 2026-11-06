import { createServer, type IncomingMessage } from "node:http";
import { timingSafeEqual } from "node:crypto";
import type { BackgroundEngine } from "./engine";

export function companionServer(engine: BackgroundEngine, token: string, uiOrigin: string) {
  return createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (origin && origin !== uiOrigin) {
      res.writeHead(403).end();
      return;
    }
    if (!req.headers.host?.match(/^(127\.0\.0\.1|localhost):\d+$/)) {
      res.writeHead(403).end();
      return;
    }
    if (origin) res.setHeader("Access-Control-Allow-Origin", uiOrigin);
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }
    const given = Buffer.from((req.headers.authorization ?? "").replace(/^Bearer /, ""));
    const expected = Buffer.from(token);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      res.writeHead(401).end();
      return;
    }
    try {
      if (req.method === "GET" && req.url === "/state") {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(engine.state));
        return;
      }
      if (req.method === "POST" && req.url === "/start") await engine.start(await body(req));
      else if (req.method === "POST" && req.url === "/check") {
        const input = await body(req);
        if (typeof input?.code !== "string") throw new Error("Código inválido");
        const result = await engine.quick(input.code);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(result));
        return;
      } else if (req.method === "POST" && req.url === "/stop") await engine.stop();
      else {
        res.writeHead(404).end();
        return;
      }
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(engine.state));
    } catch (e) {
      res
        .writeHead(409, { "Content-Type": "application/json" })
        .end(JSON.stringify({ error: e instanceof Error ? e.message : "Falha" }));
    }
  });
}
async function body(req: IncomingMessage) {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 12 * 1024 * 1024) throw new Error("Pedido muito grande");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
