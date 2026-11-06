import { describe, expect, it } from "vitest";
import { initialPace } from "./pacing";
import { runVerificationQueue, type CheckResult } from "./check-rules";
import { backendUrl, checkInviteViaBackend } from "./invite-backend";
import { isChallengePage } from "./invite-check.server";
import { isSuspectedEdgeBlock } from "./rate-limit-manager";
import { allowedOrigin } from "@/routes/api/public/invites.$code";

const reply = (status: number, body: unknown) =>
  (async (url: string) => {
    expect(url).toBe(backendUrl("aad"));
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;

describe("browser talks to the site's backend, never to discord.com", () => {
  it("calls the same-origin endpoint and returns the backend's Discord evidence", async () => {
    const urls: string[] = [];
    const f = (async (url: string) => {
      urls.push(url);
      return new Response(
        JSON.stringify({ code: "aad", status: "not_found", httpStatus: 404, reason: "x" }),
      );
    }) as unknown as typeof fetch;
    const r = await checkInviteViaBackend({ data: { code: "aad" } }, f);
    expect(urls).toEqual(["/api/public/invites/aad"]);
    expect(r.httpStatus).toBe(404);
  });

  it("a lost connection to the backend is a network failure, not a 429 and not a result", async () => {
    const f = (async () => {
      throw new TypeError("Load failed");
    }) as unknown as typeof fetch;
    const r = await checkInviteViaBackend({ data: { code: "aad" } }, f);
    expect(r.errorKind).toBe("network");
    expect(r.httpStatus).toBeNull();
    expect(r.availability).toBe("UNKNOWN");
    expect(r.trace?.errorMessage).toBe("Load failed");
    // Even right after a 429, losing our own backend is not treated as a Discord block.
    const pace = { ...initialPace(), limits: [Date.now()] };
    expect(isSuspectedEdgeBlock(r, pace)).toBe(false);
  });

  it("a backend error page is an app failure, never a Discord answer", async () => {
    const r = await checkInviteViaBackend({ data: { code: "aad" } }, reply(500, { error: "boom" }));
    expect(r.errorKind).toBe("app_error");
    expect(r.status).toBe("inconclusive");
  });
});

describe("backend endpoint rules", () => {
  it("detects Cloudflare HTML challenge pages on non-429 statuses only", () => {
    expect(isChallengePage(403, "text/html; charset=UTF-8", "<!DOCTYPE html>")).toBe(true);
    expect(isChallengePage(404, "text/html", "<html>")).toBe(false);
    expect(isChallengePage(403, "application/json", '{"message":"x"}')).toBe(false);
  });

  it("CORS only for the same origin and the project's Lovable hosts", () => {
    const req = "https://id-preview--x.lovable.app/api/public/invites/aad";
    expect(allowedOrigin("https://id-preview--x.lovable.app", req)).toBe(
      "https://id-preview--x.lovable.app",
    );
    expect(allowedOrigin("https://drug-url.lovable.app", req)).toBe("https://drug-url.lovable.app");
    expect(allowedOrigin("https://evil.example", req)).toBeNull();
    expect(allowedOrigin("http://x.lovable.app", req)).toBeNull();
    expect(allowedOrigin(null, req)).toBeNull();
  });

  it("an unreadable answer does not escalate the pace like a confirmed 429", async () => {
    const pace = initialPace();
    const out = await runVerificationQueue({
      codes: ["aad"],
      batchLimit: Infinity,
      intervalMs: 0,
      pace,
      sleep: async () => {},
      shouldStop: () => false,
      check: async (code): Promise<CheckResult> => ({
        code,
        status: "inconclusive",
        httpStatus: null,
        retryAfterSeconds: null,
        reason: "",
        checkedAt: new Date().toISOString(),
        errorKind: "cors_blocked",
        discordQueried: true,
      }),
    });
    expect(out.reason).toBe("rate_limited");
    expect(out.pace.limits).toEqual(pace.limits);
  });
});
