import { afterEach, expect, it, vi } from "vitest";
import { acquireScanLock } from "./scan-lock";

afterEach(() => vi.unstubAllGlobals());
it("holds Web Locks across requests and rejects a simultaneous scanner", async () => {
  let busy = false;
  vi.stubGlobal("navigator", {
    locks: {
      request: async (
        _name: string,
        _options: unknown,
        cb: (lock: object | null) => Promise<void>,
      ) => {
        if (busy) return cb(null);
        busy = true;
        try {
          await cb({});
        } finally {
          busy = false;
        }
      },
    },
  });
  const first = await acquireScanLock();
  expect(first?.held()).toBe(true);
  expect(await acquireScanLock()).toBeNull();
  first?.release();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const second = await acquireScanLock();
  expect(second?.held()).toBe(true);
  second?.release();
});
it("fails closed when no safe browser coordinator exists", async () => {
  vi.stubGlobal("navigator", {});
  vi.stubGlobal("indexedDB", {
    open: () => {
      throw new Error("Unavailable");
    },
  });
  await expect(acquireScanLock()).rejects.toThrow("Unavailable");
});
