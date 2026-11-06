import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import type { CheckResult } from "./check-rules";
import { apiBase, backendUrl } from "./invite-backend";
import { createApi, createQueue, readConfig } from "../../../scripts/invite-api/server";

// No request reaches Discord: the check function is simulated.
const ok = (code: string): CheckResult => ({
  code,
  status: "not_found",
  httpStatus: 404,
  retryAfterSeconds: null,
  reason: "",
  checkedAt: new Date().toISOString(),
  discordQueried: true,
  availability: "NOT_IN_USE",
});

describe("frontend backend selection", () => {
  it("unset → same-origin route; set → external base, one URL only", () => {
    expect(apiBase(undefined)).toBe("");
    expect(backendUrl("ab", "")).toBe("/api/public/invites/ab");
    expect(apiBase("https://api.x.com/")).toBe("https://api.x.com");
    expect(backendUrl("ab", "https://api.x.com")).toBe("https://api.x.com/api/public/invites/ab");
    expect(apiBase("javascript:alert(1)")).toBe("");
  });
});

describe("global queue (process-wide)", () => {
  const cfg = { ...readConfig({}), gapMs: 30, maxQueue: 3 };

  it("runs visitors one at a time, spaced, one Discord call per code", async () => {
    let active = 0;
    let maxActive = 0;
    const starts: number[] = [];
    const calls: string[] = [];
    const q = createQueue(cfg, async (code) => {
      active++;
      maxActive = Math.max(maxActive, active);
      starts.push(Date.now());
      calls.push(code);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return ok(code);
    });
    await Promise.all([q.run("aa", "v1"), q.run("ab", "v2"), q.run("ac", "v3")]);
    expect(maxActive).toBe(1);
    expect(calls).toEqual(["aa", "ab", "ac"]);
    for (let i = 1; i < starts.length; i++)
      expect(starts[i]! - starts[i - 1]!).toBeGreaterThanOrEqual(28);
  });

  it("a visitor cannot queue twice and a full queue refuses without calling Discord", async () => {
    let calls = 0;
    const q = createQueue(cfg, async (code) => {
      calls++;
      return ok(code);
    });
    const [a, dup] = await Promise.all([q.run("aa", "v1"), q.run("ab", "v1")]);
    expect(a.status).toBe("not_found");
    expect(dup).toMatchObject({ discordQueried: false, errorKind: "app_throttle" });
    const runs = ["v1", "v2", "v3", "v4"].map((v, i) => q.run(`a${i}`, v));
    const res = await Promise.all(runs);
    expect(res[3]).toMatchObject({ discordQueried: false, errorKind: "app_throttle" });
    expect(calls).toBe(4);
  });
});

describe("HTTP server", () => {
  let close: (() => void) | null = null;
  afterEach(() => close?.());

  async function start() {
    const server = createApi(
      { ...readConfig({ ALLOWED_ORIGINS: "https://site.app" }), gapMs: 0 },
      async (code) => ok(code),
    );
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    close = () => server.close();
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  it("health, validation, CORS for the official origin only", async () => {
    const base = await start();
    expect((await fetch(`${base}/health`)).status).toBe(200);
    expect((await fetch(`${base}/api/public/invites/a_`)).status).toBe(400);
    const good = await fetch(`${base}/api/public/invites/AB`, {
      headers: { Origin: "https://site.app" },
    });
    expect(good.headers.get("access-control-allow-origin")).toBe("https://site.app");
    expect(await good.json()).toMatchObject({ code: "ab", httpStatus: 404 });
    const evil = await fetch(`${base}/api/public/invites/ab`, {
      headers: { Origin: "https://evil.app" },
    });
    expect(evil.status).toBe(403);
  });
});
