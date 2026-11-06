import { describe, expect, it } from "vitest";
import {
  ABBREVIATION_PACKS,
  BUILT_IN_ABBREVIATIONS,
  groupMeanings,
  normalizeAbbreviationUserData,
  searchAbbreviations,
} from "./abbreviation-library";

describe("abbreviation packs", () => {
  it("the displayed total equals the real number of records and the pack counts", () => {
    const sum = ABBREVIATION_PACKS.reduce((n, p) => n + p.count, 0);
    expect(BUILT_IN_ABBREVIATIONS.length).toBe(sum);
    expect(BUILT_IN_ABBREVIATIONS.length).toBeGreaterThan(230);
  });
  it("ids are unique", () => {
    expect(new Set(BUILT_IN_ABBREVIATIONS.map((r) => r.id)).size).toBe(
      BUILT_IN_ABBREVIATIONS.length,
    );
  });
  it("keeps different meanings of the same abbreviation instead of merging them", () => {
    const op = groupMeanings(BUILT_IN_ABBREVIATIONS).get("op") ?? [];
    expect(op.map((r) => r.meaning)).toEqual(
      expect.arrayContaining(["Original Poster", "Overpowered"]),
    );
  });
  it("never stores the same abbreviation+meaning twice", () => {
    const keys = BUILT_IN_ABBREVIATIONS.map(
      (r) => `${r.abbreviation.toLowerCase()}|${r.meaning.toLowerCase()}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("standards packs are verified, curated slang is not", () => {
    expect(
      BUILT_IN_ABBREVIATIONS.find(
        (r) => r.abbreviation === "BR" && r.packId === "iso-3166-countries",
      )?.verified,
    ).toBe(true);
    expect(BUILT_IN_ABBREVIATIONS.find((r) => r.packId === "community-slang")?.verified).toBe(
      false,
    );
  });
  it("search finds by region and description", () => {
    expect(searchAbbreviations("SP Brasil").some((r) => r.meaning === "São Paulo")).toBe(true);
    expect(searchAbbreviations("elemento químico nº 26").some((r) => r.abbreviation === "Fe")).toBe(
      true,
    );
  });
  it("custom records keep region, kind and source url through save/restore", () => {
    const rec = {
      id: "c1",
      abbreviation: "ZZ",
      meaning: "Test",
      language: "English",
      category: "General English",
      aliases: [],
      related: [],
      sourceNote: "x",
      region: "Brasil",
      kind: "regional",
      sourceUrl: "https://example.org",
    };
    expect(normalizeAbbreviationUserData({ custom: [rec] }).custom[0]).toMatchObject({
      region: "Brasil",
      kind: "regional",
      sourceUrl: "https://example.org",
    });
  });
});
