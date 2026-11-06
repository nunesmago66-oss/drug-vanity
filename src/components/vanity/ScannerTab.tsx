import {
  ChevronDown,
  ExternalLink,
  Hourglass,
  ListChecks,
  Loader2,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { inviteLabel, inviteUrl } from "@/lib/vanity/browser";
import {
  AUTO_INTERVAL,
  INTERVAL_OPTIONS_MS,
  MAX_CONSECUTIVE_ERRORS,
  CLIENT_TIMEOUT_MS,
  STATUS_LABEL,
  clampInterval,
  cooldownForResult,
  cooldownSecondsFor,
  normalizeCheckResult,
  runVerificationQueue,
  type CheckResult,
} from "@/lib/vanity/check-rules";
import {
  MAX_TEMP_RETRIES,
  average,
  averageCycleMs,
  effectiveInterval,
  estimateDuration,
  initialPace,
  loadPace,
  recentLimitCount,
  savePace,
  type PaceState,
} from "@/lib/vanity/pacing";
import { checkInviteFromBrowser } from "@/lib/vanity/invite-check.browser";
import {
  CHARSET_LABEL,
  compactErrorClass,
  formatDuration,
  generateCandidates,
  needsCheck,
  toCompact,
  type Charset,
  type ResultsMap,
  type ScannerConfig,
} from "@/lib/vanity/scanner";
import { useWakeLock } from "@/lib/vanity/use-wake-lock";
import { acquireScanLock, type ScanLock } from "@/lib/vanity/scan-lock";
import {
  decodeSavedData,
  hasStorageFailure,
  readSavedTiming,
  retryStorageSaves,
  subscribeStorage,
} from "@/lib/vanity/persistence";
import { cn } from "@/lib/utils";
import { backgroundEnabled, backgroundRequest } from "@/lib/vanity/background-browser";
import { emptyBackground, type BackgroundSnapshot } from "@/lib/vanity/background-protocol";
import { EMPTY_STATS, STATS_KEY } from "@/lib/vanity/stats";
import {
  describeDiag,
  getDiag,
  noteLimit,
  noteResponse,
  subscribeDiag,
  updateDiag,
  validateDiag,
} from "@/lib/vanity/rate-limit-manager";
import { RateLimitPanel } from "./RateLimitPanel";

import { EmptyState, NativeSelect, StatusBadge } from "./shared";

interface Props {
  background?: { snapshot: BackgroundSnapshot | null; error: string | null };
  candidateCodes?: string[];
  meaningMode?: boolean;
  blocked?: boolean;
  cooldownUntil: number;
  setCooldownUntil: React.Dispatch<React.SetStateAction<number>>;
  lastCheckAt: number;
  setLastCheckAt: React.Dispatch<React.SetStateAction<number>>;
  config: ScannerConfig;
  setConfig: React.Dispatch<React.SetStateAction<ScannerConfig>>;
  selected: string[];
  results: ResultsMap;
  setResults: React.Dispatch<React.SetStateAction<ResultsMap>>;
  running: boolean;
  setRunning: (running: boolean) => void;
  onGoCatalog: () => void;
  onGoResults: () => void;
  /** Called once per finished check with the time the request started (for statistics). */
  onCheck?: (result: CheckResult, startedAt: number) => void;
}

type Msg = { tone: "info" | "error"; text: string };

const secondsLabel = (ms: number) =>
  `${(ms / 1000).toLocaleString("pt-BR", { maximumFractionDigits: ms < 10_000 ? 1 : 0 })}s`;
const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
const mmss = (secs: number) =>
  secs >= 60 ? `${Math.floor(secs / 60)}min ${String(secs % 60).padStart(2, "0")}s` : `${secs}s`;

export function ScannerTab({
  candidateCodes,
  meaningMode = false,
  blocked = false,
  cooldownUntil,
  setCooldownUntil,
  lastCheckAt,
  setLastCheckAt,
  config,
  setConfig,
  selected,
  results,
  setResults,
  running,
  setRunning,
  onGoCatalog,
  onGoResults,
  onCheck,
  background,
}: Props) {
  const checkFn = checkInviteFromBrowser;
  const [current, setCurrent] = useState<string | null>(null);
  const [nextAt, setNextAt] = useState(0);
  const [recent, setRecent] = useState<CheckResult[]>([]);
  const [message, setMessage] = useState<Msg | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [pace, setPace] = useState<PaceState>(initialPace);
  const [queueNote, setQueueNote] = useState<string | null>(null);
  const [inlineUntil, setInlineUntil] = useState(0);
  const [diagLocal, setDiagLocal] = useState(getDiag);
  useEffect(() => subscribeDiag(() => setDiagLocal(getDiag())), []);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const on = () => setVisible(document.visibilityState === "visible");
    on();
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  // Session measurements for the real pace (reset at each run start / kept for the session).
  const startsRef = useRef<number[]>([]);
  const latenciesRef = useRef<number[]>([]);
  const sessionRef = useRef({ checks: 0, limitWaitMs: 0 });
  const reqStartRef = useRef(0);
  const stopRef = useRef(false);
  const pauseReasonRef = useRef<"user" | "hidden" | null>(null);
  const lastCheckRef = useRef(0);
  const lockRef = useRef<ScanLock | null>(null);
  const acquiringRef = useRef(false);
  lastCheckRef.current = Math.max(lastCheckRef.current, lastCheckAt);

  const wakeLockSupported = useWakeLock(running && config.keepAwake);
  useEffect(() => setPace(loadPace(window.localStorage)), []);
  const interval = clampInterval(config.intervalMs);
  const cooling = cooldownUntil > now;
  const localBackground = backgroundEnabled();
  useEffect(() => {
    if (!localBackground) return;
    if (background?.error) {
      setMessage({ tone: "error", text: background.error });
      return;
    }
    const s = background?.snapshot;
    if (!s || s.mode !== (meaningMode ? "m" : "a")) return;
    setCurrent(s.current);
    setNextAt(s.nextAt);
    setPace(s.pace);
    setRecent(s.recent);
    if (s.error) setMessage({ tone: "error", text: s.error });
    else if (s.status === "rate_limited")
      setMessage({
        tone: "error",
        text: s.recent[0]?.reason ?? "Limite de taxa. Aguarde e toque em Retomar.",
      });
    else if (s.status === "done")
      setMessage({ tone: "info", text: "Varredura concluída para esta configuração." });
    else if (s.status === "stopped")
      setMessage({ tone: "info", text: "Varredura pausada. O progresso foi salvo." });
    else if (s.status === "errors")
      setMessage({
        tone: "error",
        text: "Varredura pausada após erros seguidos. Verifique sua conexão e retome mais tarde.",
      });
    else setMessage(null);
  }, [localBackground, background?.snapshot, background?.error, meaningMode]);

  useEffect(
    () =>
      subscribeStorage(() => {
        if (hasStorageFailure()) stopRef.current = true;
      }),
    [],
  );
  useEffect(
    () => () => {
      stopRef.current = true;
    },
    [],
  );

  useEffect(() => {
    if (!running && !cooling) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [running, cooling]);

  // iOS Safari suspends background tabs: pause cleanly instead of producing failed requests.
  useEffect(() => {
    const onVis = () => {
      if (!localBackground && document.visibilityState === "hidden" && running) {
        pauseReasonRef.current = "hidden";
        stopRef.current = true;
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [running, localBackground]);

  const candidates = useMemo(
    () =>
      candidateCodes ??
      (config.source === "generated"
        ? generateCandidates(config.len2, config.len3, config.charset)
        : selected),
    [candidateCodes, config.source, config.len2, config.len3, config.charset, selected],
  );

  const myMode = meaningMode ? "m" : "a";
  const startRef = useRef<() => void>(() => {});
  // Automatic recovery: once the saved wait ends, resume the run that a 429 stopped
  // (also after a reload during the block). "Pausar" cancels it.
  useEffect(() => {
    if (localBackground || running || blocked || cooling || !visible) return;
    if (diagLocal.autoResume !== myMode) return;
    const t = setTimeout(() => startRef.current(), 400);
    return () => clearTimeout(t);
  }, [localBackground, running, blocked, cooling, visible, diagLocal.autoResume, myMode]);

  const candidateSet = useMemo(() => new Set(candidates), [candidates]);
  const stats = useMemo(() => {
    let e = 0,
      n = 0,
      temp = 0,
      perm = 0,
      limited = 0;
    // Iterate saved results, not the entire generated candidate universe on every check.
    for (const [code, result] of Object.entries(results)) {
      if (!candidateSet.has(code)) continue;
      if (result[0] === "e") e++;
      else if (result[0] === "n") n++;
      else {
        const cls = compactErrorClass(result);
        // A 429 / app-side block is not a result: the code stays pending.
        if (cls === "rate_limit") limited++;
        else if (cls === "temporary") temp++;
        else perm++;
      }
    }
    return { tested: e + n + temp + perm, e, n, temp, perm, limited };
  }, [candidateSet, results]);

  const total = candidates.length;
  const pending = total - stats.tested;
  const pct = total ? (stats.tested / total) * 100 : 0;

  function sleep(ms: number) {
    setNextAt(Date.now() + ms);
    return new Promise<void>((resolve) => {
      const end = Date.now() + ms;
      const tick = () => {
        if (stopRef.current || Date.now() >= end) {
          setNextAt(0);
          resolve();
        } else setTimeout(tick, 100);
      };
      tick();
    });
  }

  async function start() {
    if (running || cooling || blocked || acquiringRef.current) return;
    if (localBackground) {
      acquiringRef.current = true;
      try {
        if (hasStorageFailure())
          throw new Error(
            "Não foi possível salvar o progresso. Tente salvar novamente antes de iniciar.",
          );
        const read = (key: string, fallback: unknown) => {
          const raw = localStorage.getItem(`${key}:recovery:v1`) ?? localStorage.getItem(key);
          return raw === null ? fallback : decodeSavedData(key, raw, fallback).value;
        };
        await backgroundRequest("start", {
          ...emptyBackground(),
          mode: meaningMode ? "m" : "a",
          codes: candidates,
          config,
          results: meaningMode ? read("dvf:results:v1", {}) : results,
          meaningResults: meaningMode ? results : read("dvf:meaning-results:v1", {}),
          stats: read(STATS_KEY, EMPTY_STATS),
          pace: loadPace(localStorage),
          cooldownUntil: readSavedTiming(localStorage, "dvf:cooldown-until", cooldownUntil),
          lastCheckAt: readSavedTiming(localStorage, "dvf:last-check-at", lastCheckAt),
        });
        setRunning(true);
        setMessage(null);
      } catch (e) {
        setMessage({
          tone: "error",
          text: e instanceof Error ? e.message : "Não foi possível conectar o processo local.",
        });
      } finally {
        acquiringRef.current = false;
      }
      return;
    }
    if (hasStorageFailure()) {
      setMessage({
        tone: "error",
        text: "A verificação está pausada porque não foi possível salvar ou ler o progresso. Baixe uma cópia e tente salvar novamente.",
      });
      return;
    }
    acquiringRef.current = true;
    let lock: ScanLock | null;
    try {
      lock = await acquireScanLock();
    } catch {
      acquiringRef.current = false;
      setMessage({
        tone: "error",
        text: "Este navegador não conseguiu proteger a execução entre abas. A verificação não foi iniciada; catálogo, sugestões e exportações continuam disponíveis.",
      });
      return;
    }
    acquiringRef.current = false;
    if (!lock) {
      setMessage({
        tone: "info",
        text: "Outra aba está executando uma verificação. Pause ou aguarde a conclusão nessa aba antes de iniciar aqui.",
      });
      return;
    }
    lockRef.current = lock;
    try {
      // Re-read under the lock: this tab may have been open while another tab scanned.
      const read = (key: string, fallback: unknown) => {
        const raw = localStorage.getItem(`${key}:recovery:v1`) ?? localStorage.getItem(key);
        return raw === null ? fallback : decodeSavedData(key, raw, fallback).value;
      };
      // Largest valid wait across memory, the original key and the recovery copy.
      const savedCooldown = readSavedTiming(localStorage, "dvf:cooldown-until", cooldownUntil);
      const savedLast = readSavedTiming(localStorage, "dvf:last-check-at", lastCheckAt);
      if (savedCooldown > Date.now()) {
        setCooldownUntil(savedCooldown);
        setNow(Date.now());
        return;
      }
      lastCheckRef.current = Math.max(lastCheckRef.current, savedLast);
      const savedResults = read(
        meaningMode ? "dvf:meaning-results:v1" : "dvf:results:v1",
        results,
      ) as ResultsMap;
      // Results of the other search mode: a code already answered there is not queried again.
      const otherResults = read(
        meaningMode ? "dvf:results:v1" : "dvf:meaning-results:v1",
        {},
      ) as ResultsMap;
      const reused: ResultsMap = {};
      const queue: string[] = [];
      const seen = new Set<string>();
      for (const c of candidates) {
        if (seen.has(c)) continue;
        seen.add(c);
        if (!needsCheck(results[c]) || !needsCheck(savedResults[c])) continue;
        const other = otherResults[c];
        if (other && (other[0] === "e" || other[0] === "n")) reused[c] = other;
        else queue.push(c);
      }
      const reusedCount = Object.keys(reused).length;
      if (reusedCount) setResults((prev) => ({ ...prev, ...reused }));
      if (queue.length === 0 || hasStorageFailure() || document.visibilityState === "hidden") {
        if (reusedCount)
          setMessage({
            tone: "info",
            text: `${reusedCount} código(s) já verificados no outro modo foram reaproveitados, sem nova consulta ao Discord.`,
          });
        return;
      }
      let livePace = loadPace(window.localStorage);
      const updatePace = (p: PaceState) => {
        livePace = p;
        setPace(p);
        savePace(window.localStorage, p);
      };
      updatePace({ ...livePace, note: null });
      updateDiag((d) =>
        d.autoResume === myMode ? { ...d, autoResume: null, recoveries: d.recoveries + 1 } : d,
      );
      stopRef.current = false;
      pauseReasonRef.current = null;
      startsRef.current = [];
      setQueueNote(null);
      setRunning(true);
      setMessage(
        reusedCount
          ? {
              tone: "info",
              text: `${reusedCount} código(s) já verificados no outro modo foram reaproveitados, sem nova consulta ao Discord.`,
            }
          : null,
      );

      const outcome = await runVerificationQueue({
        codes: queue,
        batchLimit: Number.POSITIVE_INFINITY,
        intervalMs: interval,
        pace: livePace,
        initialDelayMs: lastCheckRef.current + effectiveInterval(livePace, interval) - Date.now(),
        sleep,
        shouldStop: () => stopRef.current || hasStorageFailure() || !lockRef.current?.held(),
        onStart: (code) => {
          setCurrent(code);
          setInlineUntil(0);
          reqStartRef.current = Date.now();
          startsRef.current = [...startsRef.current, reqStartRef.current].slice(-60);
          lastCheckRef.current = reqStartRef.current;
          setLastCheckAt(lastCheckRef.current);
        },
        check: async (code) => {
          if (!lockRef.current?.held()) throw new Error("Bloqueio entre abas perdido");
          // Client-side deadline so a stuck request can never freeze the queue.
          const controller = new AbortController();
          let timedOut = false;
          const timer = setTimeout(() => {
            timedOut = true;
            controller.abort();
          }, CLIENT_TIMEOUT_MS);
          try {
            return normalizeCheckResult(
              code,
              await checkFn({ data: { code }, signal: controller.signal }),
            );
          } catch (err) {
            console.error(err);
            return {
              code,
              status: "inconclusive",
              httpStatus: null,
              retryAfterSeconds: null,
              reason: timedOut
                ? "A função de verificação não respondeu a tempo. Não é um resultado."
                : "A função de verificação não respondeu. Não é um resultado.",
              checkedAt: new Date().toISOString(),
              discordQueried: null,
              errorKind: timedOut ? "timeout" : "network",
            };
          } finally {
            clearTimeout(timer);
          }
        },
        onLimitWait: (r, waitMs, attempt) => {
          const until = Date.now() + waitMs;
          setInlineUntil(until);
          onCheck?.(r, reqStartRef.current);
          setRecent((list) => [r, ...list].slice(0, 6));
          updateDiag((d) => ({
            ...noteLimit(noteResponse(d, r), r, { inline: true, appUntil: until }),
            recoveries: d.recoveries + 1,
          }));
          setQueueNote(
            `O Discord pediu ${secondsLabel((r.retryAfterSeconds ?? 0) * 1000)} de espera (HTTP 429, rota de convites). “${r.code}” será repetido automaticamente em ${secondsLabel(waitMs)} — tentativa ${attempt}; nada foi perdido.`,
          );
        },
        onResult: (r) => {
          updateDiag((d) => noteResponse(d, r));
          latenciesRef.current = [...latenciesRef.current, Date.now() - reqStartRef.current].slice(
            -60,
          );
          sessionRef.current.checks++;
          setQueueNote(null);
          setResults((prev) => ({ ...prev, [r.code]: toCompact(r) }));
          if (r.discordQueried !== false) onCheck?.(r, reqStartRef.current);
          setRecent((list) => [r, ...list].slice(0, 6));
        },
        onRateLimit: (r) => {
          updateDiag((d) => noteResponse(d, r));
          // Not a result: nothing is saved for this code, so "Retomar" checks it again.
          if (r.discordQueried === true) onCheck?.(r, reqStartRef.current);
          setRecent((list) => [r, ...list].slice(0, 6));
        },
        onRetry: (r, kind, attempt, waitMs) => {
          updateDiag((d) => noteResponse(d, r));
          if (kind === "temporary") {
            if (r.discordQueried !== false) onCheck?.(r, reqStartRef.current);
            setQueueNote(
              `Erro temporário em “${r.code}” (${r.reason || "sem resposta válida"}). Nova tentativa ${attempt}/${MAX_TEMP_RETRIES} em ${secondsLabel(waitMs)}.`,
            );
          } else {
            setQueueNote(
              `O servidor do site está espaçando consultas de outros visitantes. “${r.code}” será consultado em ${secondsLabel(waitMs)} (não conta como erro).`,
            );
          }
        },
        onPace: updatePace,
      });

      setRunning(false);
      setCurrent(null);
      setNextAt(0);
      setQueueNote(null);
      setInlineUntil(0);
      // Flush coalesced saves now, so another tab or a reload sees every result.
      retryStorageSaves();

      switch (outcome.reason) {
        case "rate_limited": {
          const limit = outcome.limit ?? null;
          const count = recentLimitCount(outcome.pace);
          const secs = limit
            ? cooldownForResult(limit, count)
            : cooldownSecondsFor(outcome.retryAfterSeconds, count);
          const until = Date.now() + secs * 1000;
          sessionRef.current.limitWaitMs += secs * 1000;
          // Never shorten a longer wait that is already active.
          setCooldownUntil((prev) => Math.max(prev, until));
          if (limit)
            updateDiag((d) => ({
              ...noteLimit(d, limit, {
                inline: false,
                appUntil: until,
                origin: outcome.rateLimitSource === "suspected_edge" ? "suspected_edge" : undefined,
              }),
              // Resume by itself when the wait ends (cancelled by "Pausar").
              autoResume: pauseReasonRef.current === "user" ? null : myMode,
            }));
          setNow(Date.now());
          const scope = limit?.limitScope
            ? ` Escopo informado: ${limit.limitScope}${limit.limitScope === "global" ? " (limite global da sua conexão)" : " (limite da rota de convites)"}.`
            : limit?.limitGlobal
              ? " Limite global da sua conexão."
              : "";
          const origin =
            outcome.rateLimitSource === "discord"
              ? `O Discord retornou limite de taxa (HTTP 429).${scope}`
              : outcome.rateLimitSource === "suspected_edge"
                ? "A conexão com o Discord falhou logo depois de um limite de taxa — provável bloqueio da proteção Cloudflare (o navegador não consegue ler essa resposta). Para não prolongar o bloqueio, o app parou de enviar consultas."
              : outcome.rateLimitSource === "cloudflare_edge"
                ? "A proteção da Cloudflare na frente do Discord bloqueou a consulta (HTTP 429). Esse bloqueio vale para a sua conexão de internet por alguns minutos."
                : outcome.rateLimitSource === "app_block"
                  ? "Bloqueio preventivo do app: um limite de taxa do Discord recebido há pouco ainda está ativo, por isso nenhuma consulta foi enviada ao Discord."
                  : "Limite de taxa (HTTP 429) — não foi possível confirmar se veio do Discord ou de um bloqueio preventivo do app.";
          const asked =
            limit?.discordQueried === true && limit.retryAfterSeconds != null
              ? ` Espera pedida: ${secondsLabel(limit.retryAfterSeconds * 1000)}; com margem de segurança${count > 1 ? ` e recuo progressivo (${count} limites em 10 min)` : ""}: ${mmss(secs)}.`
              : ` Espera: ${mmss(secs)}.`;
          const text = `${origin}${asked} “${limit?.code ?? ""}” continua pendente e será o primeiro na retomada; nenhum resultado foi perdido. A varredura recomeça sozinha às ${clock(until)} (se você não pausar), com ritmo de 1 consulta a cada ${secondsLabel(effectiveInterval(outcome.pace, interval))}. O app não tenta contornar esse limite.`;
          updatePace({ ...outcome.pace, note: { at: Date.now(), text } });
          setMessage({ tone: "error", text });
          break;
        }
        case "throttled":
          setMessage({
            tone: "info",
            text: "O servidor do site está ocupado com consultas de outros visitantes. A varredura foi pausada sem registrar erro; toque em “Retomar” em instantes.",
          });
          break;
        case "batch":
          setMessage({
            tone: "info",
            text: `Pausa automática após ${outcome.checked} verificações. Toque em “Retomar” para continuar.`,
          });
          break;
        case "errors":
          setMessage({
            tone: "error",
            text: `${MAX_CONSECUTIVE_ERRORS} erros seguidos, mesmo após ${MAX_TEMP_RETRIES} novas tentativas cada. Varredura pausada — verifique sua conexão e retome mais tarde. Use “Retestar erros temporários” para repetir esses códigos.`,
          });
          break;
        case "stopped":
          setMessage({
            tone: "info",
            text: hasStorageFailure()
              ? "Varredura pausada: o navegador não conseguiu salvar o progresso. Os novos resultados permanecem nesta aba. Baixe uma cópia e tente salvar novamente antes de recarregar."
              : pauseReasonRef.current === "hidden"
                ? "Pausado porque o Safari saiu da tela (aba trocada ou tela bloqueada). O progresso foi salvo; toque em “Retomar”."
                : "Varredura pausada. O progresso foi salvo.",
          });
          break;
        case "done":
          toast.success("Todos os candidatos desta configuração foram testados");
          setMessage({ tone: "info", text: "Varredura concluída para esta configuração." });
          break;
      }
    } catch {
      setMessage({
        tone: "error",
        text: "A verificação foi interrompida com segurança. Confira o aviso de armazenamento e tente novamente; nenhum dado salvo foi apagado.",
      });
    } finally {
      setRunning(false);
      setCurrent(null);
      setNextAt(0);
      lock.release();
      lockRef.current = null;
    }
  }

  startRef.current = () => void start();

  function retestErrors() {
    setResults((prev) => {
      const next = { ...prev };
      // Only temporary failures: rate limits are already pending, permanent errors would repeat.
      for (const c of candidates) {
        const r = next[c];
        if (r && compactErrorClass(r) === "temporary") delete next[c];
      }
      return next;
    });
    setMessage(null);
  }

  const set = <K extends keyof ScannerConfig>(k: K, v: ScannerConfig[K]) =>
    setConfig((c) => ({ ...c, [k]: v }));

  const cooldownSecs = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  const nextSecs = nextAt ? Math.max(0, Math.ceil((nextAt - now) / 1000)) : 0;
  // Real pace of this session, used for the live metrics and the estimate.
  const paceMs = effectiveInterval(pace, interval);
  const cycleMs = averageCycleMs(startsRef.current);
  const avgLatencyMs = average(latenciesRef.current);
  const estimate = estimateDuration({
    pending,
    cycleMs,
    fallbackCycleMs: paceMs + (avgLatencyMs ?? 400),
    sessionChecks: sessionRef.current.checks,
    sessionLimitWaitMs: sessionRef.current.limitWaitMs,
    batch: 0,
  });
  const queueState = running
    ? queueNote
      ? "nova tentativa"
      : nextSecs > 0
        ? `aguardando ${nextSecs}s`
        : current
          ? "consultando"
          : "preparando"
    : cooling
      ? "limite de taxa"
      : pending === 0
        ? "concluída"
        : stats.tested > 0 || stats.limited > 0
          ? "pausada"
          : "parada";
  const diag = localBackground
    ? validateDiag(background?.snapshot?.diag ?? diagLocal)
    : diagLocal;
  const diagView = describeDiag(diag, {
    cooldownUntil,
    now,
    running,
    online: typeof navigator === "undefined" ? true : navigator.onLine,
    inlineUntil: localBackground ? (running ? cooldownUntil : 0) : inlineUntil,
  });
  const noLength = !meaningMode && config.source === "generated" && !config.len2 && !config.len3;
  const startLabel = cooling
    ? `Aguarde ${mmss(cooldownSecs)} (limite de taxa)`
    : stats.tested > 0 || stats.limited > 0
      ? `Retomar (${pending} restantes)`
      : `Iniciar varredura (${total})`;

  return (
    <div
      className={cn(
        "space-y-4",
        !meaningMode && "lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0",
      )}
    >
      <section className="space-y-3 rounded-lg border bg-card p-3 sm:p-4" aria-label="Configuração">
        <h2 className="font-semibold">Configuração</h2>
        <fieldset disabled={running || blocked} className="space-y-3 disabled:opacity-60">
          {!meaningMode && (
            <div
              className="grid grid-cols-2 gap-2"
              role="radiogroup"
              aria-label="Fonte dos candidatos"
            >
              {(
                [
                  ["generated", "Gerar automaticamente"],
                  ["catalog", `Selecionados no catálogo (${selected.length})`],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className={cn(
                    "flex min-h-12 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm",
                    config.source === value && "border-primary bg-accent",
                  )}
                >
                  <input
                    type="radio"
                    name="source"
                    value={value}
                    checked={config.source === value}
                    onChange={() => set("source", value)}
                    className="size-4 accent-primary"
                  />
                  {label}
                </label>
              ))}
            </div>
          )}

          {!meaningMode &&
            (config.source === "generated" ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Comprimento</span>
                  <div className="flex gap-2">
                    {(["len2", "len3"] as const).map((k) => (
                      <label
                        key={k}
                        className="flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={config[k]}
                          onChange={(e) => set(k, e.target.checked)}
                          className="size-4 accent-primary"
                        />
                        {k === "len2" ? "2" : "3"}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="s-charset" className="text-xs text-muted-foreground">
                    Caracteres
                  </Label>
                  <NativeSelect
                    id="s-charset"
                    className="h-11"
                    value={config.charset}
                    onChange={(e) => set("charset", e.target.value as Charset)}
                  >
                    {(Object.keys(CHARSET_LABEL) as Charset[]).map((c) => (
                      <option key={c} value={c}>
                        {CHARSET_LABEL[c]}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </div>
            ) : (
              selected.length === 0 && (
                <EmptyState icon={ListChecks} title="Nenhum código selecionado no catálogo">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={onGoCatalog}
                  >
                    Ir para o catálogo
                  </Button>
                </EmptyState>
              )
            ))}

          <details className="group rounded-md border bg-background/40">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
              Configurações avançadas
              <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
                {interval === AUTO_INTERVAL ? "automático" : `${interval / 1000}s`}
                <ChevronDown
                  className="size-4 shrink-0 transition-transform group-open:rotate-180"
                  aria-hidden
                />
              </span>
            </summary>
            <div className="space-y-3 border-t p-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="s-speed" className="text-xs text-muted-foreground">
                    Velocidade
                  </Label>
                  <NativeSelect
                    id="s-speed"
                    value={interval}
                    onChange={(e) => set("intervalMs", Number(e.target.value))}
                  >
                    {[
                      ...INTERVAL_OPTIONS_MS,
                      ...((INTERVAL_OPTIONS_MS as readonly number[]).includes(interval)
                        ? []
                        : [interval]),
                    ].map((ms) => (
                      <option key={ms} value={ms}>
                        {ms === AUTO_INTERVAL
                          ? "Automático (ajusta ao Discord)"
                          : `Fixo: a cada ${ms / 1000}s`}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="s-awake" className="text-sm font-normal">
                  Manter a tela ligada durante a varredura
                  {!wakeLockSupported && (
                    <span className="block text-xs text-muted-foreground">
                      Não suportado neste navegador — desative o bloqueio automático da tela.
                    </span>
                  )}
                </Label>
                <Switch
                  id="s-awake"
                  checked={config.keepAwake}
                  onCheckedChange={(v) => set("keepAwake", v)}
                />
              </div>
            </div>
          </details>
        </fieldset>
        <p className="text-xs text-muted-foreground">
          No iPhone, o Safari pausa a varredura se você trocar de aba ou bloquear a tela. O
          progresso fica salvo neste aparelho.
        </p>
      </section>

      <section className="space-y-3 rounded-lg border bg-card p-3 sm:p-4" aria-label="Progresso">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-semibold">Progresso</h2>
          <span className="font-mono text-2xl font-bold text-primary" aria-live="polite">
            {pct.toLocaleString("pt-BR", { maximumFractionDigits: pct > 0 && pct < 10 ? 1 : 0 })}%
          </span>
        </div>
        <Progress value={pct} aria-label="Candidatos testados" className="h-3" />
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat value={stats.tested} label="Verificados" className="bg-muted" />
          <Stat value={pending} label="Restantes" className="bg-muted" />
          <Stat value={total} label="Total" className="bg-muted" />
          <Stat
            value={stats.n}
            label="Sem convite ativo (404)"
            className="bg-status-notfound-bg text-status-notfound"
          />
          <Stat
            value={stats.e}
            label="Convite ativo (200)"
            className="bg-status-exists-bg text-status-exists"
          />
          <Stat
            value={stats.temp}
            label="Erros temporários"
            className="bg-status-inconclusive-bg text-status-inconclusive"
          />
        </div>
        {(stats.perm > 0 || stats.limited > 0) && (
          <p className="text-xs text-muted-foreground">
            {stats.perm > 0 &&
              `${stats.perm} erro(s) permanente(s) (resposta inesperada do Discord). `}
            {stats.limited > 0 &&
              `${stats.limited} código(s) com limite de taxa salvo por versões anteriores: contam como restantes e serão consultados de novo.`}
          </p>
        )}

        <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4" aria-label="Ritmo da fila">
          <Metric
            label="Consultas por minuto"
            value={
              cycleMs
                ? estimate.perMinute.toLocaleString("pt-BR", { maximumFractionDigits: 1 })
                : "—"
            }
          />
          <Metric
            label="Tempo médio por consulta"
            value={avgLatencyMs != null ? secondsLabel(avgLatencyMs) : "—"}
          />
          <Metric
            label={interval === AUTO_INTERVAL ? "Ritmo automático" : "Ritmo fixo"}
            value={`1 a cada ${secondsLabel(paceMs)}`}
          />
          <Metric label="Estado da fila" value={queueState} />
        </dl>

        {pending > 0 && (
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              Estimativa: {formatDuration(estimate.ms + (cooling ? cooldownSecs * 1000 : 0))}
            </span>{" "}
            {estimate.measured
              ? `pelo ritmo real das últimas ${Math.min(startsRef.current.length, 30)} consultas`
              : `pelo ritmo atual (1 a cada ${secondsLabel(paceMs)} + tempo de resposta)`}
            {estimate.limitMs > 0
              ? `, incluindo ~${formatDuration(estimate.limitMs)} de esperas por limite de taxa no ritmo observado nesta sessão`
              : ""}
            {cooling ? " e a espera atual" : ""}.
            {estimate.batchPauses > 0
              ? ` Não inclui ${estimate.batchPauses} pausa(s) automática(s) a cada ${config.batch} (retomada manual).`
              : ""}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {running ? (
            <Button
              type="button"
              variant="destructive"
              className="h-14 flex-1 text-base"
              onClick={() => {
                if (localBackground) {
                  void backgroundRequest("stop").catch((e) =>
                    setMessage({
                      tone: "error",
                      text:
                        e instanceof Error
                          ? e.message
                          : "Não foi possível interromper o processo local.",
                    }),
                  );
                  return;
                }
                pauseReasonRef.current = "user";
                stopRef.current = true;
                updateDiag((d) => ({ ...d, autoResume: null }));
              }}
            >
              <Pause aria-hidden /> Pausar
            </Button>
          ) : (
            <Button
              type="button"
              className="h-14 flex-1 text-base"
              disabled={blocked || cooling || pending === 0 || noLength}
              onClick={start}
            >
              <Play aria-hidden /> {startLabel}
            </Button>
          )}
          {!running && stats.temp > 0 && (
            <Button
              type="button"
              variant="outline"
              className="h-14 w-full sm:w-auto"
              disabled={blocked}
              onClick={retestErrors}
            >
              <RotateCcw aria-hidden /> Retestar erros temporários ({stats.temp})
            </Button>
          )}
        </div>
        {noLength && <p className="text-sm text-destructive">Escolha ao menos um comprimento.</p>}

        {cooling && !running && (
          <div
            className="space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm"
            role="status"
          >
            <p className="flex items-center gap-2 font-medium">
              <Hourglass className="size-4 shrink-0" aria-hidden /> Limite de taxa: aguarde{" "}
              {mmss(cooldownSecs)} — retomada liberada às {clock(cooldownUntil)}.
            </p>
            <p className="text-xs text-muted-foreground">
              O progresso está salvo.{" "}
              {diag.autoResume === myMode
                ? "A varredura recomeça sozinha quando o prazo terminar."
                : "Depois do prazo, toque em “Retomar”."}
            </p>
            {!message && pace.note && (
              <p className="text-xs text-muted-foreground">
                Motivo registrado às {clock(pace.note.at)}: {pace.note.text}
              </p>
            )}
          </div>
        )}

        {running && (
          <p className="flex items-center gap-2 text-sm" role="status" aria-live="polite">
            <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
            {queueNote
              ? `${queueNote}${nextSecs > 0 ? ` (${nextSecs}s)` : ""}`
              : nextSecs > 0
                ? `Próxima consulta em ${nextSecs}s…`
                : current
                  ? `Consultando “${current}”…`
                  : "Preparando…"}
          </p>
        )}

        {message && (
          <p
            role="alert"
            className={
              message.tone === "error"
                ? "rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                : "rounded-md border bg-muted p-3 text-sm"
            }
          >
            {message.text}
          </p>
        )}

        <RateLimitPanel view={diagView} />
      </section>

      {recent.length > 0 && (
        <section className={cn("space-y-2", !meaningMode && "lg:col-span-2")}>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Últimos resultados</h2>
            <Button type="button" variant="ghost" className="h-11" onClick={onGoResults}>
              Ver todos
            </Button>
          </div>
          <ul className="space-y-2 sm:grid sm:grid-cols-2 sm:gap-2 sm:space-y-0 xl:grid-cols-3">
            {recent.map((r) => (
              <li key={r.code + r.checkedAt} className="rounded-lg border bg-card p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-lg font-semibold">{r.code}</span>
                  <StatusBadge status={r.status} />
                  {r.status === "not_found" && (
                    <a
                      href={inviteUrl(r.code)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
                      aria-label={`Abrir ${inviteLabel(r.code)} para validar no Discord`}
                    >
                      <ExternalLink className="size-3.5" aria-hidden /> {inviteLabel(r.code)}
                    </a>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{r.reason}</p>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            “{STATUS_LABEL.not_found}” é só a ausência de convite ativo — confirme na aba Ajuda.
          </p>
        </section>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background/40 px-2 py-1.5">
      <dt className="text-[11px] leading-tight text-muted-foreground">{label}</dt>
      <dd className="font-mono text-sm font-semibold text-foreground">{value}</dd>
    </div>
  );
}

function Stat({ value, label, className }: { value: number; label: string; className?: string }) {
  return (
    <div className={cn("rounded-md px-1 py-2", className)}>
      <div className="font-mono text-lg font-semibold">{value.toLocaleString("pt-BR")}</div>
      <div className="text-[11px] leading-tight">{label}</div>
    </div>
  );
}
