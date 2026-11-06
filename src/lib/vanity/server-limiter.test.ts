import { describe, expect, it } from "vitest";

import { CLIENT_MIN_GAP_MS, GLOBAL_MIN_GAP_MS, createLimiter } from "./server-limiter";
import { MIN_INTERVAL_MS } from "./check-rules";

describe("server limiter", () => {
  it("one visitor cannot send two checks closer than the client gap", () => {
    const l = createLimiter();
    expect(l.acquire("a", 10_000).ok).toBe(true);
    l.release("a");
    expect(l.acquire("a", 10_000 + CLIENT_MIN_GAP_MS - 1)).toMatchObject({
      ok: false,
      kind: "client",
    });
    // The global gap also applies to a single visitor, so the next check passes after it.
    expect(l.acquire("a", 10_000 + GLOBAL_MIN_GAP_MS).ok).toBe(true);
  });

  it("different visitors share a global gap just under the request floor", () => {
    const l = createLimiter();
    expect(GLOBAL_MIN_GAP_MS).toBe(MIN_INTERVAL_MS - 100);
    expect(l.acquire("a", 10_000).ok).toBe(true);
    expect(l.acquire("b", 10_500)).toMatchObject({ ok: false, kind: "global" });
    expect(l.acquire("b", 15_000).ok).toBe(true);
  });

  it("a visitor with a request in flight is rejected", () => {
    const l = createLimiter();
    l.acquire("a", 10_000);
    expect(l.acquire("a", 20_000)).toMatchObject({ ok: false, kind: "busy" });
  });

  it("a 429 block applies to every visitor and is never shortened", () => {
    const l = createLimiter();
    l.blockUntil(70_000);
    l.blockUntil(40_000);
    expect(l.acquire("z", 10_000)).toMatchObject({ ok: false, kind: "blocked", waitSeconds: 60 });
    expect(l.acquire("z", 70_000).ok).toBe(true);
  });
});
