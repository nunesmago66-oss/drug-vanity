import { describe, expect, it } from "vitest";

import { buildBackup, mergeCatalog, mergeResults, parseBackup, type BackupData } from "./backup";
import { DEFAULT_SCANNER_CONFIG } from "./scanner";
import { EMPTY_STATS, recordCheck } from "./stats";
import type { CatalogEntry } from "./catalog";
import { EMPTY_ABBREVIATION_USER_DATA } from "./abbreviation-library";

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
const entry = (code: string, favorite = false): CatalogEntry => ({
  code,
  meaning: "x",
  category: "outros",
  kind: "termo",
  favorite,
});

describe("backup", () => {
  it("round-trips results, catalog and selection", () => {
    const data: BackupData = {
      ...defaults,
      results: { ab: ["e", 200, 100] },
      catalog: [entry("ab", true)],
      selected: ["ab"],
    };
    const parsed = parseBackup(buildBackup(data), defaults);
    expect(parsed.data.results).toEqual({ ab: ["e", 200, 100] });
    expect(parsed.data.catalog?.[0]?.favorite).toBe(true);
    expect(parsed.data.selected).toEqual(["ab"]);
    expect(parsed.data.abbreviations).toEqual(EMPTY_ABBREVIATION_USER_DATA);
    expect(parsed.skipped).toBe(0);
  });

  it("never imports cooldown or last-check timing", () => {
    const text = JSON.stringify({
      format: "drug-url-backup",
      version: 1,
      data: { "dvf:cooldown-until": 0, cooldownUntil: 0, lastCheckAt: 0 },
    });
    const parsed = parseBackup(text, defaults);
    expect(Object.keys(parsed.data)).toEqual([]);
  });

  it("drops invalid result records and counts them", () => {
    const text = JSON.stringify({
      format: "drug-url-backup",
      version: 1,
      data: { results: { ab: ["e", 200, 1], "!!": ["e", 200, 1], cd: ["z", 1, 1] } },
    });
    const parsed = parseBackup(text, defaults);
    expect(Object.keys(parsed.data.results ?? {})).toEqual(["ab"]);
    expect(parsed.skipped).toBe(2);
  });

  it("rejects files that are not DRUG URL backups", () => {
    expect(() => parseBackup("not json", defaults)).toThrow();
    expect(() => parseBackup(JSON.stringify({ data: {} }), defaults)).toThrow();
    expect(() =>
      parseBackup(JSON.stringify({ format: "drug-url-backup", version: 99, data: {} }), defaults),
    ).toThrow();
  });

  it("merge keeps the most recent check for the same code", () => {
    const merged = mergeResults(
      { ab: ["n", 404, 200], cd: ["e", 200, 5] },
      { ab: ["e", 200, 100], ef: ["n", 404, 9] },
    );
    expect(merged["ab"]).toEqual(["n", 404, 200]);
    expect(merged["cd"]).toEqual(["e", 200, 5]);
    expect(merged["ef"]).toEqual(["n", 404, 9]);
  });

  it("merge never removes catalog entries and keeps favorites from either side", () => {
    const merged = mergeCatalog([entry("ab"), entry("cd", true)], [entry("ab", true), entry("ef")]);
    expect(merged.map((e) => e.code)).toEqual(["ab", "cd", "ef"]);
    expect(merged.find((e) => e.code === "ab")?.favorite).toBe(true);
    expect(merged.find((e) => e.code === "cd")?.favorite).toBe(true);
  });

  it("round-trips custom abbreviation entries, favorites and recent lookups", () => {
    const abbreviations = {
      custom: [
        {
          id: "custom-1",
          abbreviation: "XYZ",
          meaning: "Example",
          description: "",
          language: "English",
          category: "General English" as const,
          aliases: ["sample"],
          related: [],
          sourceNote: "custom",
        },
      ],
      favorites: ["custom-1"],
      recent: ["custom-1"],
      collections: [],
    };
    const parsed = parseBackup(buildBackup({ ...defaults, abbreviations }), defaults);
    expect(parsed.data.abbreviations).toEqual(abbreviations);
  });

  it("round-trips the verification history", () => {
    const stats = recordCheck(EMPTY_STATS, {
      code: "ab",
      status: "n",
      http: 404,
      at: Date.UTC(2026, 10, 6),
      mode: "a",
      responseMs: 250,
    });
    const parsed = parseBackup(buildBackup({ ...defaults, stats }), defaults);
    expect(parsed.data.stats).toEqual(stats);
  });
});
