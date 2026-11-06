import { describe, expect, it } from "vitest";
import { matchesSearch, normalizeSearchText } from "./search";

describe("accent-insensitive search", () => {
  it("normalizes accents, case and surrounding whitespace", () => {
    expect(normalizeSearchText("  CÓDIGO Ágil  ")).toBe("codigo agil");
  });

  it("matches across multiple fields", () => {
    expect(matchesSearch("  cafe ", "ab", "Café brasileiro")).toBe(true);
    expect(matchesSearch("xyz", "ab", "Café brasileiro")).toBe(false);
    expect(matchesSearch("", "anything")).toBe(true);
  });
});
