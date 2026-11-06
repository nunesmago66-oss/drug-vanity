// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runVerificationQueue, type CheckResult } from "./check-rules";
import { readLimitEvidence } from "./invite-response";
import { LIMIT_WINDOW_MS, initialPace, validatePace } from "./pacing";
import {
  MAX_INLINE_LIMIT_RETRIES,
  describeDiag,
  emptyDiag,
  inlineLimitWaitMs,
  noteLimit,
  noteResponse,
  validateDiag,
} from "./rate-limit-manager";
import { BackgroundEngine } from "../../../scripts/background/engine";
import { emptyBackground } from "./background-protocol";

const ok = (code: string, http = 404): CheckResult => ({
  code,
  status: http === 200 ? "exists" : "not_found",
  httpStatus: http,
  retryAfterSeconds: null,
  reason: "",
  checkedAt: new Date().toISOString(),
  discordQueried: true,
});
/** The 429 Discord really sends on this route (measured): JSON body, scope user, sub-second wait. */
const route429 = (code: string, retry = 0.3, extra: Partial<CheckResult> = {}): CheckResult => ({
  code,
  status: "inconclusive",
  httpStatus: 429,
  retryAfterSeconds: retry,
  reason: "429",
  checkedAt: new Date().toISOString(),
  discordQueried: true,
  limitLayer: "discord_api",
  limitScope: "user",
  limitGlobal: false,
  errorKind: "rate_limit",
  ...extra,
});
const base = { batchLimit: Infinity, intervalMs: 0, shouldStop: () => false };

describe("central rate-limit manager", () => {
  it("1. normal operation: every code checked once, no waits beyond the pace", async () => {
    const check = vi.fn(async (c: string) => ok(c));
    const out = await runVerificationQueue({
      ...base,
      codes: ["aa", "ab", "ac"],
      sleep: async () => {},
      check,
    });
    expect(out.reason).toBe("done");
    expect(check).toHaveBeenCalledTimes(3);
  });

  it("2. first 429 (short, per route): waits what Discord asked and continues by itself", async () => {
    const sleeps: number[] = [];
    let first = true;
    const check = vi.fn(async (c: string) => {
      if (c === "ab" && first) {
        first = false;
        return route429(c, 0.3);
      }
      return ok(c);
    });
    const out = await runVerificationQueue({
      ...base,
      codes: ["aa", "ab", "ac"],
      sleep: async (ms) => void sleeps.push(ms),
      check,
    });
    expect(out.reason).toBe("done");
    expect(out.checked).toBe(3);
    expect(check.mock.calls.map((c) => c[0])).toEqual(["aa", "ab", "ab", "ac"]);
    // Wait after the 429 ≥ 0.3 s × 1.2 + 1 s margin (1360 ms) and ≥ the slowed pace.
    expect(sleeps[1]).toBeGreaterThanOrEqual(1360);
    expect(sleeps[1]).toBe(2500);
  });

  it("3. global limit stops into a cooldown instead of an inline retry", () => {
    expect(inlineLimitWaitMs(route429("aa", 0.5, { limitGlobal: true }), 0)).toBeNull();
    expect(inlineLimitWaitMs(route429("aa", 0.5, { limitScope: "global" }), 0)).toBeNull();
  });

  it("4. per-route limit is inline; Cloudflare edge or app block is not", () => {
    expect(inlineLimitWaitMs(route429("aa", 0.5), 0)).toBe(1600);
    expect(inlineLimitWaitMs(route429("aa", 0.5, { limitLayer: "cloudflare_edge" }), 0)).toBeNull();
    expect(inlineLimitWaitMs(route429("aa", 0.5, { discordQueried: false }), 0)).toBeNull();
    expect(inlineLimitWaitMs(route429("aa", 120), 0)).toBeNull();
  });

  it("5. Retry-After: uses the longest of header, body and reset-after", () => {
    const h = new Headers({
      "content-type": "application/json",
      "retry-after": "1",
      "x-ratelimit-scope": "user",
    });
    const ev = readLimitEvidence(h, '{"retry_after":0.3,"global":false}');
    expect(ev).toMatchObject({
      layer: "discord_api",
      scope: "user",
      global: false,
      retryAfterSeconds: 1,
    });
    // Browser view: headers are not exposed by CORS, only the body is readable.
    const b = readLimitEvidence(
      new Headers({ "content-type": "application/json" }),
      '{"retry_after":0.734,"global":false}',
    );
    expect(b).toMatchObject({ layer: "discord_api", retryAfterSeconds: 0.734 });
  });

  it("6. repeated 429 on the same code escalates to a stop after the inline limit", async () => {
    const check = vi.fn(async (c: string) => route429(c, 0.3));
    const out = await runVerificationQueue({
      ...base,
      codes: ["aa", "ab"],
      sleep: async () => {},
      check,
    });
    expect(out.reason).toBe("rate_limited");
    expect(check).toHaveBeenCalledTimes(MAX_INLINE_LIMIT_RETRIES + 1);
    expect(out.checked).toBe(0);
  });

  it("6b. an old slowdown expires: no 429 in 10 min resets the pace to normal", () => {
    const now = 100 * LIMIT_WINDOW_MS;
    const slow = { ...initialPace(), intervalMs: 30_000, limits: [now - LIMIT_WINDOW_MS - 1] };
    expect(validatePace(slow, now)?.intervalMs).toBe(2000);
    const recent = { ...slow, limits: [now - 1000] };
    expect(validatePace(recent, now)?.intervalMs).toBe(30_000);
  });

  it("network failure right after a 429 is a suspected edge block, not a quick retry", async () => {
    let n = 0;
    const check = vi.fn(async (c: string): Promise<CheckResult> => {
      n++;
      if (n === 1) return route429(c, 0.3, { limitGlobal: true });
      return {
        ...ok(c),
        status: "inconclusive",
        httpStatus: null,
        discordQueried: null,
        errorKind: "network",
      };
    });
    const first = await runVerificationQueue({
      ...base,
      codes: ["aa"],
      sleep: async () => {},
      check,
    });
    const out = await runVerificationQueue({
      ...base,
      codes: ["aa"],
      pace: first.pace,
      sleep: async () => {},
      check,
    });
    expect(out.reason).toBe("rate_limited");
    expect(out.rateLimitSource).toBe("suspected_edge");
    expect(check).toHaveBeenCalledTimes(2);
  });

  it("diagnostics never show a block as a result and tell Discord's wait from the app's", () => {
    const now = 1_000_000;
    let d = noteResponse(emptyDiag(now), route429("aa", 0.3), now);
    d = noteLimit(d, route429("aa", 0.3), { inline: false, appUntil: now + 5000 }, now);
    expect(d.requests).toBe(1);
    expect(d.limited).toBe(1);
    const view = describeDiag(d, {
      cooldownUntil: now + 5000,
      now: now + 1000,
      running: false,
      online: true,
    });
    expect(view.state).toBe("cooldown");
    expect(view.origin).toBe("Discord (API)");
    expect(view.remainingSeconds).toBe(4);
    expect(view.external).toMatch(/terminou/);
    const later = describeDiag(d, {
      cooldownUntil: now + 5000,
      now: now + 6000,
      running: false,
      online: true,
    });
    expect(later.normal).toBe(true);
    // A tampered saved record cannot break the view.
    expect(validateDiag({ v: 1, requests: -5, lastLimit: { origin: "nope" } }).requests).toBe(0);
  });
});

