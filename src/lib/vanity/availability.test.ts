import { describe, expect, it } from "vitest";
import {
  AVAILABILITY_STATES,
  classifyAvailability,
  storedAvailabilityIsConsistent,
  type OfficialConfirmation,
} from "./availability";
import { normalizeCheckResult } from "./check-rules";
import { checkInviteFromBrowser } from "./invite-check.browser";
import { validateSavedData } from "./persistence";
const validateStored = (k: string, v: unknown) => validateSavedData(k, v, {}).value;
import { availabilityOf, needsCheck, toCompact } from "./scanner";

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

const check = (code: string, impl: () => Promise<Response>) =>
  checkInviteFromBrowser({ data: { code } }, impl as unknown as typeof fetch);

const official = (code: string): OfficialConfirmation => ({
  source: "discord_official",
  operation: "authorized-vanity-check",
  code,
  available: true,
  confirmedAt: "2026-01-01T00:00:00Z",
});

describe("Verified Availability via mocked Discord responses", () => {
  it("active invite → ACTIVE", async () => {
    const r = await check("abc", async () => json(200, { code: "abc", expires_at: null }));
    expect(r.availability).toBe("ACTIVE");
  });
  it("expired invite (expires_at in the past) → EXPIRED", async () => {
    const r = await check("abc", async () =>
      json(200, { code: "abc", expires_at: "2000-01-01T00:00:00Z" }),
    );
    expect(r.availability).toBe("EXPIRED");
  });
  it("HTTP 404 / Unknown Invite → NOT_IN_USE, never CONFIRMED_FREE", async () => {
    const r = await check("abc", async () => json(404, { code: 10006, message: "Unknown Invite" }));
    expect(r.availability).toBe("NOT_IN_USE");
    expect(r.discordErrorCode).toBe(10006);
  });
  it("HTTP 400 → INVALID", async () => {
    const r = await check("abc", async () => json(400, { code: 50035 }));
    expect(r.availability).toBe("INVALID");
  });
  it("HTTP 403 → BLOCKED", async () => {
    const r = await check("abc", async () => json(403, { code: 50001 }));
    expect(r.availability).toBe("BLOCKED");
  });
  it("HTTP 429 → UNKNOWN (not INVALID) and stays pending", async () => {
    const r = await check("abc", async () =>
      json(429, { retry_after: 5, global: false }, { "retry-after": "5" }),
    );
    expect(r.availability).toBe("UNKNOWN");
    expect(r.retryAfterSeconds).toBe(5);
    expect(needsCheck(toCompact(r))).toBe(true);
  });
  it("timeout → UNKNOWN", async () => {
    const r = await check("abc", async () => {
      throw Object.assign(new Error("t"), { name: "TimeoutError" });
    });
    expect(r.availability).toBe("UNKNOWN");
  });
  it("connection failure → UNKNOWN", async () => {
    const r = await check("abc", async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(r.availability).toBe("UNKNOWN");
  });
  it("unexpected status / body → UNKNOWN", async () => {
    expect((await check("abc", async () => json(418, {}))).availability).toBe("UNKNOWN");
    expect((await check("abc", async () => json(503, {}))).availability).toBe("UNKNOWN");
    expect((await check("abc", async () => json(200, { weird: true }))).availability).toBe(
      "UNKNOWN",
    );
  });
});

describe("Confirmation rules", () => {
  it("CONFIRMED_FREE only with a valid official confirmation for the same code", () => {
    const base = { code: "abc", httpStatus: 404, discordQueried: true };
    expect(classifyAvailability({ ...base, officialConfirmation: official("abc") })).toBe(
      "CONFIRMED_FREE",
    );
    expect(classifyAvailability({ ...base, officialConfirmation: official("xyz") })).toBe(
      "NOT_IN_USE",
    );
    expect(
      classifyAvailability({
        ...base,
        officialConfirmation: { ...official("abc"), source: "guess" } as never,
      }),
    ).toBe("NOT_IN_USE");
  });
  it("invalid code format → INVALID", () => {
    expect(classifyAvailability({ code: "-a", formatValid: false, httpStatus: null })).toBe(
      "INVALID",
    );
  });
  it("no inconclusive scenario ever yields CONFIRMED_FREE", () => {
    const https = [null, 200, 400, 401, 403, 404, 408, 429, 500, 502, 503];
    const kinds = [
      null,
      "timeout",
      "network",
      "rate_limit",
      "unexpected",
      "invalid_reply",
      "app_block",
    ];
    const queried = [true, false, null];
    for (const httpStatus of https)
      for (const errorKind of kinds)
        for (const discordQueried of queried)
          expect(
            classifyAvailability({ code: "abc", httpStatus, errorKind, discordQueried }),
          ).not.toBe("CONFIRMED_FREE");
  });
  it("a reply claiming CONFIRMED_FREE is recomputed from evidence", () => {
    const r = normalizeCheckResult("abc", {
      code: "abc",
      status: "not_found",
      httpStatus: 404,
      availability: "CONFIRMED_FREE",
      reason: "",
      checkedAt: new Date().toISOString(),
    });
    expect(r.availability).toBe("NOT_IN_USE");
  });
  it("exposes all eight states (seven categories plus INVALID)", () => {
    expect(AVAILABILITY_STATES).toHaveLength(8);
  });
});

describe("Persistence and resume", () => {
  it("EXPIRED survives save/load", async () => {
    const r = await check("abc", async () =>
      json(200, { code: "abc", expires_at: "2000-01-01T00:00:00Z" }),
    );
    const saved = validateStored("vanity-scan-results", { abc: toCompact(r) }) as Record<
      string,
      ReturnType<typeof toCompact>
    >;
    expect(availabilityOf(saved["abc"]!)).toBe("EXPIRED");
  });
  it("legacy results derive availability from HTTP status", () => {
    expect(availabilityOf(["e", 200, 1])).toBe("ACTIVE");
    expect(availabilityOf(["n", 404, 1])).toBe("NOT_IN_USE");
    expect(availabilityOf(["x", 429, 1, "d"])).toBe("UNKNOWN");
  });
  it("tampered CONFIRMED_FREE on a 429 or 200 is rejected on load", () => {
    expect(storedAvailabilityIsConsistent(429, "F")).toBe(false);
    expect(storedAvailabilityIsConsistent(200, "F")).toBe(false);
    const saved = validateStored("vanity-scan-results", { abc: ["x", 429, 1, "d", "F"] });
    expect(saved).toEqual({});
  });
  it("resume: rate-limited codes still need a check, answered ones do not", async () => {
    const limited = await check("abc", async () => json(429, { retry_after: 1 }));
    const active = await check("abd", async () => json(200, { code: "abd" }));
    expect(needsCheck(toCompact(limited))).toBe(true);
    expect(needsCheck(toCompact(active))).toBe(false);
  });
});
