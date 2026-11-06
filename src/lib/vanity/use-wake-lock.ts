import { useEffect, useState } from "react";

/** Keeps the screen on while `active` (Safari 16.4+). Silently no-ops when unsupported. */
export function useWakeLock(active: boolean) {
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported(typeof navigator !== "undefined" && "wakeLock" in navigator);
  }, []);

  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const request = async () => {
      try {
        const l = await navigator.wakeLock.request("screen");
        if (cancelled) l.release().catch(() => {});
        else lock = l;
      } catch {
        /* denied or unavailable */
      }
    };
    request();
    const onVisible = () => {
      if (document.visibilityState === "visible") request();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
    };
  }, [active]);

  return supported;
}
