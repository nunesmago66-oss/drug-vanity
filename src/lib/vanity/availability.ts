/**
 * VERIFIED AVAILABILITY — evidence-based classification of a Discord invite code.
 *
 * Official limitation (documented in VERIFIED-AVAILABILITY.md): Discord's public
 * API has NO operation that confirms a vanity code is free to claim.
 * GET /invites/{code} answers 404 (error 10006 "Unknown Invite") for codes that
 * never existed, expired, were revoked, or are reserved/held by a server — the
 * cases are indistinguishable. Therefore:
 *   - 404 is never CONFIRMED_FREE: it is NOT_IN_USE ("não está em uso" — no
 *     invite answers for the code), a different category from "liberada";
 *   - errors, timeouts, 429 and unexpected answers are UNKNOWN (or BLOCKED for 403);
 *   - CONFIRMED_FREE is only produced from an explicit official confirmation
 *     object; the scanner never fabricates one.
 */

export type Availability =
  | "CONFIRMED_FREE"
  | "ACTIVE"
  | "NOT_IN_USE"
  | "INVALID"
  | "EXPIRED"
  | "REVOKED"
  | "BLOCKED"
  | "UNKNOWN";

export const AVAILABILITY_STATES: readonly Availability[] = [
  "CONFIRMED_FREE",
  "ACTIVE",
  "NOT_IN_USE",
  "INVALID",
  "EXPIRED",
  "REVOKED",
  "BLOCKED",
  "UNKNOWN",
];

export const AVAILABILITY_LABEL: Record<Availability, string> = {
  CONFIRMED_FREE: "Liberada (confirmação oficial)",
  ACTIVE: "Ativa",
  NOT_IN_USE: "Não está em uso",
  INVALID: "Inválida",
  EXPIRED: "Expirada",
  REVOKED: "Revogada",
  BLOCKED: "Bloqueada",
  UNKNOWN: "Indefinida",
};

/** Plural names used by filters and counters (one category per result). */
export const AVAILABILITY_PLURAL: Record<Availability, string> = {
  CONFIRMED_FREE: "Liberadas",
  ACTIVE: "Ativas",
  NOT_IN_USE: "Não estão em uso",
  INVALID: "Inválidas",
  EXPIRED: "Expiradas",
  REVOKED: "Revogadas",
  BLOCKED: "Bloqueadas",
  UNKNOWN: "Indefinidas",
};

/** Display order of the categories in filters and counters. */
export const CATEGORY_ORDER: readonly Availability[] = [
  "ACTIVE",
  "NOT_IN_USE",
  "CONFIRMED_FREE",
  "EXPIRED",
  "REVOKED",
  "BLOCKED",
  "UNKNOWN",
  "INVALID",
];

export type AvailabilityCounts = Record<Availability, number>;
export const emptyAvailabilityCounts = (): AvailabilityCounts => ({
  CONFIRMED_FREE: 0,
  ACTIVE: 0,
  NOT_IN_USE: 0,
  INVALID: 0,
  EXPIRED: 0,
  REVOKED: 0,
  BLOCKED: 0,
  UNKNOWN: 0,
});

/** Discord JSON error codes we read from the response body. */
export const DISCORD_UNKNOWN_INVITE = 10006;
export const DISCORD_INVALID_FORM_BODY = 50035;

/**
 * Positive confirmation from an authorized official Discord operation.
 * Only accepted when every field matches exactly; nothing in the public
 * scanner produces it (Discord offers no such endpoint).
 */
export interface OfficialConfirmation {
  source: "discord_official";
  operation: string;
  code: string;
  available: true;
  confirmedAt: string;
}

export interface AvailabilityEvidence {
  code: string;
  /** false when the code fails the local format rules (never sent to Discord). */
  formatValid?: boolean;
  httpStatus: number | null;
  discordQueried?: boolean | null;
  errorKind?: string | null;
  /** `code` field of a Discord JSON error body. */
  discordErrorCode?: number | null;
  /** `expires_at` of a 200 invite body. */
  expiresAt?: string | null;
  /** true only when the 200 body is a real invite object for this code. */
  inviteBodyValid?: boolean | null;
  officialConfirmation?: OfficialConfirmation | null;
  nowMs?: number;
}

export function isOfficialConfirmation(code: string, c: unknown): c is OfficialConfirmation {
  if (!c || typeof c !== "object") return false;
  const o = c as Record<string, unknown>;
  return (
    o["source"] === "discord_official" &&
    o["available"] === true &&
    o["code"] === code &&
    typeof o["operation"] === "string" &&
    o["operation"].length > 0 &&
    typeof o["confirmedAt"] === "string" &&
    Number.isFinite(Date.parse(o["confirmedAt"]))
  );
}

