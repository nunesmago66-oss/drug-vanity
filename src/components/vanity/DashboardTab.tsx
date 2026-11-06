import {
  Activity,
  BarChart3,
  Clock,
  Gauge,
  History,
  Search,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import {
  lazy,
  Suspense,
  useEffect,
  useDeferredValue,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { inviteLabel } from "@/lib/vanity/browser";
import { matchesSearch } from "@/lib/vanity/search";
import type { CheckStatus } from "@/lib/vanity/check-rules";
import type { ResultsMap, StatusKey } from "@/lib/vanity/scanner";
import {
  avgResponseMs,
  codeTotals,
  lastDays,
  successRate,
  sumDays,
  type StatsLog,
} from "@/lib/vanity/stats";
import { cn } from "@/lib/utils";

import { EmptyState, NativeSelect, StatusBadge } from "./shared";

const DashboardCharts = lazy(() => import("./DashboardCharts"));

interface Props {
  stats: StatsLog;
  setStats: Dispatch<SetStateAction<StatsLog>>;
  results: ResultsMap;
  meaningResults: ResultsMap;
  running: boolean;
  /** True while the dashboard is on screen (charts load only then). */
  active: boolean;
  onOpenResults: (mode: "all" | "meaning") => void;
}

const STATUS: Record<StatusKey, CheckStatus> = { e: "exists", n: "not_found", x: "inconclusive" };
const n = (v: number) => v.toLocaleString("pt-BR");
const pct = (v: number | null) => (v === null ? "—" : `${v.toFixed(1).replace(".", ",")}%`);
const ms = (v: number | null) =>
  v === null ? "—" : v >= 1000 ? `${(v / 1000).toFixed(1).replace(".", ",")} s` : `${v} ms`;
const when = (sec: number) =>
  new Date(sec * 1000).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });
const RANGES = [7, 14, 30] as const;
const PAGE = 20;

