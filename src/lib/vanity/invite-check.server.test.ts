import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { normalizeCheckResult, runVerificationQueue } from "./check-rules";

// All Discord responses here are simulated; no real request is made.
type Server = typeof import("./invite-check.server");
let server: Server;
let n = 0;
const key = () => `client-${++n}`;

function respond(status: number, body: string, headers: Record<string, string> = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(body, { status, headers })),
  );
}

beforeEach(async () => {
  vi.resetModules();
  server = await import("./invite-check.server");
});
afterEach(() => vi.unstubAllGlobals());

describe("server check: response classification", () => {
  it("HTTP 200 → existing invite", async () => {
    respond(200, "{}", { "content-type": "application/json" });
    const r = await server.checkInviteOnDiscord("aa", key());
    expect(r).toMatchObject({ status: "exists", httpStatus: 200, discordQueried: true });
  });

  it("HTTP 404 → not found, never available", async () => {
    respond(404, '{"message":"Unknown Invite","code":10006}', {
      "content-type": "application/json",
    });
    const r = await server.checkInviteOnDiscord("aa", key());
    expect(r.status).toBe("not_found");
    expect(r.reason).toContain("NÃO confirma disponibilidade");
  });

  it("HTTP 429 from Discord's API with Retry-After 30 → 30 s wait, origin recorded", async () => {
    respond(429, '{"message":"You are being rate limited.","retry_after":30,"global":false}', {
      "content-type": "application/json",
      "retry-after": "30",
      "x-ratelimit-scope": "user",
    });
    const r = await server.checkInviteOnDiscord("aa", key());
    expect(r).toMatchObject({
      status: "inconclusive",
      httpStatus: 429,
      retryAfterSeconds: 30,
      discordQueried: true,
      limitLayer: "discord_api",
      limitScope: "user",
      limitGlobal: false,
    });
  });

  it("HTTP 429 HTML page (error 1015) → Cloudflare protection, not Discord's API", async () => {
    respond(429, "<html><title>Error 1015</title>Cloudflare Ray ID: abc</html>", {
      "content-type": "text/html; charset=UTF-8",
      "retry-after": "60",
    });
    const r = await server.checkInviteOnDiscord("aa", key());
    expect(r).toMatchObject({
      httpStatus: 429,
      limitLayer: "cloudflare_edge",
      retryAfterSeconds: 60,
    });
  });

  it("after a 429, the next check is blocked without contacting Discord", async () => {
    respond(429, '{"retry_after":30}', { "content-type": "application/json" });
    await server.checkInviteOnDiscord("aa", key());
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const r = await server.checkInviteOnDiscord("ab", key());
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(r).toMatchObject({ httpStatus: 429, discordQueried: false, errorKind: "app_block" });
  });

  it("HTTP 500 → temporary server failure, not a result", async () => {
    respond(500, "oops");
    const r = await server.checkInviteOnDiscord("aa", key());
    expect(r).toMatchObject({ status: "inconclusive", httpStatus: 500, errorKind: "server_error" });
  });

  it("timeout → communication error, not a negative result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw Object.assign(new Error("t"), { name: "TimeoutError" });
      }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await server.checkInviteOnDiscord("aa", key());
    expect(r).toMatchObject({ status: "inconclusive", httpStatus: null, errorKind: "timeout" });
  });

  it("connection failure → communication error, not a negative result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await server.checkInviteOnDiscord("aa", key());
    expect(r).toMatchObject({ status: "inconclusive", httpStatus: null, errorKind: "network" });
  });

  it("an empty Discord bucket on a 200 makes the next check wait longer", async () => {
    respond(200, "{}", { "x-ratelimit-remaining": "0", "x-ratelimit-reset-after": "12.5" });
    const r = await server.checkInviteOnDiscord("aa", key());
    expect(r.nextAllowedInSeconds).toBe(12.5);
  });
});

describe("queue honors Discord's wait signal", () => {
  it("waits max(interval, reset-after) before the next request", async () => {
    const sleep = vi.fn(async () => {});
    await runVerificationQueue({
      codes: ["aa", "bb"],
      batchLimit: 10,
      intervalMs: 3000,
      sleep,
      shouldStop: () => false,
      check: async (code) =>
        normalizeCheckResult(code, {
          code,
          status: "exists",
          httpStatus: 200,
          retryAfterSeconds: null,
          reason: "",
          checkedAt: "2026-01-01T00:00:00Z",
          nextAllowedInSeconds: code === "aa" ? 12.5 : null,
        }),
    });
    expect(sleep).toHaveBeenCalledWith(12500);
  });
  it("rejects absurd waits as malformed", () => {
    const r = normalizeCheckResult("aa", {
      code: "aa",
      status: "exists",
      httpStatus: 200,
      retryAfterSeconds: null,
      reason: "",
      checkedAt: "x",
      nextAllowedInSeconds: 1e12,
    });
    expect(r.nextAllowedInSeconds).toBeNull();
  });
});

describe("server 429 wait uses the longest signal", () => {
  it("Retry-After 10 but X-RateLimit-Reset-After 45 → waits 45 s", async () => {
    respond(429, '{"retry_after":10}', {
      "content-type": "application/json",
      "retry-after": "10",
      "x-ratelimit-reset-after": "45",
    });
    const r = await server.checkInviteOnDiscord("aa", key());
    expect(r.retryAfterSeconds).toBe(45);
  });
  it("429 without any wait header → 60 s default plus margin (73 s block)", async () => {
    respond(429, "", {});
    const r = await server.checkInviteOnDiscord("aa", key());
    expect(r.retryAfterSeconds).toBeNull();
    expect(r.blockedForSeconds).toBe(73);
  });
});
