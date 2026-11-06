/**
 * Simulated multi-isolate production + HTTP 429 (no real Discord traffic).
 * Each `vi.resetModules()` import of invite-check.server is a separate Worker
 * isolate with its own in-memory limiter, exactly like separate instances in
 * production. Proves what is and is not global, and that Retry-After /
 * retry_after are honored in full with no request sent during a block.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cooldownForResult, runVerificationQueue, type CheckResult } from "./check-rules";
import { checkInviteViaBackend } from "./invite-backend";
import { toCompact, type ResultsMap } from "./scanner";

type Isolate = typeof import("./invite-check.server");
async function newIsolate(): Promise<Isolate> {
  vi.resetModules();
  return import("./invite-check.server");
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
const globalLimit = (retryAfterBody: number, header?: string) => () =>
  json(
    429,
    { message: "You are being rate limited.", retry_after: retryAfterBody, global: true },
    header
      ? { "retry-after": header, "x-ratelimit-scope": "global" }
      : { "x-ratelimit-scope": "global" },
  );
const notFound = () => json(404, { message: "Unknown Invite", code: 10006 });

let replies: Array<() => Response>;
let discordCalls: number[];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(Date.UTC(2031, 0, 1)));
  discordCalls = [];
  replies = [];
  vi.stubGlobal("fetch", async () => {
    discordCalls.push(Date.now());
    const next = replies.shift();
    if (!next) throw new TypeError("fetch failed");
    return next();
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("HTTP 429 global across simulated instances", () => {
  it("uses the longest of Retry-After and retry_after and blocks its own isolate for all of it", async () => {
    const a = await newIsolate();
    replies = [globalLimit(30, "45")];
    const r = await a.checkInviteOnDiscord("aa", "visitor-1");
    expect(r.httpStatus).toBe(429);
    expect(r.limitScope).toBe("global");
    expect(r.retryAfterSeconds).toBe(45);
    expect(r.blockedForSeconds).toBeGreaterThanOrEqual(45);

    // Any visitor, 44 s later, on the same isolate: nothing is sent to Discord.
    vi.advanceTimersByTime(44_000);
    const again = await a.checkInviteOnDiscord("ab", "visitor-2");
    expect(again.discordQueried).toBe(false);
    expect(discordCalls).toHaveLength(1);
  });

  it("an HTTP-date Retry-After is honored in full", async () => {
    const a = await newIsolate();
    const date = new Date(Date.now() + 120_000).toUTCString();
    replies = [globalLimit(10, date)];
    const r = await a.checkInviteOnDiscord("ac", "visitor-1");
    expect(r.retryAfterSeconds).toBeGreaterThanOrEqual(119);
    expect(r.blockedForSeconds).toBeGreaterThanOrEqual(119);
  });

  it("documents the limit: an isolate's memory is not a global control", async () => {
    const a = await newIsolate();
    replies = [globalLimit(60)];
    await a.checkInviteOnDiscord("ad", "visitor-1");
    const b = await newIsolate();
    replies = [notFound];
    // Isolate B never saw A's 429, so the server alone would send this request.
    const r = await b.checkInviteOnDiscord("ae", "visitor-2");
    expect(r.discordQueried).toBe(true);
    expect(discordCalls).toHaveLength(2);
  });

  it("the browser queue stops on the first global 429 even when every request hits a different isolate, then resumes without losing progress", async () => {
    const isolates = [await newIsolate(), await newIsolate(), await newIsolate()];
    let turn = 0;
    const pageFetch = (async (url: string) => {
      const code = decodeURIComponent(url.split("/").pop()!);
      const iso = isolates[turn++ % isolates.length]!;
      return new Response(JSON.stringify(await iso.checkInviteOnDiscord(code, "visitor-1")), {
        status: 200,
      });
    }) as unknown as typeof fetch;
    const results: ResultsMap = {};
    const run = (codes: string[]) =>
      runVerificationQueue({
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
      });

    replies = [notFound, globalLimit(30), notFound, notFound, notFound];
    const first = await run(["ba", "bb", "bc", "bd"]);
    expect(first.reason).toBe("rate_limited");
    // Exactly one request reached Discord after the 429: none during the block.
    expect(discordCalls).toHaveLength(2);
    expect(Object.keys(results)).toEqual(["ba"]);
    const limit = first.limit as CheckResult;
    expect(limit.code).toBe("bb");
    const cooldown = cooldownForResult(limit, 1);
    expect(cooldown).toBeGreaterThanOrEqual(30);

    // Resume only after the full cooldown, starting with the pending code.
    vi.advanceTimersByTime(cooldown * 1000);
    const second = await run(["bb", "bc", "bd"]);
    expect(second.reason).toBe("done");
    expect(discordCalls[2]! - discordCalls[1]!).toBeGreaterThanOrEqual(30_000);
    expect(Object.keys(results).sort()).toEqual(["ba", "bb", "bc", "bd"]);
    expect(results["ba"]?.[1]).toBe(404);
  });
});
