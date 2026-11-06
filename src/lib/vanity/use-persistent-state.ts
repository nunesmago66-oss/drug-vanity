import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  clearStorageError,
  decodeSavedData,
  isTimingKey,
  reconcileTiming,
  encodeSavedData,
  getStorageIssues,
  recoveryKey,
  registerSaveRetry,
  rememberInMemory,
  rememberOriginal,
  reportStorageIssue,
} from "./persistence";

type StoreKind = "local" | "session";

function getStore(kind: StoreKind): Storage {
  return kind === "local" ? window.localStorage : window.sessionStorage;
}

/**
 * Hydration-safe persisted state: renders `initial` on the server, loads storage after mount.
 * `throttleMs` coalesces frequent writes (e.g. one result per second during a scan) into at
 * most one save per interval; pending changes are flushed when the page is hidden or closed,
 * on unmount, and whenever retryStorageSaves() runs.
 */
export function usePersistentState<T>(
  key: string,
  initial: T,
  kind: StoreKind = "local",
  throttleMs = 0,
): [T, Dispatch<SetStateAction<T>>, boolean] {
  const [value, setValue] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);
  const target = useRef(key);
  const loadedRaw = useRef<string | null>(null);
  const loadedValue = useRef<T>(initial);
  const readFailed = useRef(false);
  const valueRef = useRef(value);
  valueRef.current = value;
  const lastSaveAt = useRef(0);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef<() => void>(() => {});

  useEffect(() => {
    target.current = key;
    readFailed.current = false;
    try {
      const store = getStore(kind);
      const original = store.getItem(key);
      const recovered = store.getItem(recoveryKey(key));
      const raw = recovered ?? original;
      if (original !== null) rememberOriginal(key, original);
      const decoded: { value: unknown; recovered: boolean } =
        raw === null ? { value: initial, recovered: false } : decodeSavedData(key, raw, initial);
      if (isTimingKey(key)) {
        // Cooldown / last check: never let a recovered (e.g. zero) value shorten an active wait.
        const values = [original, recovered]
          .filter((r): r is string => r !== null)
          .map((r) => decodeSavedData(key, r, initial).value);
        decoded.value = reconcileTiming(key, values, Number(initial) || 0);
      }
      if (decoded.recovered || recovered !== null) {
        target.current = recoveryKey(key);
        reportStorageIssue(key, null, true);
      }
      loadedRaw.current = raw;
      loadedValue.current = decoded.value as T;
      setValue(decoded.value as T);
      rememberInMemory(key, decoded.value);
    } catch (error) {
      readFailed.current = true;
      reportStorageIssue(key, error);
    }
    setHydrated(true);
  }, [key, kind]);

  useEffect(() => {
    if (!hydrated) return;
    rememberInMemory(key, value);
    const save = () => {
      try {
        if (readFailed.current)
          throw new Error("Leitura não confirmada: o original não será substituído.");
        const store = getStore(kind);
        // Merge records written by another tab before writing this tab's new results.
        let next: unknown = valueRef.current;
        if (key.includes("results") && target.current === key) {
          const raw = store.getItem(key);
          if (raw !== null) {
            const decoded = decodeSavedData(key, raw, initial);
            if (decoded.recovered) {
              target.current = recoveryKey(key);
              rememberOriginal(key, raw);
              reportStorageIssue(key, null, true);
            } else if (typeof decoded.value === "object" && decoded.value !== null) {
              // Preserve deliberate deletions (Retestar erros), but merge concurrent additions.
              const disk = { ...decoded.value } as Record<string, unknown>;
              const current = valueRef.current as Record<string, unknown>;
              const before = loadedValue.current as Record<string, unknown>;
              for (const c of Object.keys(before)) if (!(c in current)) delete disk[c];
              next = { ...disk, ...current };
            }
          }
        }
        const encoded = encodeSavedData(next);
        if (store.getItem(target.current) !== encoded) store.setItem(target.current, encoded);
        loadedRaw.current = encoded;
        loadedValue.current = next as T;
        rememberInMemory(key, next);
        clearStorageError(key);
      } catch (error) {
        reportStorageIssue(key, error);
      }
    };
    const flushSave = () => {
      if (pendingTimer.current) clearTimeout(pendingTimer.current);
      pendingTimer.current = null;
      lastSaveAt.current = Date.now();
      save();
    };
    saveRef.current = flushSave;
    const wait = throttleMs > 0 ? lastSaveAt.current + throttleMs - Date.now() : 0;
    if (wait <= 0) flushSave();
    else if (!pendingTimer.current)
      pendingTimer.current = setTimeout(() => saveRef.current(), wait);
    const unregister = registerSaveRetry(key, flushSave);
    return unregister;
  }, [key, kind, value, hydrated, throttleMs]);

  // Never lose a coalesced save: flush when the page is hidden, closed or unmounted.
  useEffect(() => {
    if (throttleMs <= 0) return;
    const flush = () => {
      if (pendingTimer.current) saveRef.current();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
  }, [throttleMs]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.newValue === null) return;
      if (isTimingKey(key)) {
        // Accept updates to either copy, keeping the largest valid wait.
        if (event.key !== key && event.key !== recoveryKey(key)) return;
        const incoming = decodeSavedData(key, event.newValue, initial).value;
        setValue((prev) => reconcileTiming(key, [incoming], Number(prev) || 0) as T);
        return;
      }
      if (event.key !== target.current) return;
      const decoded = decodeSavedData(key, event.newValue, initial);
      if (decoded.recovered) {
        reportStorageIssue(key, null, true);
        return;
      }
      // Never replace unsaved in-memory data when a save has failed.
      if (
        readFailed.current ||
        getStorageIssues().some((i) => i.key === key && i.kind !== "recovery")
      )
        return;
      loadedRaw.current = event.newValue;
      loadedValue.current = decoded.value as T;
      setValue(decoded.value as T);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key, kind]);

  return [value, setValue, hydrated];
}
