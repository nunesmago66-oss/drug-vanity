import { useEffect, useState } from "react";
import type { BackgroundSnapshot } from "./background-protocol";

/** Only the locally launched UI opts in; never probe a visitor's LAN from hosting. */
export function backgroundEnabled() {
  return Boolean(import.meta.env["VITE_BACKGROUND_URL"]);
}
function capability() {
  const match = window.location.hash.match(/^#background=([a-f0-9]{64})$/);
  if (match?.[1]) {
    sessionStorage.setItem("dvf:background-token", match[1]);
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }
  const token = sessionStorage.getItem("dvf:background-token");
  if (!token)
    throw new Error(
      "Abra o endereço exibido por npm run background para conectar o processo local.",
    );
  return token;
}
export async function backgroundRequest(
  path: "state" | "start" | "stop",
  body?: unknown,
): Promise<BackgroundSnapshot> {
  return request(path, body);
}
export async function backgroundCheck(input: {
  data: { code: string };
}): Promise<import("./check-rules").CheckResult> {
  return request("check", input.data);
}
async function request(path: string, body?: unknown) {
  const url = import.meta.env["VITE_BACKGROUND_URL"];
  if (!url || !/^http:\/\/127\.0\.0\.1:\d+$/.test(url))
    throw new Error("Modo local não configurado");
  const res = await fetch(`${url}/${path}`, {
    method: path === "state" ? "GET" : "POST",
    headers: { Authorization: `Bearer ${capability()}`, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(path === "check" ? 120_000 : 15_000),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Não foi possível conectar o processo local");
  return data;
}
export function useBackgroundState() {
  const [snapshot, setSnapshot] = useState<BackgroundSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!backgroundEnabled()) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const data = await backgroundRequest("state");
        if (!disposed) {
          setSnapshot(data);
          setError(null);
        }
      } catch (e) {
        if (!disposed)
          setError(
            `Conexão local interrompida. O progresso será sincronizado ao reconectar; nenhuma consulta será iniciada pelo navegador. ${e instanceof Error ? e.message : ""}`,
          );
      }
      if (!disposed) timer = setTimeout(poll, 1000);
    };
    void poll();
    const reconnect = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        void poll();
      }
    };
    document.addEventListener("visibilitychange", reconnect);
    return () => {
      disposed = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", reconnect);
    };
  }, []);
  return { snapshot, error };
}