async function until(test: () => boolean, ms = 12_000) {
  const end = Date.now() + ms;
  while (!test()) {
    if (Date.now() > end) throw new Error("Timed out");
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe("recovery across restarts (real Node background engine)", () => {
  it("7/9/11. auto-resumes after the cooldown, also after a restart, keeping progress", async () => {
    const dir = await mkdtemp(join(tmpdir(), "rl-restart-"));
    const file = join(dir, "state.json");
    let blocked = true;
    const answer = async (c: string): Promise<CheckResult> =>
      c === "ab" && blocked ? route429(c, 0.2, { limitGlobal: true }) : ok(c);
    const engine = new BackgroundEngine(file, answer);
    try {
      await engine.start({
        ...emptyBackground(),
        codes: ["aa", "ab", "ac"],
        pace: { ...initialPace(), intervalMs: 1000 },
      });
      await until(() => engine.state.status === "rate_limited");
      expect(Object.keys(engine.state.results)).toEqual(["aa"]);
      expect(engine.state.diag?.limited).toBe(1);
      // Background restarts during the block (process shutdown keeps the status).
      await engine.shutdown();
      blocked = false;
      const restarted = new BackgroundEngine(file, answer);
      await restarted.load();
      expect(restarted.state.status).toBe("rate_limited");
      restarted.resume();
      await until(() => restarted.state.status === "done", 20_000);
      expect(Object.keys(restarted.state.results).sort()).toEqual(["aa", "ab", "ac"]);
      expect(restarted.state.diag?.recoveries).toBeGreaterThanOrEqual(1);
      await restarted.stop();
    } finally {
      await rm(dir, { recursive: true });
    }
  }, 30_000);

  it("8/10/12. a saved cooldown is shared: a second start during it is refused, nothing is sent", async () => {
    const dir = await mkdtemp(join(tmpdir(), "rl-shared-"));
    const check = vi.fn(async (c: string) => ok(c));
    const engine = new BackgroundEngine(join(dir, "state.json"), check);
    try {
      await expect(
        engine.start({ ...emptyBackground(), codes: ["aa"], cooldownUntil: Date.now() + 60_000 }),
      ).rejects.toThrow("limite de taxa");
      expect(check).not.toHaveBeenCalled();
      // While a run is active, the quick check cannot add a parallel request.
      await engine.start({
        ...emptyBackground(),
        codes: ["aa", "ab"],
        pace: { ...initialPace(), intervalMs: 1000 },
      });
      await expect(engine.quick("zz")).rejects.toThrow("Outra verificação");
      await until(() => engine.state.status === "done");
      await engine.stop();
    } finally {
      await rm(dir, { recursive: true });
    }
  });
});
