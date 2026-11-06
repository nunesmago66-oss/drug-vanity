/**
 * "LIBERADAS" (CONFIRMED_FREE) vs "NÃO ESTÃO EM USO" (NOT_IN_USE): separate
 * categories, counted once each, filtered/exported independently, preserved by
 * persistence, background state, history and backup (PC ↔ iPhone transfer).
 */
import { describe, expect, it } from "vitest";

import {
  AVAILABILITY_STATES,
  CATEGORY_ORDER,
  classifyAvailability,
  type OfficialConfirmation,
} from "./availability";
import { validateResults } from "./background-protocol";
import { buildBackup, mergeResults, parseBackup, type BackupData } from "./backup";
import { toCsv, type CheckResult } from "./check-rules";
import { checkInviteFromBrowser } from "./invite-check.browser";
import { validateSavedData } from "./persistence";
import {
  DEFAULT_SCANNER_CONFIG,
  availabilityOf,
  countAvailability,
  toCompact,
  type ResultsMap,
} from "./scanner";
import { EMPTY_STATS, codeTotals, historyAvailability, recordCheck, validateStats } from "./stats";
import { EMPTY_ABBREVIATION_USER_DATA } from "./abbreviation-library";

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
const check = (code: string, impl: () => Promise<Response>) =>
  checkInviteFromBrowser({ data: { code } }, impl as unknown as typeof fetch);
const official = (code: string): OfficialConfirmation => ({
  source: "discord_official",
  operation: "authorized-vanity-check",
  code,
  available: true,
  confirmedAt: "2026-01-01T00:00:00Z",
});
const result = (code: string, over: Partial<CheckResult>): CheckResult => ({
  code,
  status: "not_found",
  httpStatus: 404,
  retryAfterSeconds: null,
  reason: "",
  checkedAt: "2026-11-06T12:00:00Z",
  discordQueried: true,
  ...over,
});

/** A results map with one code in every category. */
const sample: ResultsMap = {
  ab: ["e", 200, 10],
  ac: ["n", 404, 11],
  ad: ["n", 404, 12, null, "F", official("ad")],
  ae: ["e", 200, 13, null, "E"],
  af: ["x", 403, 14, "d"],
  ag: ["x", 429, 15, "d"],
  ah: ["x", null, 16, "t"],
};

describe("NÃO ESTÁ EM USO vs LIBERADA", () => {
  it("HTTP 404 is NOT_IN_USE, never LIBERADA", async () => {
    const r = await check("abc", async () => json(404, { code: 10006, message: "Unknown Invite" }));
    expect(r.availability).toBe("NOT_IN_USE");
    expect(availabilityOf(toCompact(r))).toBe("NOT_IN_USE");
  });
  it("HTTP 429 is INDEFINIDA, never LIBERADA", async () => {
    const r = await check("abc", async () => json(429, { retry_after: 3 }, { "retry-after": "3" }));
    expect(r.availability).toBe("UNKNOWN");
    expect(availabilityOf(toCompact(r))).toBe("UNKNOWN");
  });
  it("inconclusive results (timeout, connection, 5xx, app block) are INDEFINIDA", () => {
    for (const ev of [
      { httpStatus: null, errorKind: "timeout" },
      { httpStatus: null, errorKind: "network" },
      { httpStatus: 503, errorKind: "unexpected" },
      { httpStatus: 404, discordQueried: false },
    ])
      expect(classifyAvailability({ code: "abc", ...ev })).toBe("UNKNOWN");
  });
  it("expired invite is EXPIRADA, not LIBERADA", () => {
    expect(
      classifyAvailability({ code: "abc", httpStatus: 200, expiresAt: "2000-01-01T00:00:00Z" }),
    ).toBe("EXPIRED");
  });
  it("authorized official confirmation for the same code is LIBERADA", () => {
    const a = classifyAvailability({
      code: "abc",
      httpStatus: 404,
      discordQueried: true,
      officialConfirmation: official("abc"),
    });
    expect(a).toBe("CONFIRMED_FREE");
    const saved = toCompact(
      result("abc", { availability: a, officialConfirmation: official("abc") }),
    );
    expect(availabilityOf(saved)).toBe("CONFIRMED_FREE");
  });
  it("a confirmation on a 429, error or for another code is not LIBERADA", () => {
    expect(
      classifyAvailability({ code: "abc", httpStatus: 429, officialConfirmation: official("abc") }),
    ).toBe("UNKNOWN");
    expect(
      classifyAvailability({ code: "abc", httpStatus: 404, officialConfirmation: official("abd") }),
    ).toBe("NOT_IN_USE");
  });
});

