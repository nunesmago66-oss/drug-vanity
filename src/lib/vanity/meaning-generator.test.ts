import { describe, expect, it } from "vitest";
import { expandMeaningLimit, generateMeaningCandidates, phoneticScore } from "./meaning-generator";

describe("meaning discovery", () => {
  const all = generateMeaningCandidates();
  it("generates thousands of unique 2–3 letter suggestions beyond user examples", () => {
    expect(all.length).toBeGreaterThan(3000);
    expect(new Set(all.map((c) => c.code)).size).toBe(all.length);
    expect(all.every((c) => /^[a-z]{2,3}$/.test(c.code))).toBe(true);
    expect(all.some((c) => c.code === "lum" && c.family === "fonético")).toBe(true);
  });
  it("includes real multilingual meanings and digital abbreviations", () => {
    expect(all.find((c) => c.code === "oui")?.meaning).toContain("sim");
    expect(all.find((c) => c.code === "umi")?.meaning).toContain("mar");
    expect(all.find((c) => c.code === "sol")?.language).toContain("Português");
    expect(all.find((c) => c.code === "sol")?.language).toContain("Latim");
    expect(all.find((c) => c.code === "idk")?.family).toBe("abreviação");
  });
  it("keeps invented sounds separate from literal meaning", () => {
    const invented = all.filter((c) => c.family === "fonético");
    expect(invented.length).toBeGreaterThan(2500);
    expect(invented.every((c) => c.meaning.includes("sem significado literal confirmado"))).toBe(
      true,
    );
  });
  it("ranks natural syllables above consonant-only strings", () => {
    expect(phoneticScore("lia")).toBeGreaterThan(phoneticScore("zqt"));
    expect(all.every((c) => c.aesthetics >= 0 && c.aesthetics <= 100)).toBe(true);
    expect(all[0]?.relevance).toBeGreaterThanOrEqual(all.at(-1)?.relevance ?? 0);
  });
  it("expands suggestions without exceeding the finite pool", () => {
    expect(expandMeaningLimit(250, 4000)).toBe(500);
    expect(expandMeaningLimit(3900, 4000)).toBe(4000);
  });
});
