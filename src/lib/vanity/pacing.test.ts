import { describe, expect, it } from "vitest";
import { initialPace, validatePace, PACE_FLOOR_MS, PACE_MAX_MS } from "./pacing";

describe("adaptive pace persistence", () => {
  it("clamps the saved interval to the supported range", () => {
    expect(validatePace({ v: 1, intervalMs: 1, streak: 0 }, 1_000)?.intervalMs).toBe(PACE_FLOOR_MS);
    expect(
      validatePace({ v: 1, intervalMs: 999_999, streak: 0, limits: [900] }, 1_000)?.intervalMs,
    ).toBe(PACE_MAX_MS);
  });

  it("rejects non-finite streaks and malformed note timestamps", () => {
    const pace = validatePace(
      {
        ...initialPace(),
        streak: Number.POSITIVE_INFINITY,
        note: { at: Number.NaN, text: "bad timestamp" },
      },
      10_000,
    );
    expect(pace?.streak).toBe(0);
    expect(pace?.note).toBeNull();
  });

  it("bounds and filters the persisted rate-limit history", () => {
    const now = 10_000_000;
    const limits = Array.from({ length: 40 }, (_, i) => now - i * 1_000);
    limits.push(-1, Number.NaN, now + 120_000);
    const pace = validatePace({ ...initialPace(), limits }, now);
    expect(pace?.limits).toHaveLength(20);
    expect(pace?.limits.every((t) => t >= 0 && t <= now + 60_000)).toBe(true);
  });
});
