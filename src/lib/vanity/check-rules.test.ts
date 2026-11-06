import { describe, expect, it, vi } from "vitest";

import {
  MIN_INTERVAL_MS,
  classifyHttpStatus,
  cooldownSecondsFor,
  isValidCode,
  normalizeCheckResult,
  normalizeCode,
  parseRetryAfter,
  rateLimitSourceOf,
  runVerificationQueue,
  toCsv,
  type CheckResult,
} from "./check-rules";

const res = (
  code: string,
  httpStatus: number | null,
  retry: number | null = null,
): CheckResult => ({
  code,
  status: classifyHttpStatus(httpStatus),
  httpStatus,
  retryAfterSeconds: retry,
  reason: "",
  checkedAt: "2026-01-01T00:00:00Z",
});

describe("classifyHttpStatus", () => {
  it("200 is an existing invite", () => expect(classifyHttpStatus(200)).toBe("exists"));
  it("404 is not found", () => expect(classifyHttpStatus(404)).toBe("not_found"));
  it("429 is inconclusive", () => expect(classifyHttpStatus(429)).toBe("inconclusive"));
  it("other HTTP codes are inconclusive", () => {
    expect(classifyHttpStatus(500)).toBe("inconclusive");
    expect(classifyHttpStatus(403)).toBe("inconclusive");
  });
  it("network failure is inconclusive", () =>
    expect(classifyHttpStatus(null)).toBe("inconclusive"));
});

describe("limits", () => {
  it("never goes below the 1 s request floor", () => expect(MIN_INTERVAL_MS).toBe(1000));
  it("a too-fast fixed choice is clamped and the automatic pace starts at 2 s", async () => {
    const sleep = vi.fn(async () => {});
    await runVerificationQueue({
      codes: ["aa", "bb"],
      batchLimit: 10,
      intervalMs: 500,
      sleep,
      shouldStop: () => false,
      check: async (c) => res(c, 404),
    });
    expect(sleep).toHaveBeenCalledWith(2000);
  });
});

describe("parseRetryAfter", () => {
  it("reads the header in seconds", () => expect(parseRetryAfter("5")).toBe(5));
  it("uses the larger of header and body", () => expect(parseRetryAfter("2", 7.5)).toBe(7.5));
  it("parses an HTTP-date Retry-After value", () => {
    const now = Date.parse("2026-11-06T12:00:00Z");
    expect(parseRetryAfter("Fri, 06 Nov 2026 12:00:20 GMT", undefined, now)).toBe(20);
  });
  it("never returns a negative wait for an expired HTTP date", () => {
    const now = Date.parse("2026-11-06T12:00:30Z");
    expect(parseRetryAfter("Fri, 06 Nov 2026 12:00:20 GMT", undefined, now)).toBe(0);
  });
  it("returns null when absent", () => expect(parseRetryAfter(null)).toBeNull());
});

describe("codes", () => {
  it("accepts 2 and 3 characters only", () => {
    expect(isValidCode("gg")).toBe(true);
    expect(isValidCode("vip")).toBe(true);
    expect(isValidCode("g")).toBe(false);
    expect(isValidCode("abcd")).toBe(false);
  });
  it("normalizes invite links and case", () => {
    expect(normalizeCode(" https://discord.gg/VIP ")).toBe("vip");
  });
});

describe("runVerificationQueue", () => {
  const base = { sleep: vi.fn(async () => {}), shouldStop: () => false };

  it("checks sequentially with the chosen wait between requests", async () => {
    const sleep = vi.fn(async () => {});
    const order: string[] = [];
    const out = await runVerificationQueue({
      ...base,
      sleep,
      codes: ["aa", "bb", "cc"],
      batchLimit: 30,
      intervalMs: 3000,
      check: async (c) => {
        order.push(c);
        return res(c, 404);
      },
    });
    expect(out.reason).toBe("done");
    expect(order).toEqual(["aa", "bb", "cc"]);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(3000);
  });

  it("stops at the first 429 and reports Retry-After", async () => {
    const check = vi.fn(async (c: string) => (c === "bb" ? res(c, 429, 12) : res(c, 200)));
    const out = await runVerificationQueue({
      ...base,
      codes: ["aa", "bb", "cc"],
      batchLimit: 30,
      intervalMs: 3000,
      check,
    });
    expect(out).toMatchObject({
      reason: "rate_limited",
      checked: 1,
      retryAfterSeconds: 12,
      rateLimitSource: "unknown",
    });
    expect(check).toHaveBeenCalledTimes(2);
  });

  it("auto-pauses after the batch size", async () => {
    const check = vi.fn(async (c: string) => res(c, 404));
    const out = await runVerificationQueue({
      ...base,
      codes: ["aa", "bb", "cc"],
      batchLimit: 1,
      intervalMs: 3000,
      check,
    });
    expect(out.reason).toBe("batch");
    expect(check).toHaveBeenCalledTimes(1);
  });

  it("stops when the user presses stop", async () => {
    let stop = false;
    const check = vi.fn(async (c: string) => {
      stop = true;
      return res(c, 200);
    });
    const out = await runVerificationQueue({
      ...base,
      shouldStop: () => stop,
      codes: ["aa", "bb"],
      batchLimit: 30,
      intervalMs: 3000,
      check,
    });
    expect(out.reason).toBe("stopped");
    expect(check).toHaveBeenCalledTimes(1);
  });
});

