// @vitest-environment node
import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BackgroundEngine } from "../../../scripts/background/engine";
import { companionServer } from "../../../scripts/background/http";
import { emptyBackground, validateBackground } from "./background-protocol";
import type { CheckResult } from "./check-rules";
import { acquireProcessLock } from "../../../scripts/background/process-lock";

const answer = (code: string, httpStatus = 404): CheckResult => ({
  code,
  httpStatus,
  status: httpStatus === 404 ? "not_found" : "inconclusive",
  checkedAt: new Date().toISOString(),
  reason: "test",
  retryAfterSeconds: httpStatus === 429 ? 2 : null,
  discordQueried: true,
});
async function until(test: () => boolean) {
  const end = Date.now() + 12_000;
  while (!test()) {
    if (Date.now() > end) throw new Error("Timed out");
    await new Promise((r) => setTimeout(r, 25));
  }
}
describe("real Node background execution", () => {
  it("rejects a second process owner of the same checkpoint", async () => {
    const dir = await mkdtemp(join(tmpdir(), "background-owner-"));
    const release = await acquireProcessLock(join(dir, "state.json"));
    try {
      await expect(acquireProcessLock(join(dir, "state.json"))).rejects.toThrow("Já existe");
    } finally {
      await release();
      await rm(dir, { recursive: true });
    }
  });
  it("keeps the single-code verifier functional and rechecks saved codes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "background-quick-"));
    let calls = 0;
    const engine = new BackgroundEngine(join(dir, "state.json"), async (code) => {
      calls++;
      return answer(code);
    });
    try {
      expect((await engine.quick("aa")).httpStatus).toBe(404);
      expect((await engine.quick("aa")).httpStatus).toBe(404);
      expect(calls).toBe(2);
    } finally {
      await engine.stop();
      await rm(dir, { recursive: true });
    }
  });
  it("continues without an interface, checkpoints results and reconnects over authenticated HTTP", async () => {
    const dir = await mkdtemp(join(tmpdir(), "background-test-"));
    const starts: number[] = [];
    const engine = new BackgroundEngine(join(dir, "state.json"), async (code) => {
      starts.push(Date.now());
      return answer(code);
    });
    const server = companionServer(engine, "test-token", "http://127.0.0.1:5173");
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No address");
    const url = `http://127.0.0.1:${address.port}`;
    const headers = { Authorization: "Bearer test-token", "Content-Type": "application/json" };
    try {
      expect((await fetch(`${url}/state`)).status).toBe(401);
      expect(
        (await fetch(`${url}/state`, { headers: { ...headers, Origin: "https://evil.example" } }))
          .status,
      ).toBe(403);
      const input = {
        ...emptyBackground(),
        codes: ["aa", "ab", "ac"],
        pace: { ...emptyBackground().pace, intervalMs: 1000 },
      };
      expect(
        (await fetch(`${url}/start`, { method: "POST", headers, body: JSON.stringify(input) }))
          .status,
      ).toBe(200);
      expect(
        (await fetch(`${url}/start`, { method: "POST", headers, body: JSON.stringify(input) }))
          .status,
      ).toBe(409);
      // No polling/connected page while the queue completes.
      await until(() => engine.state.status === "done");
      const reconnected = await (await fetch(`${url}/state`, { headers })).json();
      expect(Object.keys(reconnected.results)).toEqual(["aa", "ab", "ac"]);
      const first = starts[0];
      const second = starts[1];
      if (first === undefined || second === undefined) throw new Error("Missing request times");
      expect(second - first).toBeGreaterThanOrEqual(1000);
      const restarted = new BackgroundEngine(join(dir, "state.json"));
      await restarted.load();
      expect(restarted.state.stats.total.c).toBe(3);
      expect(Object.keys(restarted.state.results)).toHaveLength(3);
    } finally {
      await engine.stop();
      await new Promise<void>((r) => server.close(() => r()));
      await rm(dir, { recursive: true });
    }
  });
  it("stops on 429 with a durable cooldown, leaves code pending; a user pause cancels auto-resume", async () => {
    const dir = await mkdtemp(join(tmpdir(), "background-429-"));
    let calls = 0;
    const engine = new BackgroundEngine(join(dir, "state.json"), async (code) => {
      calls++;
      return answer(code, 429);
    });
    try {
      await engine.start({ ...emptyBackground(), codes: ["aa", "ab"] });
      await until(() => engine.state.status === "rate_limited");
      await engine.stop();
      expect(calls).toBe(1);
      expect(engine.state.results).toEqual({});
      expect(engine.state.cooldownUntil - engine.state.lastCheckAt).toBeGreaterThanOrEqual(4000);
      expect(engine.state.pace.intervalMs).toBe(3000);
      const restored = new BackgroundEngine(join(dir, "state.json"));
      await restored.load();
      restored.resume();
      // Paused by the user (engine.stop): a restart keeps it paused.
      expect(restored.state.status).toBe("stopped");
      await expect(restored.start({ ...emptyBackground(), codes: ["aa"] })).rejects.toThrow(
        "limite de taxa",
      );
    } finally {
      await rm(dir, { recursive: true });
    }
  });
  it("pauses on command and resumes only remaining codes after a process restart", async () => {
    const dir = await mkdtemp(join(tmpdir(), "background-stop-"));
    const engine = new BackgroundEngine(join(dir, "state.json"), async (code) => answer(code));
    try {
      await engine.start({ ...emptyBackground(), codes: ["aa", "ab"] });
      await until(() => Boolean(engine.state.results["aa"]));
      await engine.stop();
      expect(engine.state.status).toBe("stopped");
      expect(engine.state.results["ab"]).toBeUndefined();
      const resumedCodes: string[] = [];
      const restored = new BackgroundEngine(join(dir, "state.json"), async (code) => {
        resumedCodes.push(code);
        return answer(code);
      });
      await restored.load();
      await restored.start({ ...restored.state });
      await until(() => restored.state.status === "done");
      await restored.stop();
      expect(resumedCodes).toEqual(["ab"]);
    } finally {
      await rm(dir, { recursive: true });
    }
  });
  it("preserves corrupt checkpoints and rejects malformed jobs", async () => {
    const dir = await mkdtemp(join(tmpdir(), "background-corrupt-"));
    const file = join(dir, "state.json");
    try {
      await writeFile(file, "broken");
      const engine = new BackgroundEngine(file);
      await expect(engine.load()).rejects.toThrow("preservado");
      expect(await readFile(file, "utf8")).toBe("broken");
      expect(() => validateBackground({ ...emptyBackground(), codes: ["bad-code"] })).toThrow();
    } finally {
      await rm(dir, { recursive: true });
    }
  });
});
