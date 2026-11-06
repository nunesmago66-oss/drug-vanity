import { describe, expect, it } from "vitest";

import { decodeSavedData, encodeSavedData } from "./persistence";
import {
  EMPTY_STATS,
  MAX_RECENT,
  STATS_KEY,
  codeTotals,
  dayKey,
  eventFromResult,
  lastDays,
  mergeStats,
  recordCheck,
  seedFromResults,
  successRate,
  sumDays,
  validateStats,
  type CheckEvent,
} from "./stats";

const NOW = new Date(2026, 10, 6, 15, 0, 0).getTime();
const ev = (over: Partial<CheckEvent> = {}): CheckEvent => ({
  code: "ab",
  status: "n",
  http: 404,
  at: NOW,
  mode: "a",
  responseMs: 300,
  ...over,
});

describe("verification stats", () => {
  it("counts every check, including retests of the same code", () => {
    let s = recordCheck(EMPTY_STATS, ev());
    s = recordCheck(s, ev({ status: "e", http: 200 }));
    expect(s.total.c).toBe(2);
    expect(s.total.n).toBe(1);
    expect(s.total.e).toBe(1);
    expect(s.recent).toHaveLength(2);
  });

  it("success rate is valid answers (200/404) over all checks", () => {
    let s = recordCheck(EMPTY_STATS, ev());
    s = recordCheck(s, ev({ status: "e", http: 200 }));
    s = recordCheck(s, ev({ status: "x", http: 429 }));
    s = recordCheck(s, ev({ status: "x", http: null }));
    expect(successRate(s.total)).toBe(50);
    expect(s.total.r).toBe(1);
    expect(successRate(EMPTY_STATS.total)).toBeNull();
  });

  it("groups checks by local day and fills empty days with zero", () => {
    const yesterday = NOW - 24 * 3600 * 1000;
    let s = recordCheck(EMPTY_STATS, ev({ at: yesterday }));
    s = recordCheck(s, ev());
    s = recordCheck(s, ev({ code: "cd" }));
    const days = lastDays(s, 3, NOW);
    expect(days.map((d) => d.checks)).toEqual([0, 1, 2]);
    expect(days[2]?.key).toBe(dayKey(NOW));
    expect(sumDays(s, 1, NOW).c).toBe(2);
    expect(sumDays(s, 7, NOW).c).toBe(3);
  });

  it("averages only measured response times", () => {
    let s = recordCheck(EMPTY_STATS, ev({ responseMs: 200 }));
    s = recordCheck(s, ev({ responseMs: 400 }));
    s = recordCheck(s, ev({ responseMs: null }));
    expect(s.total.ms / s.total.mc).toBe(300);
  });

  it("keeps the history list bounded", () => {
    let s = EMPTY_STATS;
    for (let i = 0; i < MAX_RECENT + 20; i++) s = recordCheck(s, ev({ at: NOW + i * 1000 }));
    expect(s.recent).toHaveLength(MAX_RECENT);
    expect(s.total.c).toBe(MAX_RECENT + 20);
  });

  it("measures response time from the request start", () => {
    const e = eventFromResult(
      {
        code: "ab",
        status: "not_found",
        httpStatus: 404,
        retryAfterSeconds: null,
        reason: "",
        checkedAt: new Date(NOW).toISOString(),
      },
      "m",
      NOW - 850,
      NOW,
    );
    expect(e).toMatchObject({ status: "n", mode: "m", responseMs: 850 });
  });

  it("seeds one check per saved result, without inventing response times", () => {
    const s = seedFromResults(
      { ab: ["e", 200, NOW / 1000], cd: ["n", 404, NOW / 1000] },
      { ef: ["x", 429, NOW / 1000] },
      NOW,
    );
    expect(s.total).toMatchObject({ c: 3, e: 1, n: 1, x: 1, r: 1, mc: 0 });
    expect(s.seeded).toBe(3);
  });

  it("code totals count each code once using its latest result", () => {
    const t = codeTotals({ ab: ["n", 404, 10], abc: ["e", 200, 5] }, { ab: ["e", 200, 20] });
    expect(t).toMatchObject({ verified: 2, exists: 2, notFound: 0, len2: 1, len3: 1 });
    expect(t.byMode).toEqual({ a: 2, m: 1 });
  });

  it("survives a save/load round trip unchanged", () => {
    const s = recordCheck(recordCheck(EMPTY_STATS, ev()), ev({ status: "x", http: 500 }));
    const decoded = decodeSavedData(STATS_KEY, encodeSavedData(s), EMPTY_STATS);
    expect(decoded.recovered).toBe(false);
    expect(decoded.value).toEqual(s);
  });

  it("rejects inconsistent saved data instead of showing wrong numbers", () => {
    const bad = { ...EMPTY_STATS, total: { c: 5, e: 1, n: 1, x: 1, r: 0, ms: 0, mc: 0 } };
    expect(validateStats(bad)).toBeNull();
    const s = recordCheck(EMPTY_STATS, ev());
    const withBadEntry = { ...s, recent: [...s.recent, ["!!", "n", 404, 1, "a", null]] };
    expect(validateStats(withBadEntry)?.recent).toHaveLength(1);
  });

  it("merging the same backup twice never double counts", () => {
    const s = recordCheck(recordCheck(EMPTY_STATS, ev()), ev({ at: NOW + 1000 }));
    const merged = mergeStats(s, s);
    expect(merged.total.c).toBe(2);
    expect(merged.recent).toHaveLength(2);
    expect(merged.days[dayKey(NOW)]?.c).toBe(2);
  });
});