export function DashboardTab({
  stats,
  setStats,
  results,
  meaningResults,
  running,
  active,
  onOpenResults,
}: Props) {
  // Re-render each minute so "hoje" and the day axis roll over at midnight.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const [range, setRange] = useState<(typeof RANGES)[number]>(14);
  const [chartsReady, setChartsReady] = useState(false);
  useEffect(() => {
    if (active) setChartsReady(true);
  }, [active]);
  const [historyFilter, setHistoryFilter] = useState<"all" | StatusKey>("all");
  const [historyMode, setHistoryMode] = useState<"all" | "a" | "m">("all");
  const [historyQuery, setHistoryQuery] = useState("");
  const deferredHistoryQuery = useDeferredValue(historyQuery);
  const [limit, setLimit] = useState(PAGE);
  const [confirmClear, setConfirmClear] = useState(false);

  const totals = useMemo(() => codeTotals(results, meaningResults), [results, meaningResults]);
  const days = useMemo(() => lastDays(stats, range, now), [stats, range, now]);
  const today = useMemo(() => sumDays(stats, 1, now), [stats, now]);
  const week = useMemo(() => sumDays(stats, 7, now), [stats, now]);
  const history = useMemo(
    () =>
      stats.recent.filter(
        (e) =>
          (historyFilter === "all" || e[1] === historyFilter) &&
          (historyMode === "all" || e[4] === historyMode) &&
          matchesSearch(deferredHistoryQuery, e[0]),
      ),
    [stats.recent, historyFilter, historyMode, deferredHistoryQuery],
  );

  const codeCards = [
    {
      label: "Códigos verificados",
      value: totals.verified,
      hint: `2 caracteres: ${n(totals.len2)} · 3 caracteres: ${n(totals.len3)}`,
      bar: "bg-primary",
      share: totals.verified ? 100 : 0,
    },
    {
      label: "Sem convite ativo",
      value: totals.notFound,
      hint: "Candidatos — não confirma vanity URL",
      bar: "bg-status-notfound",
      share: totals.verified ? (totals.notFound / totals.verified) * 100 : 0,
    },
    {
      label: "Em uso",
      value: totals.exists,
      hint: "Já existe convite ativo (indisponível)",
      bar: "bg-status-exists",
      share: totals.verified ? (totals.exists / totals.verified) * 100 : 0,
    },
    {
      label: "Inválidos (erro/limite)",
      value: totals.errors,
      hint: "Sem resposta válida — retestar",
      bar: "bg-status-inconclusive",
      share: totals.verified ? (totals.errors / totals.verified) * 100 : 0,
    },
  ];

  const checkCards = [
    {
      icon: Activity,
      label: "Verificações realizadas",
      value: n(stats.total.c),
      hint: `Hoje: ${n(today.c)} · 7 dias: ${n(week.c)}`,
    },
    {
      icon: Gauge,
      label: "Taxa de sucesso",
      value: pct(successRate(stats.total)),
      hint: `${n(stats.total.e + stats.total.n)} com resposta válida · 7 dias: ${pct(successRate(week))}`,
    },
    {
      icon: Clock,
      label: "Tempo médio",
      value: ms(avgResponseMs(stats.total)),
      hint: `Por consulta · 7 dias: ${ms(avgResponseMs(week))}`,
    },
    {
      icon: ShieldAlert,
      label: "Limites (429)",
      value: n(stats.total.r),
      hint: `Hoje: ${n(today.r)} · erros totais: ${n(stats.total.x)}`,
    },
  ];

  const empty = stats.total.c === 0 && totals.verified === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <BarChart3 className="size-4 text-primary" aria-hidden /> Painel de estatísticas
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Dados reais salvos neste aparelho
            {stats.since ? ` · histórico desde ${when(stats.since).split(",")[0]}` : ""}
          </p>
        </div>
        <p
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
            running ? "border-primary text-primary" : "text-muted-foreground",
          )}
          aria-live="polite"
        >
          <span
            className={cn(
              "size-2 rounded-full",
              running ? "animate-pulse bg-primary" : "bg-muted-foreground/50",
            )}
            aria-hidden
          />
          {running ? "Ao vivo · verificando" : "Atualiza a cada novo resultado"}
        </p>
      </div>

      {empty ? (
        <EmptyState icon={BarChart3} title="Nenhuma verificação ainda">
          Inicie uma varredura na aba Scanner. Cada resultado aparece aqui na hora.
        </EmptyState>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label="Totais de códigos">
            {codeCards.map((c) => (
              <div key={c.label} className="min-w-0 rounded-lg border bg-card p-3">
                <p className="truncate text-xs text-muted-foreground">{c.label}</p>
                <p className="mt-1 font-mono text-2xl font-semibold tabular-nums sm:text-3xl">
                  {n(c.value)}
                </p>
                <div
                  className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
                  role="presentation"
                >
                  <div
                    className={cn("h-full rounded-full", c.bar)}
                    style={{ width: `${c.share}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                  {pct(c.share)} · {c.hint}
                </p>
              </div>
            ))}
          </section>

          <section
            className="grid grid-cols-2 gap-2 lg:grid-cols-4"
            aria-label="Desempenho das verificações"
          >
            {checkCards.map((c) => (
              <div key={c.label} className="min-w-0 rounded-lg border bg-card p-3">
                <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                  <c.icon className="size-3.5 shrink-0" aria-hidden /> {c.label}
                </p>
                <p className="mt-1 font-mono text-xl font-semibold tabular-nums sm:text-2xl">
                  {c.value}
                </p>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{c.hint}</p>
              </div>
            ))}
          </section>

          <section className="space-y-3" aria-label="Gráficos">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Gráficos de desempenho</h3>
              <div className="flex gap-1" role="group" aria-label="Período dos gráficos">
                {RANGES.map((r) => (
                  <Button
                    key={r}
                    size="sm"
                    variant={range === r ? "default" : "outline"}
                    aria-pressed={range === r}
                    className="h-9 px-3"
                    onClick={() => setRange(r)}
                  >
                    {r} dias
                  </Button>
                ))}
              </div>
            </div>
            {chartsReady ? (
              <Suspense fallback={<ChartsSkeleton />}>
                <DashboardCharts days={days} totals={totals} />
              </Suspense>
            ) : (
              <ChartsSkeleton />
            )}
          </section>

          <section className="grid gap-2 sm:grid-cols-2" aria-label="Por modo de busca">
            {(
              [
                ["all", "Todas as combinações", totals.byMode.a],
                ["meaning", "URLs com significado", totals.byMode.m],
              ] as const
            ).map(([mode, label, value]) => (
              <button
                key={mode}
                type="button"
                onClick={() => onOpenResults(mode)}
                className="flex min-h-14 items-center justify-between gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span>
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="text-xs text-muted-foreground">Ver lista de resultados →</span>
                </span>
                <span className="font-mono text-lg tabular-nums">{n(value)}</span>
              </button>
            ))}
          </section>

          <section
            className="space-y-3 rounded-lg border bg-card p-3 sm:p-4"
            aria-label="Histórico"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <History className="size-4" aria-hidden /> Histórico de verificações
              </h3>
              <span className="text-xs text-muted-foreground">
                Últimas {n(stats.recent.length)} guardadas
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="relative sm:col-span-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  type="search"
                  value={historyQuery}
                  onChange={(e) => {
                    setHistoryQuery(e.target.value);
                    setLimit(PAGE);
                  }}
                  placeholder="Buscar código no histórico"
                  aria-label="Buscar código no histórico"
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="h-11 pl-9 text-base sm:text-sm"
                />
              </div>
              <NativeSelect
                aria-label="Filtrar histórico por status"
                value={historyFilter}
                onChange={(e) => {
                  setHistoryFilter(e.target.value as "all" | StatusKey);
                  setLimit(PAGE);
                }}
              >
                <option value="all">Todos os status</option>
                <option value="n">Sem convite ativo</option>
                <option value="e">Em uso</option>
                <option value="x">Erro/limite</option>
              </NativeSelect>
              <NativeSelect
                aria-label="Filtrar histórico por modo"
                value={historyMode}
                onChange={(e) => {
                  setHistoryMode(e.target.value as "all" | "a" | "m");
                  setLimit(PAGE);
                }}
              >
                <option value="all">Todos os modos</option>
                <option value="a">Combinações</option>
                <option value="m">Com significado</option>
              </NativeSelect>
            </div>
            {history.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhuma verificação com esses filtros.
              </p>
            ) : (
              <ul className="divide-y" data-testid="history-list">
                {history.slice(0, limit).map(([code, s, http, ts, mode, rt]) => (
                  <li
                    key={`${code}-${ts}-${mode}`}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
                  >
                    <span
                      className="w-12 font-mono text-base font-semibold"
                      title={inviteLabel(code)}
                    >
                      {code}
                    </span>
                    <StatusBadge status={STATUS[s]} className="text-[11px]" />
                    <span className="ml-auto text-right text-[11px] text-muted-foreground tabular-nums">
                      {when(ts)}
                      <br />
                      {mode === "a" ? "Combinações" : "Significado"} · HTTP {http ?? "—"}
                      {rt !== null ? ` · ${ms(rt)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {history.length > limit && (
              <Button
                variant="outline"
                className="h-10 w-full"
                onClick={() => setLimit((l) => l + PAGE)}
              >
                Mostrar mais ({n(history.length - limit)})
              </Button>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              <p className="text-[11px] text-muted-foreground">
                {stats.seeded
                  ? `${n(stats.seeded)} verificações vieram de resultados salvos antes do painel (sem tempo de resposta).`
                  : "Cada consulta do Scanner é registrada aqui, inclusive retestes."}
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                disabled={running || stats.total.c === 0}
                onClick={() => setConfirmClear(true)}
              >
                <Trash2 aria-hidden /> Limpar histórico
              </Button>
            </div>
          </section>
        </>
      )}

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar histórico de verificações?</AlertDialogTitle>
            <AlertDialogDescription>
              Contadores, gráficos e o histórico recomeçam do zero. Os resultados salvos dos códigos
              não são apagados. Baixe um backup na aba Ajuda se quiser guardar o histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setStats({
                  since: Math.floor(Date.now() / 1000),
                  seeded: 0,
                  total: { c: 0, e: 0, n: 0, x: 0, r: 0, ms: 0, mc: 0 },
                  days: {},
                  recent: [],
                });
                toast.success("Histórico limpo");
              }}
            >
              Limpar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ChartsSkeleton() {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {[0, 1].map((i) => (
        <Skeleton key={i} className="h-64 rounded-lg" />
      ))}
    </div>
  );
}
