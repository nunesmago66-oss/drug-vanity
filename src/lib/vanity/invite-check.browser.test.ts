import { describe, expect, it, vi } from "vitest";

import { checkInviteFromBrowser } from "./invite-check.browser";

const respond = (status: number, body = "", headers: Record<string, string> = {}) =>
  vi.fn(async () => new Response(body || null, { status, headers })) as unknown as typeof fetch;

describe("checkInviteFromBrowser", () => {
  it("calls Discord directly without cookies", async () => {
    const f = respond(404);
    const r = await checkInviteFromBrowser({ data: { code: "AbC" } }, f);
    const call = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    const [url, init] = call!;
    expect(url).toBe("https://discord.com/api/v10/invites/abc?with_counts=false");
    expect(init.credentials).toBe("omit");
    expect(r.status).toBe("not_found");
    expect(r.discordQueried).toBe(true);
  });

  it("maps 200 to exists", async () => {
    const r = await checkInviteFromBrowser({ data: { code: "ab" } }, respond(200, "{}"));
    expect(r.status).toBe("exists");
  });

  it("reads retry_after from a 429 JSON body", async () => {
    const r = await checkInviteFromBrowser(
      { data: { code: "ab" } },
      respond(429, JSON.stringify({ retry_after: 12.5, global: true }), {
        "content-type": "application/json",
      }),
    );
    expect(r.httpStatus).toBe(429);
    expect(r.errorKind).toBe("rate_limit");
    expect(r.retryAfterSeconds).toBe(12.5);
    expect(r.limitGlobal).toBe(true);
    expect(r.limitLayer).toBe("discord_api");
  });

  it("treats a blocked/failed request as a temporary network error, not a result", async () => {
    const f = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    const r = await checkInviteFromBrowser({ data: { code: "ab" } }, f);
    expect(r.status).toBe("inconclusive");
    expect(r.errorKind).toBe("network");
  });

  it("rejects invalid codes before any request", async () => {
    const f = respond(404);
    await expect(checkInviteFromBrowser({ data: { code: "toolong" } }, f)).rejects.toThrow();
    expect(f).not.toHaveBeenCalled();
  });
});
