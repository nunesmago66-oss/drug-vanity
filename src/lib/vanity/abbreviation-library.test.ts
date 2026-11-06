import { describe, expect, it } from "vitest";
import {
  BUILT_IN_ABBREVIATIONS,
  EMPTY_ABBREVIATION_USER_DATA,
  matchesAbbreviationMeaning,
  mergeAbbreviationUserData,
  normalizeAbbreviationUserData,
  searchAbbreviations,
} from "./abbreviation-library";

describe("global abbreviation library", () => {
  it("ships a curated offline seed with common global abbreviations", () => {
    expect(BUILT_IN_ABBREVIATIONS.length).toBeGreaterThan(100);
    expect(searchAbbreviations("bitcoin").some((r) => r.abbreviation === "BTC")).toBe(true);
    expect(searchAbbreviations("cryptocurrency").some((r) => r.abbreviation === "BTC")).toBe(true);
    expect(searchAbbreviations("laughing out loud").some((r) => r.abbreviation === "LOL")).toBe(
      true,
    );
  });
  it("searches without case or accent sensitivity and supports aliases", () => {
    expect(
      searchAbbreviations("ARTIFICIAL INTELLIGENCE").some((r) => r.abbreviation === "AI"),
    ).toBe(true);
    expect(searchAbbreviations("real brasileirO").some((r) => r.abbreviation === "BRL")).toBe(true);
  });
  it("keeps distinct meanings when one abbreviation is ambiguous", () => {
    expect(
      searchAbbreviations("MVP").filter((r) => r.abbreviation === "MVP").length,
    ).toBeGreaterThan(1);
  });
  it("matches dictionary meanings to scanner codes", () => {
    expect(matchesAbbreviationMeaning("Bitcoin", "btc")).toBe(true);
    expect(matchesAbbreviationMeaning("Laughing Out Loud", "lol")).toBe(true);
    expect(matchesAbbreviationMeaning("Bitcoin", "xyz")).toBe(false);
  });
  it("merges custom entries without duplicates and preserves favorites", () => {
    const a = {
      custom: [
        {
          id: "x",
          abbreviation: "XYZ",
          meaning: "Example",
          language: "English",
          category: "General English" as const,
          aliases: [],
          related: [],
          sourceNote: "custom",
        },
      ],
      favorites: ["x"],
      recent: ["x"],
      collections: [{ id: "c", name: "Test", recordIds: ["x"] }],
    };
    const merged = mergeAbbreviationUserData(a, a);
    expect(merged.custom).toHaveLength(1);
    expect(merged.favorites).toEqual(["x"]);
    expect(merged.collections).toHaveLength(1);
  });
  it("rejects malformed custom records", () => {
    const normalized = normalizeAbbreviationUserData({
      custom: [
        { id: 1, abbreviation: "bad" },
        {
          id: "ok",
          abbreviation: "OK",
          meaning: "Okay",
          language: "English",
          category: "General English" as const,
          aliases: [],
          related: [],
        },
      ],
      favorites: ["ok", 3],
      recent: [],
    });
    expect(normalized.custom).toHaveLength(1);
    expect(normalized.favorites).toEqual(["ok"]);
    expect(EMPTY_ABBREVIATION_USER_DATA.custom).toEqual([]);
  });
});
