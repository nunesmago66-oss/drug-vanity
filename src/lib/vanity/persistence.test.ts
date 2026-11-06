import { describe, expect, it } from "vitest";
import {
  decodeSavedData,
  encodeSavedData,
  validateSavedData,
  reportStorageIssue,
  getStorageIssues,
  clearStorageError,
  reconcileTiming,
  readSavedTiming,
  recoveryKey,
} from "./persistence";
import { DEFAULT_SCANNER_CONFIG } from "./scanner";
import { DEFAULT_CATALOG } from "./catalog";
import { generateMeaningCandidates } from "./meaning-generator";

describe("safe persistence", () => {
  it("loads legacy progress unchanged", () => {
    const data = { aa: ["e", 200, 100], bb: ["n", 404, 101], cc: ["x", 429, 102] };
    expect(decodeSavedData("dvf:results:v1", JSON.stringify(data), {})).toEqual({
      value: data,
      recovered: false,
    });
  });
  it("round trips versioned data", () => {
    const data = { aa: ["n", 404, 100] };
    expect(decodeSavedData("dvf:meaning-results:v1", encodeSavedData(data), {}).value).toEqual(
      data,
    );
  });
  it("keeps valid results when other records are corrupt", () => {
    expect(
      validateSavedData("dvf:results:v1", { aa: ["n", 404, 100], bb: ["wat"], cc: null }, {}).value,
    ).toEqual({ aa: ["n", 404, 100] });
  });
  it("404 can never be restored as existing", () => {
    expect(validateSavedData("dvf:results:v1", { aa: ["e", 404, 100] }, {}).value).toEqual({
      aa: ["n", 404, 100],
    });
  });
  it("handles corrupt JSON and unknown versions without trusting them", () => {
    expect(decodeSavedData("dvf:results:v1", "{broken", {}).recovered).toBe(true);
    expect(decodeSavedData("dvf:results:v1", '{"dvfVersion":999,"data":{}}', {}).recovered).toBe(
      true,
    );
  });
  it("recovers partial settings and preserves the 1.5-second floor", () => {
    expect(
      validateSavedData(
        "dvf:scanner-config:v1",
        { intervalMs: 1, len2: false },
        DEFAULT_SCANNER_CONFIG,
      ).value,
    ).toEqual({ ...DEFAULT_SCANNER_CONFIG, intervalMs: 1500, len2: false });
  });
  it("preserves catalog edits, favorites and selection", () => {
    const catalog = [
      ...DEFAULT_CATALOG,
      {
        code: "zz",
        meaning: "Meu código",
        category: "outros",
        kind: "personalizado",
        custom: true,
        favorite: true,
      },
    ];
    expect(validateSavedData("dvf:catalog:v1", catalog, DEFAULT_CATALOG)).toEqual({
      value: catalog,
      recovered: false,
    });
    expect(validateSavedData("dvf:selected", ["gg", "zz"], []).value).toEqual(["gg", "zz"]);
  });
  it("preserves exactly 3623 suggestions", () =>
    expect(generateMeaningCandidates()).toHaveLength(3623));
  it("reports quota and other errors instead of failing silently", () => {
    reportStorageIssue("test-quota", { name: "QuotaExceededError" });
    expect(getStorageIssues().find((i) => i.key === "test-quota")?.kind).toBe("quota");
    reportStorageIssue("test-other", { name: "SecurityError" });
    expect(getStorageIssues().find((i) => i.key === "test-other")?.kind).toBe("unavailable");
    clearStorageError("test-quota");
    clearStorageError("test-other");
  });
});

describe("cooldown reconciliation", () => {
  const now = 1_000_000_000_000;
  const store = (data: Record<string, string>) => ({ getItem: (k: string) => data[k] ?? null });
  it("a recovered zero never shortens an active cooldown", () => {
    const s = store({
      "dvf:cooldown-until": encodeSavedData(now + 60_000),
      [recoveryKey("dvf:cooldown-until")]: encodeSavedData(0),
    });
    expect(readSavedTiming(s, "dvf:cooldown-until", 0, now)).toBe(now + 60_000);
  });
  it("the longest valid wait wins across memory, original and recovery", () => {
    expect(reconcileTiming("dvf:cooldown-until", [now + 10_000, 0], now + 30_000, now)).toBe(
      now + 30_000,
    );
    expect(reconcileTiming("dvf:cooldown-until", [now + 90_000, 0], now + 30_000, now)).toBe(
      now + 90_000,
    );
  });
  it("ignores corrupt values instead of blocking forever", () => {
    expect(reconcileTiming("dvf:cooldown-until", [now + 48 * 3600_000, -5, "x"], 0, now)).toBe(0);
  });
  it("keeps the latest last-check time so the 5-second gap is respected", () => {
    const s = store({
      "dvf:last-check-at": encodeSavedData(now - 1000),
      [recoveryKey("dvf:last-check-at")]: encodeSavedData(0),
    });
    expect(readSavedTiming(s, "dvf:last-check-at", 0, now)).toBe(now - 1000);
  });
});

describe("rate-limit origin in saved results", () => {
  it("keeps the origin marker on error results and still loads legacy 3-item records", () => {
    const data = { aa: ["x", 429, 100, "d"], bb: ["x", 429, 101, "a"], cc: ["x", 429, 102] };
    expect(validateSavedData("dvf:results:v1", data, {})).toEqual({
      value: data,
      recovered: false,
    });
  });
  it("rejects unknown markers and never turns a 404 into anything but not found", () => {
    expect(
      validateSavedData(
        "dvf:results:v1",
        { aa: ["x", 429, 100, "z"], bb: ["e", 404, 100, "d"] },
        {},
      ).value,
    ).toEqual({ bb: ["n", 404, 100] });
  });
});

describe("new failure markers load safely", () => {
  it("keeps c/t/f markers on error results", () => {
    const data = { aa: ["x", 429, 1, "c"], bb: ["x", null, 2, "t"], cc: ["x", null, 3, "f"] };
    expect(validateSavedData("dvf:results:v1", data, {})).toEqual({
      value: data,
      recovered: false,
    });
  });
});
