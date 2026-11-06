import { describe, expect, it } from "vitest";
import {
  MIN_INTERVAL_MS,
  cooldownForResult,
  errorClassOf,
  runVerificationQueue,
  sharedWaitMs,
  type CheckResult,
} from "./check-rules";
import { PACE_FLOOR_MS, PACE_START_MS, initialPace } from "./pacing";
import { inlineLimitWaitMs } from "./rate-limit-manager";

const res = (code: string, extra: Partial<CheckResult> = {}): CheckResult => ({
  code,
  status: "not_found",
  httpStatus: 404,
  retryAfterSeconds: null,
  reason: "",
  checkedAt: new Date(0).toISOString(),
  discordQueried: true,
  ...extra,
});

const limited = (code: string, extra: Partial<CheckResult> = {}) =>
  res(code, {
    status: "inconclusive",
    httpStatus: 429,
    errorKind: "rate_limit",
    limitLayer: "discord_api",
    ...extra,
  } as Partial<CheckResult>);

function harness(answers: Record<string, CheckResult[]>) {
  const calls: string[] = [];
  const sleeps: number[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  return {
    calls,
    sleeps,
    maxInFlight: () => maxInFlight,
    check: async (code: string) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      calls.push(code);
      await Promise.resolve();
      inFlight--;
      return answers[code]?.shift() ?? res(code);
    },
    sleep: async (ms: number) => {
      sleeps.push(ms);
    },
  };
}

describe("conservative default pace", () => {
  it("never goes faster than 1.5 s and starts at 3 s", () => {
    expect(PACE_FLOOR_MS).toBe(1500);
    expect(MIN_INTERVAL_MS).toBe(1500);
    expect(PACE_START_MS).toBe(3000);
  });

  it("shared wait honors the last request of any tab and a pending cooldown", () => {
    expect(sharedWaitMs({ now: 10_000, lastCheckAt: 9_000, cooldownUntil: 0, paceIntervalMs: 3000 })).toBe(2000);
    expect(sharedWaitMs({ now: 10_000, lastCheckAt: 9_900, cooldownUntil: 0, paceIntervalMs: 100 })).toBe(1400);
    expect(sharedWaitMs({ now: 10_000, lastCheckAt: 0, cooldownUntil: 70_000, paceIntervalMs: 3000 })).toBe(60_000);
    expect(sharedWaitMs({ now: 10_000, lastCheckAt: 0, cooldownUntil: 0, paceIntervalMs: 3000 })).toBe(0);
  });
});

describe("verification queue", () => {
  it("sends one request at a time, never duplicates codes, and spaces every request", async () => {
    const h = harness({});
    const out = await runVerificationQueue({
      codes: ["ab", "cd", "ab", "ef", "cd"],
      batchLimit: Infinity,
      intervalMs: 0,
      pace: initialPace(),
      check: h.check,
      sleep: h.sleep,
      shouldStop: () => false,
    });
    expect(out.reason).toBe("done");
    expect(h.calls).toEqual(["ab", "cd", "ef"]);
    expect(h.maxInFlight()).toBe(1);
    expect(h.sleeps.length).toBe(2);
    for (const s of h.sleeps) expect(s).toBeGreaterThanOrEqual(PACE_FLOOR_MS);
  });

  it("cancel stops before the next request and keeps the remaining codes unsent", async () => {
    const h = harness({});
    let stop = false;
    const out = await runVerificationQueue({
      codes: ["ab", "cd", "ef"],
      batchLimit: Infinity,
      intervalMs: 0,
      check: h.check,
      sleep: async (ms) => {
        h.sleeps.push(ms);
        stop = true;
      },
      shouldStop: () => stop,
      onResult: () => {},
    });
    expect(out.reason).toBe("stopped");
    expect(h.calls).toEqual(["ab"]);
  });

  it("a global 429 stops everything immediately: no retry, no next code", async () => {
    const h = harness({ cd: [limited("cd", { limitGlobal: true, retryAfterSeconds: 40 })] });
    const out = await runVerificationQueue({
      codes: ["ab", "cd", "ef"],
      batchLimit: Infinity,
      intervalMs: 0,
      check: h.check,
      sleep: h.sleep,
      shouldStop: () => false,
    });
    expect(out.reason).toBe("rate_limited");
    expect(h.calls).toEqual(["ab", "cd"]);
    expect(out.retryAfterSeconds).toBe(40);
  });

  it("a 429 of uncertain origin (no layer) also stops instead of retrying", async () => {
    const h = harness({ ab: [limited("ab", { limitLayer: undefined, retryAfterSeconds: 2 })] });
    const out = await runVerificationQueue({
      codes: ["ab", "cd"],
      batchLimit: Infinity,
      intervalMs: 0,
      check: h.check,
      sleep: h.sleep,
      shouldStop: () => false,
    });
    expect(out.reason).toBe("rate_limited");
    expect(h.calls).toEqual(["ab"]);
  });

  it("a short per-route 429 waits the full retry_after plus margin before retrying the same code once", async () => {
    const h = harness({ ab: [limited("ab", { limitScope: "user", retryAfterSeconds: 5 })] });
    const out = await runVerificationQueue({
      codes: ["ab"],
      batchLimit: Infinity,
      intervalMs: 0,
      check: h.check,
      sleep: h.sleep,
      shouldStop: () => false,
    });
    expect(out.reason).toBe("done");
    expect(h.calls).toEqual(["ab", "ab"]);
    expect(h.sleeps[0]).toBeGreaterThanOrEqual(5000);
    expect(h.sleeps[0]).toBe(7000); // 5 s × 1.2 + 1 s
  });
});

describe("Retry-After handling", () => {
  it("cooldown is never shorter than Discord's retry_after", () => {
    for (const r of [0.5, 3, 40, 600]) {
      expect(cooldownForResult(limited("ab", { retryAfterSeconds: r }))).toBeGreaterThanOrEqual(r);
    }
  });
  it("global limits are never waited inline", () => {
    expect(inlineLimitWaitMs(limited("ab", { limitGlobal: true, retryAfterSeconds: 1 }), 0)).toBeNull();
    expect(inlineLimitWaitMs(limited("ab", { limitLayer: "cloudflare_edge", retryAfterSeconds: 1 } as Partial<CheckResult>), 0)).toBeNull();
  });
});

describe("classification never invents an answer", () => {
  it("429, network, Cloudflare challenge and timeout stay inconclusive", () => {
    const cases: Partial<CheckResult>[] = [
      { httpStatus: 429, errorKind: "rate_limit" },
      { httpStatus: null, errorKind: "network", discordQueried: null },
      { httpStatus: 403, errorKind: "cloudflare" } as Partial<CheckResult>,
      { httpStatus: null, errorKind: "timeout", discordQueried: null },
    ];
    for (const c of cases) {
      const r = res("ab", { status: "inconclusive", ...c });
      expect(r.status).toBe("inconclusive");
      expect(errorClassOf(r)).not.toBe("definitive");
    }
  });
});