export function classifyAvailability(e: AvailabilityEvidence): Availability {
  if (e.formatValid === false) return "INVALID";
  // App-side blocks and anything not answered by Discord prove nothing.
  if (e.discordQueried === false) return "UNKNOWN";
  if (
    e.errorKind === "timeout" ||
    e.errorKind === "network" ||
    e.errorKind === "cors_blocked" ||
    e.errorKind === "edge_challenge" ||
    e.errorKind === "app_error" ||
    e.errorKind === "invalid_reply"
  )
    return "UNKNOWN";

  const http = e.httpStatus;
  if (http === 200) {
    // A 200 is ACTIVE only when the body is a real invite for this code; an
    // explicit false/null (invalid or unreadable body) proves nothing.
    // undefined = legacy caller that never carried body evidence.
    if (e.inviteBodyValid === false || e.inviteBodyValid === null) return "UNKNOWN";
    if (e.expiresAt) {
      const t = Date.parse(e.expiresAt);
      if (Number.isFinite(t) && t <= (e.nowMs ?? Date.now())) return "EXPIRED";
    }
    return "ACTIVE";
  }
  if (http === 400) return "INVALID";
  if (http === 403) return "BLOCKED";
  // 404 / 10006: no invite answers for the code → NOT_IN_USE. Never-existed,
  // expired, revoked and reserved look identical, so it is NOT "liberada".
  // Only an explicit official confirmation can upgrade it to CONFIRMED_FREE.
  if (http === 404) {
    return isOfficialConfirmation(e.code, e.officialConfirmation) ? "CONFIRMED_FREE" : "NOT_IN_USE";
  }
  // 429, 5xx, null, any other code → never a result.
  return "UNKNOWN";
}

/** Reads the small fields we need from a Discord JSON body (never throws). */
export function readInviteBody(
  code: string,
  httpStatus: number,
  bodyText: string,
): Pick<AvailabilityEvidence, "discordErrorCode" | "expiresAt" | "inviteBodyValid"> {
  let body: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(bodyText);
    body = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    body = null;
  }
  if (httpStatus === 200) {
    const valid = !!body && typeof body["code"] === "string" && body["code"].toLowerCase() === code;
    return {
      discordErrorCode: null,
      // Unparseable / non-object 200 body is malformed, never an invite.
      inviteBodyValid: valid,
      expiresAt:
        valid && typeof body!["expires_at"] === "string" ? (body!["expires_at"] as string) : null,
    };
  }
  return {
    discordErrorCode: body && typeof body["code"] === "number" ? (body["code"] as number) : null,
    expiresAt: null,
    inviteBodyValid: null,
  };
}

/* ---------- compact keys (5th element of a saved result) ---------- */

export type AvailabilityKey = "F" | "A" | "N" | "I" | "E" | "R" | "B" | "U";
export const AVAILABILITY_TO_KEY: Record<Availability, AvailabilityKey> = {
  CONFIRMED_FREE: "F",
  ACTIVE: "A",
  NOT_IN_USE: "N",
  INVALID: "I",
  EXPIRED: "E",
  REVOKED: "R",
  BLOCKED: "B",
  UNKNOWN: "U",
};
export const AVAILABILITY_KEYS: readonly AvailabilityKey[] = [
  "F",
  "A",
  "N",
  "I",
  "E",
  "R",
  "B",
  "U",
];
export const KEY_TO_AVAILABILITY = Object.fromEntries(
  Object.entries(AVAILABILITY_TO_KEY).map(([k, v]) => [v, k]),
) as Record<AvailabilityKey, Availability>;

/** What a saved result implies when no explicit availability key was stored (legacy data). */
export function availabilityFromHttp(httpStatus: number | null): Availability {
  if (httpStatus === 200) return "ACTIVE";
  if (httpStatus === 404) return "NOT_IN_USE";
  if (httpStatus === 400) return "INVALID";
  if (httpStatus === 403) return "BLOCKED";
  return "UNKNOWN";
}

/**
 * A stored key is accepted only if consistent with the HTTP status, so a
 * tampered backup can never show a 404/429/error as CONFIRMED_FREE.
 * "F" additionally requires the official confirmation object stored with the
 * record and bound to the same code; a bare "F" + 404 is NOT enough.
 */
export function storedAvailabilityIsConsistent(
  httpStatus: number | null,
  key: AvailabilityKey,
  code?: string,
  proof?: unknown,
): boolean {
  const a = KEY_TO_AVAILABILITY[key];
  if (!a) return false;
  if (a === "EXPIRED") return httpStatus === 200;
  if (a === "CONFIRMED_FREE")
    return httpStatus === 404 && typeof code === "string" && isOfficialConfirmation(code, proof);
  return a === availabilityFromHttp(httpStatus) || a === "UNKNOWN";
}

/**
 * Safe migration of a stored availability key: a key the evidence does not
 * support (e.g. legacy "F" without a confirmation for this code) is dropped,
 * so the record falls back to what its HTTP status implies (404 → NOT_IN_USE)
 * instead of being deleted. Returns the key to keep, or null.
 */
export function migrateStoredAvailability(
  code: string,
  httpStatus: number | null,
  key: unknown,
  proof?: unknown,
): AvailabilityKey | null {
  if (!AVAILABILITY_KEYS.includes(key as AvailabilityKey)) return null;
  return storedAvailabilityIsConsistent(httpStatus, key as AvailabilityKey, code, proof)
    ? (key as AvailabilityKey)
    : null;
}