describe("Counters and filters", () => {
  it("each result is counted in exactly one category", () => {
    const c = countAvailability(sample);
    expect(c).toEqual({
      ACTIVE: 1,
      NOT_IN_USE: 1,
      CONFIRMED_FREE: 1,
      EXPIRED: 1,
      REVOKED: 0,
      BLOCKED: 1,
      UNKNOWN: 2,
      INVALID: 0,
    });
    const sum = AVAILABILITY_STATES.reduce((s, a) => s + c[a], 0);
    expect(sum).toBe(Object.keys(sample).length);
  });
  it("dashboard totals use the same exclusive categories", () => {
    const t = codeTotals(sample, {});
    expect(t.verified).toBe(7);
    expect(t.categories.CONFIRMED_FREE).toBe(1);
    expect(t.categories.NOT_IN_USE).toBe(1);
  });
  it("LIBERADAS and NÃO ESTÃO EM USO filters are independent", () => {
    const only = (a: string) =>
      Object.entries(sample)
        .filter(([, r]) => availabilityOf(r) === a)
        .map(([c]) => c);
    expect(only("CONFIRMED_FREE")).toEqual(["ad"]);
    expect(only("NOT_IN_USE")).toEqual(["ac"]);
    expect(CATEGORY_ORDER).toContain("CONFIRMED_FREE");
    expect(CATEGORY_ORDER).toContain("NOT_IN_USE");
  });
  it("exporting the LIBERADAS list contains only liberated codes", () => {
    const rows = Object.entries(sample)
      .filter(([, r]) => availabilityOf(r) === "CONFIRMED_FREE")
      .map(([code, r]) => [code, availabilityOf(r)]);
    const csv = toCsv(["codigo", "verified_availability"], rows);
    expect(csv).toContain("ad,CONFIRMED_FREE");
    expect(csv).not.toContain("ac");
    expect(csv.trim().split(/\r?\n/)).toHaveLength(2);
  });
});

describe("Persistence, restart, history and PC ↔ iPhone backup", () => {
  it("LIBERADA and NÃO ESTÁ EM USO survive a reload", () => {
    const { value } = validateSavedData("vanity-scan-results", sample, {});
    const saved = value as ResultsMap;
    expect(availabilityOf(saved["ad"]!)).toBe("CONFIRMED_FREE");
    expect(availabilityOf(saved["ac"]!)).toBe("NOT_IN_USE");
  });
  it("background helper state keeps the categories after a restart", () => {
    const restored = validateResults(JSON.parse(JSON.stringify(sample)));
    expect(countAvailability(restored)).toEqual(countAvailability(sample));
  });
  it("a tampered LIBERADA on a 429 is rejected everywhere", () => {
    // Migrated, never deleted: the record stays, its category becomes INDEFINIDA.
    const bg = validateResults({ ab: ["x", 429, 1, "d", "F"] });
    expect(bg).toEqual({ ab: ["x", 429, 1, "d"] });
    expect(availabilityOf(bg["ab"]!)).toBe("UNKNOWN");
    const { value } = validateSavedData("vanity-scan-results", { ab: ["x", 429, 1, "d", "F"] }, {});
    expect(value).toEqual({ ab: ["x", 429, 1, "d"] });
  });
  it("history records the category and rejects inconsistent ones", () => {
    let stats = recordCheck(EMPTY_STATS, {
      code: "ad",
      status: "n",
      http: 404,
      at: 1_000_000,
      mode: "a",
      responseMs: 50,
      availability: "CONFIRMED_FREE",
      officialConfirmation: official("ad"),
    });
    stats = recordCheck(stats, {
      code: "ac",
      status: "n",
      http: 404,
      at: 1_001_000,
      mode: "a",
      responseMs: 50,
      availability: "NOT_IN_USE",
    });
    const reloaded = validateStats(JSON.parse(JSON.stringify(stats)))!;
    expect(reloaded.recent.map(historyAvailability)).toEqual(["NOT_IN_USE", "CONFIRMED_FREE"]);
    const tampered = { ...stats, recent: [["ab", "x", 429, 1, "a", null, "F"]] };
    expect(validateStats(tampered)!.recent.map(historyAvailability)).toEqual(["UNKNOWN"]);
  });
  it("backup from one device restores the categories on another", () => {
    const defaults: BackupData = {
      results: {},
      meaningResults: {},
      catalog: [],
      selected: [],
      config: DEFAULT_SCANNER_CONFIG,
      meaningConfig: DEFAULT_SCANNER_CONFIG,
      meaningFilters: {
        query: "",
        length: "all",
        family: "all",
        language: "all",
        sort: "relevance",
        limit: 250,
      },
      stats: EMPTY_STATS,
      abbreviations: EMPTY_ABBREVIATION_USER_DATA,
    };
    const pc = buildBackup({ ...defaults, results: sample });
    const parsed = parseBackup(pc, defaults);
    const iphone = mergeResults({ zz: ["n", 404, 1] }, parsed.data.results ?? {});
    expect(availabilityOf(iphone["ad"]!)).toBe("CONFIRMED_FREE");
    expect(availabilityOf(iphone["ac"]!)).toBe("NOT_IN_USE");
    expect(countAvailability(iphone).NOT_IN_USE).toBe(2);
  });
});