it("pauses after 3 consecutive errors", async () => {
  const check = vi.fn(async (c: string) => res(c, 500));
  const out = await runVerificationQueue({
    codes: ["aa", "bb", "cc", "dd"],
    batchLimit: 30,
    intervalMs: 3000,
    sleep: async () => {},
    shouldStop: () => false,
    check,
  });
  expect(out.reason).toBe("errors");
  // Each 500 is temporary: 2 retries per code before recording it (3 calls × 3 codes).
  expect(check).toHaveBeenCalledTimes(9);
});

describe("normalizeCheckResult", () => {
  it("turns a missing server reply into an error, not a crash", () => {
    expect(normalizeCheckResult("aa", undefined).status).toBe("inconclusive");
  });
  it("rejects a reply for a different code", () => {
    expect(normalizeCheckResult("aa", res("bb", 200)).status).toBe("inconclusive");
  });
  it("HTTP 404 always stays not found", () => {
    const r = normalizeCheckResult("aa", { ...res("aa", 404), status: "exists" });
    expect(r.status).toBe("not_found");
  });
  it("keeps 429 Retry-After", () => {
    const r = normalizeCheckResult("aa", res("aa", 429, 20));
    expect(r).toMatchObject({ status: "inconclusive", httpStatus: 429, retryAfterSeconds: 20 });
  });
});

describe("toCsv", () => {
  it("escapes commas and quotes", () => {
    expect(toCsv(["a", "b"], [["x,y", 'say "hi"']])).toBe('a,b\r\n"x,y","say ""hi"""');
  });
  it("neutralizes spreadsheet formulas in exported cells", () => {
    expect(toCsv(["value"], [["=1+1"], ["  +SUM(A1:A2)"], ["-cmd"], ["@evil"]])).toBe(
      "value\r\n'=1+1\r\n'  +SUM(A1:A2)\r\n'-cmd\r\n'@evil",
    );
  });
});

describe("429 origin: Discord vs preventive app block", () => {
  it("a 429 that contacted Discord is labelled as coming from Discord", () => {
    const r = normalizeCheckResult("aa", { ...res("aa", 429, 5), discordQueried: true });
    expect(rateLimitSourceOf(r)).toBe("discord");
  });
  it("a preventive block (Discord not contacted) is never labelled as a Discord 429", () => {
    const r = normalizeCheckResult("aa", { ...res("aa", 429, 5), discordQueried: false });
    expect(rateLimitSourceOf(r)).toBe("app_block");
  });
  it("a 429 without origin information stays unknown", () => {
    expect(rateLimitSourceOf(normalizeCheckResult("aa", res("aa", 429, 5)))).toBe("unknown");
  });
  it("still stops at the first 429 and reports its origin", async () => {
    const check = vi.fn(async (c: string) => ({ ...res(c, 429, 7), discordQueried: false }));
    const out = await runVerificationQueue({
      codes: ["aa", "bb", "cc"],
      batchLimit: 10,
      intervalMs: 3000,
      sleep: async () => {},
      shouldStop: () => false,
      check,
    });
    expect(out).toMatchObject({
      reason: "rate_limited",
      retryAfterSeconds: 7,
      rateLimitSource: "app_block",
      checked: 0,
    });
    expect(check).toHaveBeenCalledTimes(1);
  });
});

describe("cooldown after HTTP 429", () => {
  it("honors the full Retry-After plus a safety margin, rounded up", () => {
    expect(cooldownSecondsFor(120)).toBe(145);
    expect(cooldownSecondsFor(30.2)).toBe(38);
  });
  it("defaults to 60 s plus margin when Retry-After is missing or malformed", () => {
    expect(cooldownSecondsFor(null)).toBe(73);
    expect(cooldownSecondsFor(1e12)).toBe(73);
  });
  it("never goes below the 1 s request floor", () => {
    expect(cooldownSecondsFor(0.5)).toBe(2);
  });
});
