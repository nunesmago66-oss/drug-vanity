import type { CatalogEntry } from "./catalog";
import {
  ABBREVIATION_STORAGE_KEY,
  normalizeAbbreviationUserData,
  mergeAbbreviationUserData,
  type AbbreviationUserData,
} from "./abbreviation-library";
import { validateSavedData } from "./persistence";
import type { ResultsMap, ScannerConfig } from "./scanner";
import { STATS_KEY, type StatsLog } from "./stats";

/**
 * Full device backup and restore. Timing keys (cooldown / last check) are never
 * exported or imported, so restoring a file can never shorten a rate-limit wait.
 */
export const BACKUP_FORMAT = "drug-url-backup";
export const BACKUP_VERSION = 1;
/** Files larger than this are rejected before parsing (≈ 10× a full 48k-result backup). */
export const MAX_BACKUP_BYTES = 25 * 1024 * 1024;

export interface BackupData {
  results: ResultsMap;
  meaningResults: ResultsMap;
  catalog: CatalogEntry[];
  selected: string[];
  config: ScannerConfig;
  meaningConfig: ScannerConfig;
  meaningFilters: Record<string, unknown>;
  /** Verification history used by the dashboard. */
  stats: StatsLog;
  /** User-created abbreviation entries, favorites and recent lookups. */
  abbreviations: AbbreviationUserData;
}

/** Storage key each backup field is validated with (same rules as saved data). */
export const BACKUP_KEYS: Record<keyof BackupData, string> = {
  results: "dvf:results:v1",
  meaningResults: "dvf:meaning-results:v1",
  catalog: "dvf:catalog:v1",
  selected: "dvf:selected",
  config: "dvf:scanner-config:v1",
  meaningConfig: "dvf:meaning-config:v1",
  meaningFilters: "dvf:meaning-filters:v1",
  stats: STATS_KEY,
  abbreviations: ABBREVIATION_STORAGE_KEY,
};

export function buildBackup(data: BackupData, now = new Date()): string {
  return JSON.stringify({
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: now.toISOString(),
    data,
  });
}

export interface ParsedBackup {
  createdAt: string | null;
  /** Only fields present in the file and valid; missing fields are left untouched on restore. */
  data: Partial<BackupData>;
  /** Number of records dropped because they failed validation. */
  skipped: number;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const size = (v: unknown) =>
  Array.isArray(v) ? v.length : isObject(v) ? Object.keys(v).length : 0;

export function parseBackup(text: string, defaults: BackupData): ParsedBackup {
  if (text.length > MAX_BACKUP_BYTES) throw new Error("Arquivo grande demais para ser um backup.");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("O arquivo não é um JSON válido.");
  }
  if (!isObject(raw) || raw["format"] !== BACKUP_FORMAT || !isObject(raw["data"]))
    throw new Error("Este arquivo não é um backup do DRUG URL.");
  if (raw["version"] !== BACKUP_VERSION)
    throw new Error("Versão de backup não suportada por esta versão do app.");
  const input = raw["data"];
  const data: Partial<BackupData> = {};
  let skipped = 0;
  for (const field of Object.keys(BACKUP_KEYS) as (keyof BackupData)[]) {
    if (!(field in input)) continue;
    const { value } =
      field === "abbreviations"
        ? { value: normalizeAbbreviationUserData(input[field]) }
        : validateSavedData(BACKUP_KEYS[field], input[field], defaults[field]);
    if (Array.isArray(input[field]) || field === "results" || field === "meaningResults")
      skipped += Math.max(0, size(input[field]) - size(value));
    (data as Record<string, unknown>)[field] = value;
  }
  const createdAt = typeof raw["createdAt"] === "string" ? raw["createdAt"] : null;
  return { createdAt, data, skipped };
}

/** Union of both maps; when a code exists in both, the most recent check wins. */
export function mergeResults(current: ResultsMap, incoming: ResultsMap): ResultsMap {
  const out: ResultsMap = { ...current };
  for (const [code, rec] of Object.entries(incoming)) {
    const prev = out[code];
    if (!prev || rec[2] > prev[2]) out[code] = rec;
  }
  return out;
}

/** Keeps every current entry, adds new codes from the backup and keeps a favorite mark from either side. */
export function mergeCatalog(current: CatalogEntry[], incoming: CatalogEntry[]): CatalogEntry[] {
  const byCode = new Map(current.map((e) => [e.code, e]));
  const out = current.map((e) => {
    const other = incoming.find((i) => i.code === e.code);
    return other?.favorite && !e.favorite ? { ...e, favorite: true } : e;
  });
  for (const e of incoming) if (!byCode.has(e.code)) out.push(e);
  return out;
}

export const mergeSelected = (current: string[], incoming: string[]) => [
  ...new Set([...current, ...incoming]),
];

export function summarizeBackup(data: Partial<BackupData>) {
  return {
    results: size(data.results),
    meaningResults: size(data.meaningResults),
    catalog: size(data.catalog),
    favorites: data.catalog?.filter((e) => e.favorite).length ?? 0,
    selected: size(data.selected),
    checks: data.stats?.total.c ?? 0,
    abbreviations: data.abbreviations?.custom.length ?? 0,
    abbreviationFavorites: data.abbreviations?.favorites.length ?? 0,
  };
}
