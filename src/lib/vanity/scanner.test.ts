import { describe, expect, it } from "vitest";
import {
  countCandidates,
  describeResult,
  generateCandidates,
  statusOf,
  toCompact,
} from "./scanner";

describe("generateCandidates", () => {
  it("letters only: 676 + 17576 codes", () => {
    const list = generateCandidates(true, true, "letters");
    expect(list.length).toBe(18252);
    expect(list[0]).toBe("aa");
    expect(list.at(-1)).toBe("zzz");
  });
  it("letters + digits: 1296 + 46656 codes", () => {
    expect(countCandidates(true, true, "alnum")).toBe(47952);
    expect(generateCandidates(true, false, "alnum")).toContain("a1");
  });
});

describe("compact results", () => {
  it("keeps 404 as not found, never as available", () => {
    const c = toCompact({
      code: "zq",
      status: "not_found",
      httpStatus: 404,
      retryAfterSeconds: null,
      reason: "",
      checkedAt: "2026-01-01T00:00:00Z",
    });
    expect(statusOf(c)).toBe("not_found");
  });
});

describe("rate-limit origin in compact results", () => {
  const base = {
    code: "zq",
    status: "inconclusive" as const,
    httpStatus: 429,
    retryAfterSeconds: 5,
    reason: "",
    checkedAt: "2026-01-01T00:00:00Z",
  };
  it("marks a Discord 429 and a preventive block differently", () => {
    expect(toCompact({ ...base, discordQueried: true })[3]).toBe("d");
    expect(toCompact({ ...base, discordQueried: false })[3]).toBe("a");
    expect(describeResult(toCompact({ ...base, discordQueried: false }))).toContain(
      "O Discord não foi consultado",
    );
    expect(describeResult(toCompact({ ...base, discordQueried: true }))).toContain(
      "O Discord retornou",
    );
  });
  it("does not add a marker to 200/404 results", () => {
    expect(
      toCompact({ ...base, status: "not_found", httpStatus: 404, discordQueried: true }),
    ).toHaveLength(3);
  });
});

describe("failure kinds in compact results", () => {
  const base = {
    code: "zq",
    status: "inconclusive" as const,
    retryAfterSeconds: null,
    reason: "",
    checkedAt: "2026-01-01T00:00:00Z",
    discordQueried: true,
  };
  it("records Cloudflare protection, timeout and connection failure separately", () => {
    expect(toCompact({ ...base, httpStatus: 429, limitLayer: "cloudflare_edge" })[3]).toBe("c");
    expect(toCompact({ ...base, httpStatus: null, errorKind: "timeout" })[3]).toBe("t");
    expect(toCompact({ ...base, httpStatus: null, errorKind: "network" })[3]).toBe("f");
  });
  it("a 5xx is described as a temporary failure, not a result", () => {
    expect(describeResult(["x", 503, 1, "d"])).toContain("Falha temporária");
  });
});
