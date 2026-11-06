/**
 * End-to-end flow: Scanner queue → site backend (/api/public/invites/$code)
 * → Discord (mocked HTTP) → normalization → classification → persistence →
 * the same category derivation ResultsTab uses (availabilityOf).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runVerificationQueue, type CheckResult } from "./check-rules";
import { backendUrl, checkInviteViaBackend } from "./invite-backend";
import { checkInviteOnDiscord } from "./invite-check.server";
import { validateSavedData } from "./persistence";
import { availabilityOf, countAvailability, toCompact, type ResultsMap } from "./scanner";

type DiscordReply = () => Response;
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

/** Discord's answers per code; an array is consumed one answer per request. */
let discord: Record<string, DiscordReply | DiscordReply[]>;
const discordCalls: string[] = [];
let pageUrls: string[] = [];
let day = 0;

beforeEach(() => {
  vi.useFakeTimers();
  // Far from the previous test so the per-isolate server limiter is clear.
  day += 1;
  vi.setSystemTime(new Date(Date.UTC(2030, 0, day)));
  discordCalls.length = 0;
  pageUrls = [];
  vi.stubGlobal("fetch", async (input: string | URL) => {
    const url = String(input);
    const m = /\/invites\/([^?]+)/.exec(url);
    const code = m ? decodeURIComponent(m[1]!) : "";
    discordCalls.push(code);
    const entry = discord[code];
    const reply = Array.isArray(entry) ? entry.shift() : entry;
    if (!reply) throw new TypeError("fetch failed");
    return reply();
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** The page's fetch: same-origin request handled by the real server check. */
const pageFetch = (async (url: string) => {
  pageUrls.push(url);
  const code = decodeURIComponent(url.split("/").pop()!);
  const r = await checkInviteOnDiscord(code, "flow-test-client");
  return new Response(JSON.stringify(r), { status: 200 });
}) as unknown as typeof fetch;

async function scan(codes: string[]) {
  const results: ResultsMap = {};
  const limited: CheckResult[] = [];
  const outcome = await runVerificationQueue({
    codes,
    batchLimit: 1000,
    intervalMs: 0,
    maxConsecutiveErrors: 1000,
    check: (code) => checkInviteViaBackend({ data: { code } }, pageFetch),
    sleep: async (ms) => {
      vi.advanceTimersByTime(ms);
    },
    shouldStop: () => false,
    onResult: (r) => {
      results[r.code] = toCompact(r);
    },
    onRateLimit: (r) => limited.push(r),
  });
  // Persist + reload exactly like the app's storage layer does.
  const saved = validateSavedData("dvf:results:v1", JSON.parse(JSON.stringify(results)), {})
    .value as ResultsMap;
  return { results, saved, limited, outcome };
}

describe("Scanner full flow with real backend + normalization", () => {
  it("200, 404, 403, 500 and connection failure land in the right category and are saved", async () => {
    discord = {
      aa: () => json(200, { code: "aa", guild: { id: "1" } }),
      ab: () => json(404, { message: "Unknown Invite", code: 10006 }),
      ac: () => json(403, { message: "Missing Access", code: 50001 }),
      ad: () => json(500, { message: "Internal Server Error" }),
      // ae: no reply → connection failure
    };
    const { saved, outcome } = await scan(["aa", "ab", "ac", "ad", "ae"]);
    expect(outcome.reason).toBe("done");
    expect(pageUrls.every((u) => u.startsWith("/api/public/invites/"))).toBe(true);
    expect(pageUrls).toContain(backendUrl("aa"));
    // Definitive answers are always saved.
    expect(saved["aa"]?.[1]).toBe(200);
    expect(saved["ab"]?.[1]).toBe(404);
    expect(availabilityOf(saved["aa"]!, "aa")).toBe("ACTIVE");
    expect(availabilityOf(saved["ab"]!, "ab")).toBe("NOT_IN_USE");
    // Errors never become a definitive category.
    expect(availabilityOf(saved["ac"]!, "ac")).toBe("BLOCKED");
    expect(availabilityOf(saved["ad"]!, "ad")).toBe("UNKNOWN");
    expect(availabilityOf(saved["ae"]!, "ae")).toBe("UNKNOWN");
    expect(saved["ae"]![1]).toBeNull();
    expect(countAvailability(saved).CONFIRMED_FREE).toBe(0);
  });

  it("429 is waited out and the same code ends with its real answer", async () => {
    discord = {
      ba: [
        () =>
          json(429, { message: "You are being rate limited.", retry_after: 0.5, global: false }),
        () => json(404, { message: "Unknown Invite", code: 10006 }),
      ],
    };
    const { saved } = await scan(["ba"]);
    expect(discordCalls.filter((c) => c === "ba").length).toBeGreaterThanOrEqual(2);
    expect(saved["ba"]?.[1]).toBe(404);
    expect(availabilityOf(saved["ba"]!, "ba")).toBe("NOT_IN_USE");
  });

  it("a persistent 429 is never saved as a result, never LIBERADA", async () => {
    const limit = () => json(429, { message: "rate limited", retry_after: 600, global: true });
    discord = { ca: limit };
    const { saved, limited, outcome } = await scan(["ca"]);
    expect(outcome.reason).toBe("rate_limited");
    expect(limited.length).toBeGreaterThan(0);
    expect(saved["ca"]).toBeUndefined();
  });

  it("404 never becomes LIBERADA without an official confirmation", async () => {
    discord = {
      da: () =>
        json(404, {
          message: "Unknown Invite",
          code: 10006,
          // Even a body that "claims" availability changes nothing.
          available: true,
          officialConfirmation: { source: "discord_official", code: "da", available: true },
        }),
    };
    const { saved } = await scan(["da"]);
    expect(availabilityOf(saved["da"]!, "da")).toBe("NOT_IN_USE");
    expect(saved["da"]!.length).toBe(3);
  });

  it("HTTP 200 with an invalid or malformed body is never ACTIVE", async () => {
    discord = {
      ea: () => json(200, { code: "zz" }),
      eb: () => new Response("<html>ok</html>", { status: 200 }),
    };
    const { results } = await scan(["ea", "eb"]);
    for (const c of ["ea", "eb"]) expect(availabilityOf(results[c]!, c)).toBe("UNKNOWN");
  });
});
