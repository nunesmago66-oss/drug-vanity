/**
 * Audit fixes: 200 body evidence survives normalization, and "Liberada"
 * requires an official confirmation bound to the code everywhere it is stored.
 */
import { describe, expect, it } from "vitest";

import { readInviteBody, type OfficialConfirmation } from "./availability";
import { validateResults } from "./background-protocol";
import { normalizeCheckResult, type CheckResult } from "./check-rules";
import { validateSavedData } from "./persistence";
import { availabilityOf, toCompact, type ResultsMap } from "./scanner";
import { EMPTY_STATS, historyAvailability, recordCheck, validateStats } from "./stats";

const official = (code: string): OfficialConfirmation => ({
  source: "discord_official",
  operation: "authorized-vanity-check",
  code,
  available: true,
  confirmedAt: "2026-01-01T00:00:00Z",
});
const reply = (over: Record<string, unknown>) => ({
  code: "abc",
  status: "exists",
  httpStatus: 200,
  retryAfterSeconds: null,
  reason: "",
  checkedAt: "2026-11-06T12:00:00Z",
  discordQueried: true,
  ...over,
});

describe("normalizeCheckResult keeps 200 body evidence", () => {
  it("valid invite body → ACTIVE", () => {
    const r = normalizeCheckResult("abc", reply({ inviteBodyValid: true }));
    expect(r.availability).toBe("ACTIVE");
    expect(r.inviteBodyValid).toBe(true);
  });
  it("invalid invite body → never ACTIVE", () => {
    const r = normalizeCheckResult(
      "abc",
      reply({ inviteBodyValid: false, availability: "ACTIVE" }),
    );
    expect(r.availability).toBe("UNKNOWN");
    expect(r.inviteBodyValid).toBe(false);
    expect(availabilityOf(toCompact(r), "abc")).toBe("UNKNOWN");
  });
  it("malformed evidence (null, string, number) → never ACTIVE", () => {
    for (const v of [null, "yes", 1, {}])
      expect(normalizeCheckResult("abc", reply({ inviteBodyValid: v })).availability).toBe(
        "UNKNOWN",
      );
  });
  it("a reply cannot declare itself LIBERADA", () => {
    const r = normalizeCheckResult(
      "abc",
      reply({
        status: "not_found",
        httpStatus: 404,
        availability: "CONFIRMED_FREE",
        officialConfirmation: official("abc"),
      }),
    );
    expect(r.availability).toBe("NOT_IN_USE");
  });
  it("readInviteBody: unparseable or wrong-code 200 body is invalid", () => {
    expect(readInviteBody("abc", 200, "<html>").inviteBodyValid).toBe(false);
    expect(readInviteBody("abc", 200, '{"code":"zzz"}').inviteBodyValid).toBe(false);
    expect(readInviteBody("abc", 200, '{"code":"abc"}').inviteBodyValid).toBe(true);
  });
});

describe("LIBERADA requires a confirmation bound to the code", () => {
  it("legacy 'F' + 404 without confirmation is migrated to NOT_IN_USE, record kept", () => {
    const legacy = { abc: ["n", 404, 5, null, "F"], abd: ["e", 200, 6] };
    const { value } = validateSavedData("dvf:results:v1", legacy, {});
    const v = value as ResultsMap;
    expect(Object.keys(v).sort()).toEqual(["abc", "abd"]);
    expect(v["abc"]).toEqual(["n", 404, 5]);
    expect(availabilityOf(v["abc"]!, "abc")).toBe("NOT_IN_USE");
    const bg = validateResults(legacy);
    expect(availabilityOf(bg["abc"]!, "abc")).toBe("NOT_IN_USE");
  });
  it("a confirmation for another code does not count", () => {
    const { value } = validateSavedData(
      "dvf:results:v1",
      { abc: ["n", 404, 5, null, "F", official("xyz")] },
      {},
    );
    expect(availabilityOf((value as ResultsMap)["abc"]!, "abc")).toBe("NOT_IN_USE");
  });
  it("a bound confirmation survives storage and reload", () => {
    const r: CheckResult = {
      code: "abc",
      status: "not_found",
      httpStatus: 404,
      retryAfterSeconds: null,
      reason: "",
      checkedAt: "2026-11-06T12:00:00Z",
      availability: "CONFIRMED_FREE",
      officialConfirmation: official("abc"),
    };
    const { value } = validateSavedData(
      "dvf:results:v1",
      JSON.parse(JSON.stringify({ abc: toCompact(r) })),
      {},
    );
    expect(availabilityOf((value as ResultsMap)["abc"]!, "abc")).toBe("CONFIRMED_FREE");
  });
  it("CONFIRMED_FREE without proof is not stored as LIBERADA", () => {
    const c = toCompact({
      code: "abc",
      status: "not_found",
      httpStatus: 404,
      retryAfterSeconds: null,
      reason: "",
      checkedAt: "2026-11-06T12:00:00Z",
      availability: "CONFIRMED_FREE",
    });
    expect(availabilityOf(c, "abc")).toBe("NOT_IN_USE");
  });
  it("history: 'F' without confirmation is kept as NOT_IN_USE; with it, LIBERADA", () => {
    const legacy = validateStats({
      ...EMPTY_STATS,
      recent: [["abc", "n", 404, 1, "a", null, "F"]],
    })!;
    expect(legacy.recent.map(historyAvailability)).toEqual(["NOT_IN_USE"]);
    const stats = recordCheck(EMPTY_STATS, {
      code: "abc",
      status: "n",
      http: 404,
      at: 1_000_000,
      mode: "a",
      responseMs: null,
      availability: "CONFIRMED_FREE",
    });
    expect(stats.recent.map(historyAvailability)).toEqual(["NOT_IN_USE"]);
  });
});
