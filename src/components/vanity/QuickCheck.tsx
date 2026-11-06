import { AVAILABILITY_LABEL } from "@/lib/vanity/availability";
import { ExternalLink, Hourglass, Loader2, ScanSearch } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CLIENT_TIMEOUT_MS,
  MIN_INTERVAL_MS,
  cooldownForResult,
  errorClassOf,
  isValidCode,
  limitKindOf,
  normalizeCheckResult,
  normalizeCode,
  type CheckResult,
} from "@/lib/vanity/check-rules";
import { checkInviteViaBackend } from "@/lib/vanity/invite-backend";
import { availabilityOf, describeResult, toCompact, type ResultsMap } from "@/lib/vanity/scanner";
import { inviteUrl } from "@/lib/vanity/browser";
import { loadPace, paceAfterLimit, recentLimitCount, savePace } from "@/lib/vanity/pacing";

import { StatusBadge } from "./shared";
import { acquireScanLock, type ScanLock } from "@/lib/vanity/scan-lock";
import {
  inlineLimitWaitMs,
  noteLimit,
  noteResponse,
  updateDiag,
} from "@/lib/vanity/rate-limit-manager";
import { backgroundEnabled, backgroundCheck } from "@/lib/vanity/background-browser";

interface Props {
  cooldownUntil: number;
  setCooldownUntil: React.Dispatch<React.SetStateAction<number>>;
  lastCheckAt: number;
  setLastCheckAt: React.Dispatch<React.SetStateAction<number>>;
  results: ResultsMap;
  setResults: React.Dispatch<React.SetStateAction<ResultsMap>>;
  /** True while a scanner run is active — the shared rate limit forbids parallel checks. */
  busy: boolean;
  onCheck?: (result: CheckResult, startedAt: number) => void;
}

