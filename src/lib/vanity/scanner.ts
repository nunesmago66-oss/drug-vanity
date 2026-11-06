import {
  AVAILABILITY_TO_KEY,
  KEY_TO_AVAILABILITY,
  availabilityFromHttp,
  emptyAvailabilityCounts,
  isOfficialConfirmation,
  migrateStoredAvailability,
  type OfficialConfirmation,
  type Availability,
  type AvailabilityCounts,
  type AvailabilityKey,
} from "./availability";
import {
  STATUS_LABEL,
  classifyHttpStatus,
  type CheckResult,
  type CheckStatus,
} from "./check-rules";

export const LETTERS = "abcdefghijklmnopqrstuvwxyz";
export const DIGITS = "0123456789";

export type Charset = "letters" | "alnum";
export const CHARSET_LABEL: Record<Charset, string> = {
  letters: "Só letras (a–z)",
  alnum: "Letras + números (a–z, 0–9)",
};

export interface ScannerConfig {
  source: "generated" | "catalog";
  len2: boolean;
  len3: boolean;
  charset: Charset;
  intervalMs: number;
  batch: number;
  keepAwake: boolean;
}

export const DEFAULT_SCANNER_CONFIG: ScannerConfig = {
  source: "generated",
  len2: true,
  len3: true,
  charset: "letters",
  // 0 = automatic pace that adapts to Discord's real answers.
  intervalMs: 0,
  batch: 100,
  keepAwake: true,
};

const alphabet = (c: Charset) => (c === "letters" ? LETTERS : LETTERS + DIGITS);

/** All codes of the chosen lengths, shortest first, in lexicographic order. */
export function generateCandidates(len2: boolean, len3: boolean, charset: Charset): string[] {
  const chars = alphabet(charset);
  const out: string[] = [];
  if (len2) for (const a of chars) for (const b of chars) out.push(a + b);
  if (len3)
    for (const a of chars) for (const b of chars) for (const c of chars) out.push(a + b + c);
  return out;
}

export function countCandidates(len2: boolean, len3: boolean, charset: Charset): number {
  const n = alphabet(charset).length;
  return (len2 ? n ** 2 : 0) + (len3 ? n ** 3 : 0);
}

/* ---------- compact result storage (fits ~48k codes in localStorage) ---------- */

export type StatusKey = "e" | "n" | "x";
/**
 * Origin of an error/rate-limit result, stored only on error results
 * (absent on legacy data = origin not recorded):
 * "d" = Discord's API answered, "c" = Cloudflare protection in front of
 * Discord answered (429 page), "t" = timeout, "f" = connection failure,
 * "a" = the app answered by itself without contacting Discord.
 */
export type OriginKey = "d" | "c" | "t" | "f" | "a";
export const ORIGIN_KEYS: readonly OriginKey[] = ["d", "c", "t", "f", "a"];

function originOf(r: CheckResult): OriginKey | null {
  if (r.discordQueried === false) return "a";
  if (r.discordQueried !== true) return null;
  if (r.httpStatus === 429 && r.limitLayer === "cloudflare_edge") return "c";
  if (r.httpStatus === null && r.errorKind === "timeout") return "t";
  if (r.httpStatus === null && r.errorKind === "network") return "f";
  return "d";
}
/**
 * [status, http status or null, checked-at epoch seconds, origin?, availability?, confirmation?]
 * The availability key is stored only when it is not implied by the HTTP status
 * (e.g. EXPIRED); origin is then null on non-error results. "F" (Liberada) is
 * stored only together with the official confirmation object for that code.
 */
export type CompactResult = [
  StatusKey,
  number | null,
  number,
  (OriginKey | null)?,
  AvailabilityKey?,
  OfficialConfirmation?,
];
export type ResultsMap = Record<string, CompactResult>;

const TO_KEY: Record<CheckStatus, StatusKey> = { exists: "e", not_found: "n", inconclusive: "x" };
const FROM_KEY: Record<StatusKey, CheckStatus> = { e: "exists", n: "not_found", x: "inconclusive" };

export function toCompact(r: CheckResult): CompactResult {
  const t = Date.parse(r.checkedAt);
  const base: CompactResult = [
    TO_KEY[r.status],
    r.httpStatus,
    Math.floor((Number.isFinite(t) ? t : Date.now()) / 1000),
  ];
  const origin = r.status === "inconclusive" ? originOf(r) : null;
  if (origin) base.push(origin);
  const avail = r.availability;
  const proof =
    avail === "CONFIRMED_FREE" && isOfficialConfirmation(r.code, r.officialConfirmation)
      ? r.officialConfirmation
      : null;
  // "Liberada" without a verifiable confirmation for this code is never stored;
  // the record keeps what its HTTP status implies (404 → NOT_IN_USE).
  if (
    avail &&
    avail !== availabilityFromHttp(r.httpStatus) &&
    (avail !== "CONFIRMED_FREE" || proof)
  ) {
    if (!origin) base.push(null);
    base.push(AVAILABILITY_TO_KEY[avail]);
    if (proof) base.push(proof);
  }
  return base;
}

