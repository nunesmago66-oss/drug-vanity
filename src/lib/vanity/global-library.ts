/**
 * Global Library: one unified view over every abbreviation pack.
 * Records are classified automatically (group, nature, ambiguity) from their existing
 * fields; nothing is invented — unknown data falls into "Não classificado".
 */
import type { AbbreviationRecord } from "./abbreviation-library";

export const LIBRARY_GROUPS = [
  "Abreviações e siglas",
  "Gírias e expressões",
  "Internet e redes sociais",
  "Discord e comunidades",
  "Games",
  "Tecnologia e programação",
  "Medicina e saúde",
  "Aeroportos e aviação",
  "Países e regiões",
  "Idiomas",
  "Moedas",
  "Outros códigos técnicos",
  "Não classificado",
] as const;
export type LibraryGroup = (typeof LIBRARY_GROUPS)[number];

/** "code" = a technical/standard code (ISO, IATA, IUPAC…); "abbreviation" = a linguistic abbreviation. */
export type RecordNature = "code" | "abbreviation";

export const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const DISCORD = /\b(discord|server|servidor|guild|mod|nitro|boost|community|comunidade)\b/;

export function classifyGroup(r: AbbreviationRecord): LibraryGroup {
  if (r.packId === "iso-4217-currencies") return "Moedas";
  switch (r.category) {
    case "Airports & Aviation":
      return "Aeroportos e aviação";
    case "Countries & Territories":
    case "States & Provinces":
      return "Países e regiões";
    case "Languages":
      return "Idiomas";
    case "Chemistry":
      return "Outros códigos técnicos";
    case "Gaming & Esports":
      return "Games";
    case "Technology":
    case "Security & Privacy":
      return "Tecnologia e programação";
    case "Health":
      return "Medicina e saúde";
    case "Internet & Social":
      return DISCORD.test(norm(`${r.meaning} ${r.description ?? ""}`))
        ? "Discord e comunidades"
        : "Internet e redes sociais";
    case "Portuguese Slang":
    case "Spanish Slang":
    case "Relationships":
      return "Gírias e expressões";
    case "French":
    case "German":
    case "Italian":
    case "Chinese":
    case "Russian":
    case "Japanese & Korean":
    case "General English":
      return /slang|giria|gíria|expressao|expressão/.test(norm(r.description ?? ""))
        ? "Gírias e expressões"
        : "Abreviações e siglas";
    case "Finance & Business":
      return r.kind === "technical" ? "Moedas" : "Abreviações e siglas";
    case "Crypto & Blockchain":
    case "Science & Education":
    case "Entertainment":
    case "Travel & Geography":
      return "Abreviações e siglas";
    default:
      return "Não classificado";
  }
}

export function classifyNature(r: AbbreviationRecord): RecordNature {
  return r.kind === "technical" ? "code" : "abbreviation";
}

export interface LibraryIndexEntry {
  record: AbbreviationRecord;
  key: string; // normalized abbreviation
  meaning: string; // normalized meaning
  aliases: string[]; // normalized aliases
  haystack: string;
  group: LibraryGroup;
  nature: RecordNature;
}

export interface LibraryIndex {
  entries: LibraryIndexEntry[];
  byKey: Map<string, LibraryIndexEntry[]>;
}

export function buildLibraryIndex(records: AbbreviationRecord[]): LibraryIndex {
  const entries: LibraryIndexEntry[] = [];
  const byKey = new Map<string, LibraryIndexEntry[]>();
  for (const record of records) {
    const group = classifyGroup(record);
    const e: LibraryIndexEntry = {
      record,
      key: norm(record.abbreviation),
      meaning: norm(record.meaning),
      aliases: record.aliases.map(norm),
      group,
      nature: classifyNature(record),
      haystack: norm(
        [
          record.abbreviation,
          record.meaning,
          record.language,
          record.category,
          group,
          record.region ?? "",
          record.description ?? "",
          ...record.aliases,
          ...record.related,
        ].join(" "),
      ),
    };
    entries.push(e);
    const list = byKey.get(e.key);
    if (list) list.push(e);
    else byKey.set(e.key, [e]);
  }
  return { entries, byKey };
}

