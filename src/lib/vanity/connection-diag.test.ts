import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeCheckResult, runVerificationQueue, type CheckResult } from "./check-rules";
import {
  checkInviteFromBrowser,
  describeError,
  probeFailure,
  withTimeout,
} from "./invite-check.browser";
import { connectionLabel, describeDiag, emptyDiag, noteResponse } from "./rate-limit-manager";

const base = (over: Partial<CheckResult>): CheckResult => ({
  code: "aad",
  status: "inconclusive",
  httpStatus: null,
  retryAfterSeconds: null,
  reason: "",
  checkedAt: new Date().toISOString(),
  ...over,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("connection failures are recorded precisely", () => {
  it("a failed fetch keeps the URL, layer, duration and original error", async () => {
    const failing = (async () => {
      throw new TypeError("Load failed");
    }) as unknown as typeof fetch;
    const r = await checkInviteFromBrowser({ data: { code: "aad" } }, failing);
    expect(r.errorKind).toBe("network");
    expect(r.httpStatus).toBeNull();
    expect(r.trace?.url).toBe("https://discord.com/api/v10/invites/aad?with_counts=false");
    expect(r.trace?.errorName).toBe("TypeError");
    expect(r.trace?.errorMessage).toBe("Load failed");
    expect(r.reason).toContain("Load failed");
    expect(normalizeCheckResult("aad", r).trace?.id).toBe(r.trace?.id);
  });

  it("Node's DNS cause code is part of the original error", () => {
    const err = new TypeError("fetch failed", {
      cause: { code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND discord.com" },
    });
    expect(describeError(err).message).toContain("ENOTFOUND");
  });

  it("probe: answer readable only opaquely means a CORS-less block, not a dead connection", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", { onLine: true });
    const opaqueOk = (async () => new Response(null)) as unknown as typeof fetch;
    const dead = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    expect(await probeFailure("https://discord.com/x", opaqueOk)).toBe("reachable_unreadable");
    expect(await probeFailure("https://discord.com/x", dead)).toBe("unreachable");
    vi.stubGlobal("navigator", { onLine: false });
    expect(await probeFailure("https://discord.com/x", opaqueOk)).toBe("offline");
  });

  it("works without AbortSignal.any (Safari < 17.4)", () => {
    const original = (AbortSignal as { any?: unknown }).any;
    (AbortSignal as { any?: unknown }).any = undefined;
    try {
      const outer = new AbortController();
      const s = withTimeout(outer.signal, 10_000);
      expect(s.aborted).toBe(false);
      outer.abort();
      expect(s.aborted).toBe(true);
    } finally {
      (AbortSignal as { any?: unknown }).any = original;
    }
  });
});

describe("diagnostic counters reflect real attempts", () => {
  it("counts a connection failure as started+sent but not as a Discord answer", () => {
    const d = noteResponse(emptyDiag(0), base({ errorKind: "network" }), 1000);
    expect(d.started).toBe(1);
    expect(d.sent).toBe(1);
    expect(d.httpResponses).toBe(0);
    expect(d.requests).toBe(0);
    expect(d.connFailures).toBe(1);
    expect(d.lastFailure?.kind).toBe("network");
  });

  it("separates CORS blocks, timeouts, app failures and HTTP answers", () => {
    let d = emptyDiag(0);
    d = noteResponse(d, base({ errorKind: "cors_blocked", discordQueried: true }), 1);
    d = noteResponse(d, base({ errorKind: "timeout" }), 2);
    d = noteResponse(d, base({ errorKind: "app_error" }), 3);
    d = noteResponse(d, base({ status: "not_found", httpStatus: 404, discordQueried: true }), 4);
    expect([d.corsBlocked, d.timeouts, d.appFailures, d.httpResponses]).toEqual([1, 1, 1, 1]);
    expect(d.started).toBe(4);
    expect(d.sent).toBe(3); // the app failure never left the device
    expect(d.requests).toBe(2); // the 404 and the unreadable answer from discord.com
  });

  it("never says the connection is fine when only the page loaded or the last attempt failed", () => {
    expect(connectionLabel(emptyDiag(0), true)).not.toMatch(/online|OK/i);
    const failed = noteResponse(emptyDiag(0), base({ errorKind: "network" }), Date.now());
    expect(connectionLabel(failed, true)).toMatch(/^Falhando/);
    const view = describeDiag(failed, {
      cooldownUntil: 0,
      now: Date.now(),
      running: false,
      online: true,
    });
    expect(view.normal).toBe(false);
  });
});

describe("queue reaction", () => {
  it("a CORS-less answer stops into a cooldown instead of burning retries", async () => {
    let calls = 0;
    const out = await runVerificationQueue({
      codes: ["aad", "aae"],
      batchLimit: Infinity,
      intervalMs: 0,
      sleep: async () => {},
      shouldStop: () => false,
      check: async (code) => {
        calls++;
        return base({ code, errorKind: "cors_blocked", discordQueried: true });
      },
    });
    expect(calls).toBe(1);
    expect(out.reason).toBe("rate_limited");
    expect(out.rateLimitSource).toBe("blocked_response");
    expect(out.checked).toBe(0); // nothing saved: the code stays pending
  });
});
