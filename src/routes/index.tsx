import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CandidatesTab } from "@/components/vanity/CandidatesTab";
import { ConfirmTab } from "@/components/vanity/ConfirmTab";
import { ResultsTab } from "@/components/vanity/ResultsTab";
import { ScannerTab } from "@/components/vanity/ScannerTab";
import { QuickCheck } from "@/components/vanity/QuickCheck";
import { GlobalSearch } from "@/components/vanity/GlobalSearch";
import {
  DEFAULT_MEANING_FILTERS,
  MeaningSuggestions,
  filterMeaningCandidates,
  type MeaningFilters,
} from "@/components/vanity/MeaningSuggestions";
import { generateMeaningCandidates } from "@/lib/vanity/meaning-generator";
import { WarningBanner } from "@/components/vanity/shared";
import { DEFAULT_CATALOG, type CatalogEntry } from "@/lib/vanity/catalog";
import { DEFAULT_SCANNER_CONFIG, type ResultsMap, type ScannerConfig } from "@/lib/vanity/scanner";
import { usePersistentState } from "@/lib/vanity/use-persistent-state";
import { StorageNotice } from "@/components/vanity/StorageNotice";
import { BackupPanel } from "@/components/vanity/BackupPanel";
import { DashboardTab } from "@/components/vanity/DashboardTab";
import { LibraryStatsCard } from "@/components/vanity/LibraryStatsCard";
import { Home, ScanSearch, LayoutDashboard, Settings } from "lucide-react";
import { AbbreviationLibraryTab } from "@/components/vanity/AbbreviationLibraryTab";
import {
  BUILT_IN_ABBREVIATIONS,
  EMPTY_ABBREVIATION_USER_DATA,
  type AbbreviationUserData,
} from "@/lib/vanity/abbreviation-library";
import type { CheckResult } from "@/lib/vanity/check-rules";
import {
  EMPTY_STATS,
  STATS_KEY,
  eventFromResult,
  recordCheck,
  seedFromResults,
  type StatsLog,
} from "@/lib/vanity/stats";
import logoUrl from "@/assets/drug-url-logo.png";
import { useBackgroundState } from "@/lib/vanity/background-browser";
import { mergeResults } from "@/lib/vanity/background-protocol";
import { mergeStats } from "@/lib/vanity/stats";
import { savePace } from "@/lib/vanity/pacing";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DRUG URL — Verificador de URLs do Discord e pesquisa de códigos" },
      {
        name: "description",
        content:
          "DRUG URL: verifique se uma URL personalizada do Discord está em uso e pesquise códigos, siglas e abreviações em um só lugar. Não encontrado não significa vanity URL disponível.",
      },
      {
        property: "og:title",
        content: "DRUG URL — Verificador de URLs do Discord e pesquisa de códigos",
      },
      {
        property: "og:description",
        content:
          "Verificador honesto de URLs curtas do Discord e pesquisa global de códigos e abreviações. Funciona no Safari do iPhone.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

type Tab = "inicio" | "scanner" | "painel" | "config";
const SAVE_THROTTLE_MS = 1500;

function Index() {
  const [tab, setTab] = useState<Tab>("inicio");
  const [running, setRunning] = useState(false);
  const [meaningRunning, setMeaningRunning] = useState(false);
  const [mode, setMode] = useState("all");
  const [resultMode, setResultMode] = useState("painel");
  const [abbreviations, setAbbreviations] = usePersistentState<AbbreviationUserData>(
    "drug-url:abbreviations:v1",
    EMPTY_ABBREVIATION_USER_DATA,
  );
  const abbreviationRecords = useMemo(
    () => [...BUILT_IN_ABBREVIATIONS, ...abbreviations.custom],
    [abbreviations.custom],
  );
  // Results and statistics change once per check: save them at most every 1.5 s (flushed on exit).
  const [meaningResults, setMeaningResults, meaningHydrated] = usePersistentState<ResultsMap>(
    "dvf:meaning-results:v1",
    {},
    "local",
    SAVE_THROTTLE_MS,
  );
  const [meaningConfig, setMeaningConfig] = usePersistentState<ScannerConfig>(
    "dvf:meaning-config:v1",
    DEFAULT_SCANNER_CONFIG,
  );
  const [meaningFilters, setMeaningFilters] = usePersistentState<MeaningFilters>(
    "dvf:meaning-filters:v1",
    DEFAULT_MEANING_FILTERS,
  );
  const [cooldownUntil, setCooldownUntil] = usePersistentState("dvf:cooldown-until", 0);
  const [lastCheckAt, setLastCheckAt] = usePersistentState("dvf:last-check-at", 0);
  const meaningPool = useMemo(generateMeaningCandidates, []);
  const meaningCodes = useMemo(
    () =>
      filterMeaningCandidates(meaningPool, meaningFilters)
        .slice(0, meaningFilters.limit)
        .map((c) => c.code),
    [meaningPool, meaningFilters],
  );
  const timing = { cooldownUntil, setCooldownUntil, lastCheckAt, setLastCheckAt };
  const [entries, setEntries] = usePersistentState<CatalogEntry[]>(
    "dvf:catalog:v1",
    DEFAULT_CATALOG,
  );
  const [selected, setSelected] = usePersistentState<string[]>("dvf:selected", []);
  const [results, setResults, resultsHydrated] = usePersistentState<ResultsMap>(
    "dvf:results:v1",
    {},
    "local",
    SAVE_THROTTLE_MS,
  );
  const [stats, setStats, statsHydrated] = usePersistentState<StatsLog>(
    STATS_KEY,
    EMPTY_STATS,
    "local",
    SAVE_THROTTLE_MS,
  );
  // Start the history once, from results that were saved before it existed (real checks only).
  useEffect(() => {
    if (!statsHydrated || !resultsHydrated || !meaningHydrated || stats.since) return;
    setStats((cur) => (cur.since ? cur : seedFromResults(results, meaningResults)));
  }, [
    statsHydrated,
    resultsHydrated,
    meaningHydrated,
    stats.since,
    results,
    meaningResults,
    setStats,
  ]);
  const recordAll = useCallback(
    (r: CheckResult, startedAt: number) =>
      setStats((cur) => recordCheck(cur, eventFromResult(r, "a", startedAt))),
    [setStats],
  );
  const recordMeaning = useCallback(
    (r: CheckResult, startedAt: number) =>
      setStats((cur) => recordCheck(cur, eventFromResult(r, "m", startedAt))),
    [setStats],
  );
  const [config, setConfig] = usePersistentState<ScannerConfig>(
    "dvf:scanner-config:v1",
    DEFAULT_SCANNER_CONFIG,
  );
  const background = useBackgroundState();
  useEffect(() => {
    const s = background.snapshot;
    if (!s || !resultsHydrated || !meaningHydrated || !statsHydrated) return;
    setResults((cur) => mergeResults(cur, s.results));
    setMeaningResults((cur) => mergeResults(cur, s.meaningResults));
    setStats((cur) => mergeStats(cur, s.stats));
    setCooldownUntil((cur) => Math.max(cur, s.cooldownUntil));
    setLastCheckAt((cur) => Math.max(cur, s.lastCheckAt));
    savePace(window.localStorage, s.pace);
    setRunning(s.status === "running" && s.mode === "a");
    setMeaningRunning(s.status === "running" && s.mode === "m");
  }, [
    background.snapshot,
    resultsHydrated,
    meaningHydrated,
    statsHydrated,
    setResults,
    setMeaningResults,
    setStats,
    setCooldownUntil,
    setLastCheckAt,
  ]);

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-3 pb-[calc(env(safe-area-inset-bottom)+6rem)] sm:pb-8 sm:max-w-3xl sm:px-6 lg:max-w-5xl xl:max-w-6xl">
      <header className="flex items-center gap-3 pt-[calc(env(safe-area-inset-top)+1rem)] pb-2 sm:pt-8">
        <img src={logoUrl} alt="" width={816} height={816} className="size-10 sm:size-12" />
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
            <span className="text-brand-gradient">DRUG URL</span>
          </h1>
          <p className="text-xs text-muted-foreground">
            Verificador de URLs do Discord e pesquisa de códigos
          </p>
        </div>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <div className="space-y-2">
          <WarningBanner compact />
          <StorageNotice />
        </div>
        <TabsList className="app-nav fixed inset-x-0 bottom-0 z-30 grid h-auto w-full grid-cols-4 rounded-none border-t bg-background/95 p-1 pb-[calc(env(safe-area-inset-bottom)+0.25rem)] backdrop-blur sm:sticky sm:top-2 sm:bottom-auto sm:mt-3 sm:rounded-xl sm:border sm:pb-1">
          {(
            [
              ["inicio", "Início", Home],
              ["scanner", "Scanner", ScanSearch],
              ["painel", "Painel", LayoutDashboard],
              ["config", "Ajustes", Settings],
            ] as const
          ).map(([value, label, Icon]) => (
            <TabsTrigger
              key={value}
              value={value}
              className="flex h-14 flex-col gap-0.5 rounded-lg px-1 text-[11px] font-medium data-[state=active]:bg-accent data-[state=active]:text-primary data-[state=active]:shadow-none sm:h-11 sm:flex-row sm:gap-2 sm:text-sm"
            >
              <span className="relative">
                <Icon className="size-5" />
                {value === "scanner" && (running || meaningRunning) && (
                  <span
                    className="absolute -top-0.5 -right-1 size-2 animate-pulse rounded-full bg-primary"
                    aria-label="em execução"
                  />
                )}
              </span>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent
          value="inicio"
          forceMount
          className="mt-3 space-y-4 data-[state=inactive]:hidden"
        >
          <QuickCheck
            {...timing}
            results={results}
            setResults={setResults}
            busy={running || meaningRunning}
            onCheck={recordAll}
          />
          <GlobalSearch data={abbreviations} setData={setAbbreviations} />
        </TabsContent>

        <TabsContent value="scanner" forceMount className="mt-3 data-[state=inactive]:hidden">
          <Tabs value={mode} onValueChange={setMode}>
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Escolha o modo de busca
            </p>
            <TabsList className="mb-4 grid h-auto w-full grid-cols-3 items-stretch gap-2 bg-transparent p-0">
              {(
                [
                  [
                    "all",
                    "Todas as combinações",
                    "Testa cada código de 2–3 caracteres, em ordem.",
                    running,
                  ],
                  [
                    "meaning",
                    "URLs com significado",
                    "Palavras e sons com sentido em vários idiomas.",
                    meaningRunning,
                  ],
                  ["list", "Minha lista", "Seus códigos salvos para verificar.", false],
                ] as const
              ).map(([value, title, desc, active]) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="flex h-auto min-h-20 flex-col items-start justify-start gap-1 whitespace-normal rounded-lg border bg-card p-3 text-left data-[state=active]:border-primary data-[state=active]:bg-accent data-[state=active]:shadow-none"
                >
                  <span className="flex w-full items-center justify-between gap-1 text-sm font-semibold">
                    {title}
                    {active && (
                      <span
                        className="size-2 shrink-0 animate-pulse rounded-full bg-primary"
                        aria-label="em execução"
                      />
                    )}
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">{desc}</span>
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="all" forceMount className="data-[state=inactive]:hidden">
              <ScannerTab
                {...timing}
                background={background}
                blocked={meaningRunning}
                config={config}
                setConfig={setConfig}
                selected={selected}
                results={results}
                setResults={setResults}
                running={running}
                setRunning={setRunning}
                onCheck={recordAll}
                onGoCatalog={() => setMode("list")}
                onGoResults={() => {
                  setResultMode("all");
                  setTab("painel");
                }}
              />
            </TabsContent>
            <TabsContent
              value="meaning"
              forceMount
              className="space-y-4 data-[state=inactive]:hidden lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0"
            >
              <MeaningSuggestions
                all={meaningPool}
                filters={meaningFilters}
                setFilters={setMeaningFilters}
                running={running || meaningRunning}
              />
              <ScannerTab
                {...timing}
                background={background}
                meaningMode
                candidateCodes={meaningCodes}
                blocked={running}
                config={meaningConfig}
                setConfig={setMeaningConfig}
                selected={[]}
                results={meaningResults}
                setResults={setMeaningResults}
                running={meaningRunning}
                setRunning={setMeaningRunning}
                onCheck={recordMeaning}
                onGoCatalog={() => setMode("list")}
                onGoResults={() => {
                  setResultMode("meaning");
                  setTab("painel");
                }}
              />
            </TabsContent>
            <TabsContent value="list" forceMount className="data-[state=inactive]:hidden">
              <CandidatesTab
                entries={entries}
                setEntries={setEntries}
                selected={selected}
                setSelected={setSelected}
                lastStatus={results}
                abbreviationRecords={abbreviationRecords}
                onGoVerify={() => {
                  setConfig((c) => ({ ...c, source: "catalog" }));
                  setMode("all");
                }}
              />
            </TabsContent>
          </Tabs>
        </TabsContent>
        <TabsContent value="painel" forceMount className="mt-3 data-[state=inactive]:hidden">
          <Tabs value={resultMode} onValueChange={setResultMode}>
            <TabsList className="mb-3 grid h-12 w-full grid-cols-3">
              <TabsTrigger value="painel" className="h-10 px-1 text-xs">
                Visão geral
              </TabsTrigger>
              <TabsTrigger value="all" className="h-10 px-1 text-xs">
                <span className="sm:hidden">Combinações</span>
                <span className="hidden sm:inline">Todas as combinações</span>
              </TabsTrigger>
              <TabsTrigger value="meaning" className="h-10 px-1 text-xs">
                <span className="sm:hidden">Com significado</span>
                <span className="hidden sm:inline">URLs com significado</span>
              </TabsTrigger>
            </TabsList>
            <TabsContent
              value="painel"
              forceMount
              className="space-y-4 data-[state=inactive]:hidden"
            >
              <LibraryStatsCard custom={abbreviations.custom} />
              <DashboardTab
                stats={stats}
                setStats={setStats}
                results={results}
                meaningResults={meaningResults}
                running={running || meaningRunning}
                active={tab === "painel" && resultMode === "painel"}
                onOpenResults={(mode) => setResultMode(mode)}
              />
            </TabsContent>
            <TabsContent value="all" forceMount className="data-[state=inactive]:hidden">
              <ResultsTab
                results={results}
                setResults={setResults}
                entries={entries}
                abbreviationRecords={abbreviationRecords}
                running={running}
              />
            </TabsContent>
            <TabsContent value="meaning" forceMount className="data-[state=inactive]:hidden">
              <ResultsTab
                results={meaningResults}
                setResults={setMeaningResults}
                entries={meaningPool}
                abbreviationRecords={abbreviationRecords}
                running={meaningRunning}
              />
            </TabsContent>
          </Tabs>
        </TabsContent>
        <TabsContent value="config" forceMount className="mt-3 data-[state=inactive]:hidden">
          <div className="space-y-4">
            <BackupPanel
              data={{
                results,
                meaningResults,
                catalog: entries,
                selected,
                config,
                meaningConfig,
                meaningFilters: { ...meaningFilters },
                stats,
                abbreviations,
              }}
              defaults={{
                results: {},
                meaningResults: {},
                catalog: [],
                selected: [],
                config: DEFAULT_SCANNER_CONFIG,
                meaningConfig: DEFAULT_SCANNER_CONFIG,
                meaningFilters: { ...DEFAULT_MEANING_FILTERS },
                stats: EMPTY_STATS,
                abbreviations: EMPTY_ABBREVIATION_USER_DATA,
              }}
              busy={running || meaningRunning}
              setResults={setResults}
              setMeaningResults={setMeaningResults}
              setEntries={setEntries}
              setSelected={setSelected}
              setConfig={setConfig}
              setMeaningConfig={setMeaningConfig}
              setMeaningFilters={setMeaningFilters}
              setStats={setStats}
              setAbbreviations={setAbbreviations}
            />
            <AbbreviationLibraryTab data={abbreviations} setData={setAbbreviations} mode="manage" />
            <ConfirmTab />
          </div>
        </TabsContent>
      </Tabs>

      <footer className="mt-10 border-t pt-4 text-xs text-muted-foreground">
        Projeto independente, sem afiliação com o Discord. Não usa login, tokens, proxies nem tenta
        contornar CAPTCHA ou limites. Dados salvos apenas neste aparelho.
      </footer>
    </div>
  );
}
