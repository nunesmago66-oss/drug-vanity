import { describe, expect, it } from "vitest";
import { BUILT_IN_ABBREVIATIONS } from "./abbreviation-library";
import { analyzeLibrary, buildLibraryIndex, classifyGroup, rankedSearch } from "./global-library";

const index = buildLibraryIndex(BUILT_IN_ABBREVIATIONS);

describe("Biblioteca Global", () => {
  it("preserva os 1.779 registros incluídos no backup 2.1 e soma os aeroportos", () => {
    expect(index.entries.filter((e) => e.record.packId !== "iata-airports").length).toBe(1779);
    expect(index.entries.length).toBeGreaterThan(1779 + 3000);
  });
  it("CGR encontra o aeroporto de Campo Grande primeiro", () => {
    const top = rankedSearch(index, "CGR")[0]!;
    expect(top.record.abbreviation).toBe("CGR");
    expect(top.group).toBe("Aeroportos e aviação");
    expect(top.record.description).toMatch(/Campo Grande/);
  });
  it("LOL encontra o significado da gíria", () => {
    const hits = rankedSearch(index, "LOL").filter((e) => e.key === "lol");
    expect(hits.some((e) => /laugh/i.test(e.record.meaning))).toBe(true);
  });
  it("Bitcoin encontra BTC", () => {
    expect(rankedSearch(index, "Bitcoin")[0]!.record.abbreviation).toBe("BTC");
  });
  it("pesquisa aproximada tolera erro de digitação", () => {
    expect(rankedSearch(index, "Bitcoim").some((e) => e.record.abbreviation === "BTC")).toBe(true);
  });
  it("moedas são códigos técnicos, não abreviações", () => {
    const usd = index.entries.find(
      (e) => e.record.packId === "iso-4217-currencies" && e.key === "usd",
    )!;
    expect(usd.group).toBe("Moedas");
    expect(usd.nature).toBe("code");
  });
  it("categoria desconhecida vira Não classificado", () => {
    const r = { ...BUILT_IN_ABBREVIATIONS[0]!, category: "Algo novo" as never };
    expect(classifyGroup(r)).toBe("Não classificado");
  });
  it("contadores vêm dos dados reais", () => {
    const a = analyzeLibrary(index);
    expect(a.total).toBe(index.entries.length);
    expect(a.codes + a.abbreviations).toBe(a.total);
    expect(a.verified + a.unverified).toBe(a.total);
    expect(a.byGroup.reduce((s, [, n]) => s + n, 0)).toBe(a.total);
    expect(a.ambiguousCodes).toBeGreaterThan(0);
  });
});