/**
 * Validates and migrates one stored result for `code` (shared by local storage,
 * backups and the background state). Returns null only for a structurally
 * unusable record; an unsupported availability key (e.g. legacy "F" without an
 * official confirmation) is dropped instead, keeping the record and its check.
 */
export function sanitizeCompact(code: string, r: unknown): CompactResult | null {
  if (!Array.isArray(r) || r.length < 3 || r.length > 6) return null;
  const http = r[1];
  if (!(http === null || (Number.isInteger(http) && http >= 100 && http <= 599))) return null;
  if (typeof r[2] !== "number" || !Number.isFinite(r[2]) || r[2] < 0) return null;
  if (r.length >= 4 && !(r[3] === null || (ORIGIN_KEYS as readonly unknown[]).includes(r[3])))
    return null;
  const status = classifyHttpStatus(http as number | null);
  const rec: CompactResult = [TO_KEY[status], http as number | null, r[2]];
  const origin = status === "inconclusive" && r.length >= 4 ? (r[3] as OriginKey | null) : null;
  if (origin) rec.push(origin);
  const key =
    r.length >= 5 ? migrateStoredAvailability(code, http as number | null, r[4], r[5]) : null;
  if (key) {
    if (!origin) rec.push(null);
    rec.push(key);
    if (key === "F") rec.push(r[5] as OfficialConfirmation);
  }
  return rec;
}

/**
 * VERIFIED AVAILABILITY (category) of a saved result — exactly one per result.
 * Legacy entries derive it from the HTTP status; a stored key always wins.
 */
export function availabilityOf(c: CompactResult, code?: string): Availability {
  const key = c[4];
  if (key === "F") {
    // Defense in depth: "Liberada" only with a confirmation bound to the code.
    const proof = c[5];
    const bound = code ?? (proof && typeof proof === "object" ? proof.code : undefined);
    return c[1] === 404 && typeof bound === "string" && isOfficialConfirmation(bound, proof)
      ? "CONFIRMED_FREE"
      : availabilityFromHttp(c[1]);
  }
  return key && KEY_TO_AVAILABILITY[key] ? KEY_TO_AVAILABILITY[key] : availabilityFromHttp(c[1]);
}

/** Independent per-category counters; every result is counted in exactly one category. */
export function countAvailability(results: ResultsMap): AvailabilityCounts {
  const counts = emptyAvailabilityCounts();
  for (const [code, r] of Object.entries(results)) counts[availabilityOf(r, code)]++;
  return counts;
}

export const statusOf = (c: CompactResult): CheckStatus => FROM_KEY[c[0]];

/**
 * Error class of a saved result (see errorClassOf): 429s and app-side answers
 * saved by older versions are "rate_limit" — not a result, still pending.
 */
export function compactErrorClass(
  c: CompactResult,
): "rate_limit" | "temporary" | "permanent" | null {
  const [s, http, , origin] = c;
  if (s !== "x") return null;
  if (http === 429 || origin === "a") return "rate_limit";
  if (http === null || http >= 500 || http === 403 || http === 408) return "temporary";
  return "permanent";
}

/** A code still needs a check: no saved result, or only a rate-limit / app-side block. */
export const needsCheck = (c: CompactResult | undefined) =>
  !c || compactErrorClass(c) === "rate_limit";

export function describeResult(c: CompactResult): string {
  const [s, http, , origin] = c;
  if (s === "e") return "Existe um convite ativo com este código (HTTP 200).";
  if (s === "n")
    return "Nenhum convite encontrado (HTTP 404). Disponibilidade de vanity URL NÃO confirmada.";
  if (http === 429) {
    if (origin === "d") return "O Discord retornou limite de taxa (HTTP 429).";
    if (origin === "c")
      return "A proteção da Cloudflare na frente do Discord bloqueou a consulta (HTTP 429).";
    if (origin === "a")
      return "Bloqueio preventivo do app (limite de taxa recente ainda ativo). O Discord não foi consultado.";
    return "Limite de taxa (HTTP 429) — origem não registrada.";
  }
  if (http != null && http >= 500)
    return `Falha temporária do servidor do Discord (HTTP ${http}). Não é um resultado.`;
  if (http != null) return `Resposta inesperada (HTTP ${http}).`;
  if (origin === "a")
    return "Consulta não enviada pelo app (intervalo mínimo). O Discord não foi consultado.";
  if (origin === "t") return "Tempo esgotado ao consultar o Discord. Não é um resultado.";
  if (origin === "f") return "Falha de conexão ao consultar o Discord. Não é um resultado.";
  return "Falha de rede ou tempo esgotado. Não é um resultado.";
}

export const statusLabelOf = (c: CompactResult) => STATUS_LABEL[statusOf(c)];

export function formatDuration(ms: number): string {
  const totalMin = Math.ceil(ms / 60000);
  if (totalMin < 1) return "menos de 1 min";
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  return [d && `${d} d`, h && `${h} h`, m && `${m} min`].filter(Boolean).join(" ");
}
