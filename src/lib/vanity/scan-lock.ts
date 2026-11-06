const LOCK_NAME = "dvf:verification";
export interface ScanLock {
  held: () => boolean;
  release: () => void;
}

/** Hold a real browser lock until the entire queue, including its in-flight request, finishes. */
export async function acquireScanLock(): Promise<ScanLock | null> {
  if (navigator.locks?.request) {
    return new Promise((resolve, reject) => {
      let released = false;
      let unlock: () => void = () => {};
      const done = new Promise<void>((r) => {
        unlock = r;
      });
      navigator.locks
        .request(LOCK_NAME, { ifAvailable: true }, async (lock) => {
          if (!lock) {
            resolve(null);
            return;
          }
          resolve({
            held: () => !released,
            release: () => {
              released = true;
              unlock();
            },
          });
          await done;
        })
        .catch(reject);
    });
  }
  return acquireIndexedDbLock();
}

/** A pending readwrite transaction is an atomic cross-tab mutex, not a racy storage lease.
 * Keep a request pending until release. No durable owner row can become stale after a crash.
 * If IndexedDB fails, scanning is disabled rather than running without protection.
 */
export function acquireIndexedDbLock(): Promise<ScanLock | null> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("dvf-coordination", 1);
    let settled = false;
    const fail = (error: unknown) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };
    open.onupgradeneeded = () => {
      open.result.createObjectStore("mutex");
    };
    open.onerror = () => fail(open.error);
    open.onblocked = () => fail(new Error("Bloqueio indisponível"));
    open.onsuccess = () => {
      const db = open.result;
      if (settled) {
        db.close();
        return;
      }
      const transaction = db.transaction("mutex", "readwrite");
      let held = false;
      let released = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          released = true;
          transaction.abort();
          db.close();
          resolve(null);
        }
      }, 600);
      const finish = () => {
        held = false;
        clearTimeout(timer);
        db.close();
        if (!settled) fail(new Error("Não foi possível manter o bloqueio entre abas."));
      };
      transaction.onabort = finish;
      transaction.onerror = finish;
      transaction.oncomplete = finish;
      const pump = () => {
        if (released) return;
        try {
          const request = transaction.objectStore("mutex").get(LOCK_NAME);
          request.onsuccess = () => {
            if (released) return;
            // Enqueue synchronously: Safari must never see an idle transaction.
            pump();
            if (!settled) {
              settled = true;
              held = true;
              clearTimeout(timer);
              resolve({
                held: () => held && !released,
                release: () => {
                  if (released) return;
                  released = true;
                  held = false;
                  transaction.abort();
                  db.close();
                },
              });
            }
          };
          request.onerror = () => fail(request.error);
        } catch (error) {
          finish();
          fail(error);
        }
      };
      pump();
    };
  });
}