/** Single-code verification: the main screen's focused Discord URL check. */
export function QuickCheck({
  cooldownUntil,
  setCooldownUntil,
  lastCheckAt,
  setLastCheckAt,
  results,
  setResults,
  busy,
  onCheck,
}: Props) {
  const checkFn = backgroundEnabled() ? backgroundCheck : checkInviteViaBackend;
  const [input, setInput] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const lastCheckRef = useRef(0);
  lastCheckRef.current = Math.max(lastCheckRef.current, lastCheckAt);

  const cooling = cooldownUntil > now;
  useEffect(() => {
    if (!cooling) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [cooling]);

  const code = normalizeCode(input);
  const saved = code && isValidCode(code) ? results[code] : undefined;
  const cooldownSecs = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

  async function verify() {
    if (checking || busy || cooling) return;
    if (!isValidCode(code)) {
      setError("Use 2–3 caracteres (letras, números ou hífen), ou cole um link discord.gg/…");
      return;
    }
    setError(null);
    // Same cross-tab lock as the scanner: never a parallel request from another tab.
    let lock: ScanLock | null = null;
    if (!backgroundEnabled()) {
      try {
        lock = await acquireScanLock();
      } catch {
        lock = null;
      }
      if (!lock) {
        setError("Outra aba está verificando agora. Aguarde ou pause a verificação nessa aba.");
        return;
      }
    }
    setChecking(true);
    const startedAt = Date.now();
    // Respect the shared minimum interval between requests.
    const wait = lastCheckRef.current + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, CLIENT_TIMEOUT_MS);
    try {
      lastCheckRef.current = Date.now();
      setLastCheckAt(lastCheckRef.current);
      let r = normalizeCheckResult(
        code,
        await checkFn({ data: { code }, signal: controller.signal }),
      );
      // Short per-route Discord 429: wait what Discord asked and repeat once, like the scanner.
      const inline = backgroundEnabled() ? null : inlineLimitWaitMs(r, 0);
      if (inline != null) {
        if (r.discordQueried !== false) onCheck?.(r, startedAt);
        updateDiag((d) => ({
          ...noteLimit(noteResponse(d, r), r, { inline: true, appUntil: Date.now() + inline }),
          recoveries: d.recoveries + 1,
        }));
        await new Promise((res) => setTimeout(res, inline));
        lastCheckRef.current = Date.now();
        setLastCheckAt(lastCheckRef.current);
        r = normalizeCheckResult(code, await checkFn({ data: { code } }));
      }
      if (!backgroundEnabled()) updateDiag((d) => noteResponse(d, r));
      setResult(r);
      // A 429 or an app-side block is not a result: keep any previous answer for this code.
      if (errorClassOf(r) !== "rate_limit")
        setResults((prev) => ({ ...prev, [r.code]: toCompact(r) }));
      if (!backgroundEnabled() && r.discordQueried !== false) onCheck?.(r, startedAt);
      if (!backgroundEnabled() && (r.httpStatus === 429 || r.errorKind === "app_block")) {
        // Shares the scanner's pace and progressive backoff (same outbound limits).
        const pace = paceAfterLimit(loadPace(window.localStorage), limitKindOf(r));
        savePace(window.localStorage, pace);
        const secs = cooldownForResult(r, recentLimitCount(pace));
        setCooldownUntil((prev) => Math.max(prev, Date.now() + secs * 1000));
        updateDiag((d) => noteLimit(d, r, { inline: false, appUntil: Date.now() + secs * 1000 }));
        setNow(Date.now());
      }
    } catch (err) {
      console.error(err);
      const r: CheckResult = {
        code,
        status: "inconclusive",
        httpStatus: null,
        retryAfterSeconds: null,
        reason: timedOut
          ? "A verificação não respondeu a tempo. Não é um resultado."
          : `Falha interna do app antes da consulta. Erro original: ${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}. Não é um resultado.`,
        checkedAt: new Date().toISOString(),
        discordQueried: null,
        errorKind: timedOut ? "timeout" : "app_error",
      };
      setResult(r);
      if (!backgroundEnabled()) updateDiag((d) => noteResponse(d, r));
      if (!backgroundEnabled()) setResults((prev) => ({ ...prev, [r.code]: toCompact(r) }));
    } finally {
      clearTimeout(timer);
      lock?.release();
      setChecking(false);
    }
  }

  return (
    <section
      aria-label="Verificador de URL do Discord"
      className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm sm:p-5"
    >
      <div className="flex items-center gap-2">
        <ScanSearch className="size-5 text-primary" aria-hidden />
        <h2 className="font-semibold">Verificar URL do Discord</h2>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void verify();
        }}
      >
        <Input
          type="text"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setError(null);
          }}
          placeholder="discord.gg/seu-codigo"
          aria-label="Código ou link do convite do Discord"
          className="h-12 min-w-0 flex-1 rounded-xl font-mono text-base"
        />
        <Button
          type="submit"
          size="lg"
          className="h-12 shrink-0 rounded-xl px-5"
          disabled={checking || busy || cooling || !input.trim()}
        >
          {checking ? (
            <Loader2 className="size-5 animate-spin" aria-label="Verificando" />
          ) : cooling ? (
            <span className="flex items-center gap-1.5">
              <Hourglass className="size-4" aria-hidden /> {cooldownSecs}s
            </span>
          ) : (
            "Verificar"
          )}
        </Button>
      </form>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {busy && (
        <p className="text-xs text-muted-foreground">
          Uma varredura está em execução — aguarde ou pause para verificar um código avulso.
        </p>
      )}
      {result && (
        <div className="space-y-2 rounded-xl border bg-background/60 p-3" role="status">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-lg font-bold tracking-wide">{result.code}</span>
            <StatusBadge status={result.status} />
            <a
              href={inviteUrl(result.code)}
              target="_blank"
              rel="noreferrer"
              className="ml-auto inline-flex items-center gap-1 text-xs text-primary underline"
            >
              Abrir link <ExternalLink className="size-3" aria-hidden />
            </a>
          </div>
          <p className="text-sm text-muted-foreground">
            {result.reason || describeResult(toCompact(result))}
          </p>
          <p className="text-xs text-muted-foreground">
            Verified Availability: {AVAILABILITY_LABEL[result.availability ?? "UNKNOWN"]}
          </p>
        </div>
      )}
      {!result && saved && (
        <button
          type="button"
          onClick={() =>
            setResult({
              code,
              status: saved[0] === "e" ? "exists" : saved[0] === "n" ? "not_found" : "inconclusive",
              httpStatus: saved[1],
              retryAfterSeconds: null,
              reason: "",
              checkedAt: new Date(saved[2] * 1000).toISOString(),
              availability: availabilityOf(saved),
            })
          }
          className="flex w-full flex-wrap items-center gap-2 rounded-xl border border-dashed bg-background/40 p-3 text-left"
        >
          <span className="text-xs text-muted-foreground">Última verificação salva:</span>
          <StatusBadge
            status={saved[0] === "e" ? "exists" : saved[0] === "n" ? "not_found" : "inconclusive"}
          />
          <span className="text-xs font-medium">{AVAILABILITY_LABEL[availabilityOf(saved)]}</span>
        </button>
      )}
    </section>
  );
}
