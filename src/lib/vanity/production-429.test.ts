import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { errorClassOf, normalizeCheckResult, rateLimitSourceOf } from "./check-rules";
import { checkInviteViaBackend } from "./invite-backend";

// Every response here is simulated; no real request reaches Discord.
type Server = typeof import("./invite-check.server");
let server: Server;
let n = 0;
const key = () => `visitor-${++n}`;

function stubFetch(status: number, body: string, headers: Record<string, string>) {
  const fn = vi.fn(async () => new Response(body, { status, headers }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(async () => {
  vi.resetModules();
  server = await import("./invite-check.server");
});
afterEach(() => vi.unstubAllGlobals());

describe("429 origin evidence recorded by the site's server", () => {
  it("global Discord 429 at ~1 req/s is attributed to the shared outbound address, with raw headers", async () => {
    const fetchFn = stubFetch(
      429,
      '{"message":"You are being rate limited.","retry_after":1.2,"global":true}',
      {
        "content-type": "application/json",
        "retry-after": "2",
        "x-ratelimit-global": "true",
        "x-ratelimit-scope": "global",
        server: "cloudflare",
        "cf-ray": "abc123-GRU",
      },
    );
    const r = await server.checkInviteOnDiscord("ab", key());
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(r.limitLayer).toBe("discord_api");
    expect(r.limitGlobal).toBe(true);
    expect(r.limitHeaders).toMatchObject({
      status: 429,
      retryAfter: "2",
      bodyRetryAfter: 1.2,
      bodyGlobal: true,
      scope: "global",
      global: "true",
      server: "cloudflare",
      cfRay: "abc123-GRU",
      cfMitigated: null,
      html: false,
      isolateSent1s: 1,
    });
    expect(r.reason).toContain("outro tráfego que compartilha o mesmo endereço");
    // Survives normalization (what the scanner stores in diagnostics).
    expect(normalizeCheckResult("ab", r).limitHeaders?.cfRay).toBe("abc123-GRU");
  });

  it("per-route 429 (scope user) is reported as the invite route limit, not global", async () => {
    stubFetch(429, '{"retry_after":0.5,"global":false}', {
      "content-type": "application/json",
      "x-ratelimit-scope": "user",
      "x-ratelimit-bucket": "b1",
    });
    const r = await server.checkInviteOnDiscord("ab", key());
    expect(r.limitGlobal).toBe(false);
    expect(r.limitHeaders?.bucket).toBe("b1");
    expect(r.reason).toContain("limite da rota de convites");
  });

  it("cf-mitigated marker → Cloudflare edge block even if a retry_after is present", async () => {
    stubFetch(429, '{"retry_after":1}', {
      "content-type": "application/json",
      "cf-mitigated": "challenge",
    });
    const r = await server.checkInviteOnDiscord("ab", key());
    expect(r.limitLayer).toBe("cloudflare_edge");
    expect(r.limitHeaders?.cfMitigated).toBe("challenge");
    expect(r.reason).toContain("proteção Cloudflare");
  });

  it("a retry_after alone never makes a 429 'global'", async () => {
    stubFetch(429, '{"retry_after":1}', { "content-type": "application/json" });
    const r = await server.checkInviteOnDiscord("ab", key());
    expect(r.limitGlobal).toBeNull();
    expect(r.reason).not.toContain("GLOBAL");
  });

  it("while the 429 block is active the next code is NOT sent to Discord", async () => {
    const fetchFn = stubFetch(429, '{"retry_after":1,"global":true}', {
      "content-type": "application/json",
    });
    await server.checkInviteOnDiscord("ab", key());
    const second = await server.checkInviteOnDiscord("ac", key());
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(second).toMatchObject({ discordQueried: false, errorKind: "app_block" });
  });
});

describe("hosting limit in front of the site's server", () => {
  it("HTTP 429 from the host is a rate limit with the host's Retry-After, Discord not queried", async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response("<html>Too Many Requests</html>", {
          status: 429,
          headers: { "content-type": "text/html", "retry-after": "20", server: "cloudflare" },
        }),
    );
    const r = await checkInviteViaBackend({ data: { code: "ab" } }, fetchFn as typeof fetch);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({
      httpStatus: 429,
      discordQueried: false,
      errorKind: "app_block",
      retryAfterSeconds: 20,
      availability: "UNKNOWN",
    });
    expect(errorClassOf(r)).toBe("rate_limit");
    expect(rateLimitSourceOf(r)).toBe("app_block");
    expect(r.limitHeaders?.html).toBe(true);
  });

  it("a 500 from the site's server stays an app failure, not a rate limit", async () => {
    const fetchFn = vi.fn(async () => Response.json({ error: "x" }, { status: 500 }));
    const r = await checkInviteViaBackend({ data: { code: "ab" } }, fetchFn as typeof fetch);
    expect(r.errorKind).toBe("app_error");
    expect(r.httpStatus).toBeNull();
  });
});