/** Levenshtein distance capped at `max` (returns max+1 when exceeded). */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur: number[] = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(
        (prev[j] ?? 0) + 1,
        (cur[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      cur[j] = v;
      best = Math.min(best, v);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length] ?? max + 1;
}

/**
 * Ranked search: 0 exact code, 1 exact meaning/alias, 2 code prefix, 3 meaning/alias contains,
 * 4 other fields contain, 5 approximate (typo-tolerant) match. Exact matches always come first.
 */
export function rankedSearch(index: LibraryIndex, query: string): LibraryIndexEntry[] {
  const q = norm(query);
  if (!q) return index.entries;
  const terms = q.split(/\s+/).filter(Boolean);
  const scored: Array<[number, LibraryIndexEntry]> = [];
  for (const e of index.entries) {
    let s = -1;
    if (e.key === q) s = 0;
    else if (e.meaning === q || e.aliases.includes(q)) s = 1;
    else if (e.key.startsWith(q)) s = 2;
    else if (e.meaning.includes(q) || e.aliases.some((a) => a.includes(q))) s = 3;
    else if (terms.every((t) => e.haystack.includes(t))) s = 4;
    if (s >= 0) scored.push([s, e]);
  }
  if (scored.length === 0 && q.length >= 4) {
    const max = q.length >= 7 ? 2 : 1;
    for (const e of index.entries) {
      if (distance(q, e.meaning, max) <= max || e.aliases.some((a) => distance(q, a, max) <= max))
        scored.push([5, e]);
    }
  }
  return scored
    .sort(
      ([sa, a], [sb, b]) =>
        sa - sb ||
        Number(b.record.verified === true) - Number(a.record.verified === true) ||
        a.record.abbreviation.localeCompare(b.record.abbreviation) ||
        a.record.meaning.localeCompare(b.record.meaning),
    )
    .map(([, e]) => e);
}

export interface LibraryAnalysis {
  total: number;
  abbreviations: number;
  codes: number;
  verified: number;
  unverified: number;
  ambiguousCodes: number;
  duplicates: number;
  unclassified: number;
  byGroup: Array<[LibraryGroup, number]>;
  byLanguage: Array<[string, number]>;
}

/** All counters are derived from the real records — never typed by hand. */
export function analyzeLibrary(index: LibraryIndex): LibraryAnalysis {
  const groups = new Map<LibraryGroup, number>();
  const langs = new Map<string, number>();
  const senses = new Set<string>();
  let codes = 0,
    verified = 0,
    duplicates = 0,
    unclassified = 0;
  for (const e of index.entries) {
    if (e.nature === "code") codes++;
    if (e.record.verified) verified++;
    if (e.group === "Não classificado") unclassified++;
    groups.set(e.group, (groups.get(e.group) ?? 0) + 1);
    const lang = e.record.language || "Não classificado";
    langs.set(lang, (langs.get(lang) ?? 0) + 1);
    const sense = `${e.key}|${e.meaning}`;
    if (senses.has(sense)) duplicates++;
    else senses.add(sense);
  }
  let ambiguousCodes = 0;
  for (const list of index.byKey.values())
    if (new Set(list.map((e) => e.meaning)).size > 1) ambiguousCodes++;
  const total = index.entries.length;
  return {
    total,
    abbreviations: total - codes,
    codes,
    verified,
    unverified: total - verified,
    ambiguousCodes,
    duplicates,
    unclassified,
    byGroup: LIBRARY_GROUPS.map((g) => [g, groups.get(g) ?? 0] as [LibraryGroup, number]).filter(
      ([, n]) => n > 0,
    ),
    byLanguage: [...langs.entries()].sort((a, b) => b[1] - a[1]),
  };
}
