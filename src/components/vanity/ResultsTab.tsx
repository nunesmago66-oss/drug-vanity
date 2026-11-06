import {
  AVAILABILITY_LABEL,
  AVAILABILITY_PLURAL,
  CATEGORY_ORDER,
  type Availability,
} from "@/lib/vanity/availability";
import {
  BadgeCheck,
  ClipboardList,
  Copy,
  Download,
  ExternalLink,
  History,
  Search,
  Trash2,
} from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
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
import { Label } from "@/components/ui/label";
import { copyText, downloadCsv, inviteLabel, inviteUrl } from "@/lib/vanity/browser";
import type { CatalogEntry } from "@/lib/vanity/catalog";
import { toCsv } from "@/lib/vanity/check-rules";
import { matchesSearch } from "@/lib/vanity/search";
import {
  BUILT_IN_ABBREVIATIONS,
  findMatchingAbbreviationCodes,
  normalizeAbbreviationCode,
  type AbbreviationRecord,
} from "@/lib/vanity/abbreviation-library";
import {
  availabilityOf,
  countAvailability,
  describeResult,
  statusLabelOf,
  statusOf,
  type ResultsMap,
} from "@/lib/vanity/scanner";

import { EmptyState, NOT_FOUND_WARNING, NativeSelect, StatusBadge } from "./shared";

interface Props {
  results: ResultsMap;
  setResults: React.Dispatch<React.SetStateAction<ResultsMap>>;
  entries: CatalogEntry[];
  running: boolean;
  abbreviationRecords?: AbbreviationRecord[];
}

type Filter = "all" | Availability;
/** One filter per category; "Inválidas" only appears when such results exist. */
const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "Todos" },
  ...CATEGORY_ORDER.map((a) => ({ value: a, label: AVAILABILITY_PLURAL[a] })),
];
const CSV_NAME: Record<Filter, string> = {
  all: "vanity-resultados.csv",
  ACTIVE: "vanity-ativas.csv",
  NOT_IN_USE: "vanity-nao-estao-em-uso.csv",
  CONFIRMED_FREE: "vanity-liberadas.csv",
  EXPIRED: "vanity-expiradas.csv",
  REVOKED: "vanity-revogadas.csv",
  BLOCKED: "vanity-bloqueadas.csv",
  UNKNOWN: "vanity-indefinidas.csv",
  INVALID: "vanity-invalidas.csv",
};
const STAT_TONE: Record<Availability, string> = {
  ACTIVE: "bg-status-exists",
  NOT_IN_USE: "bg-status-notfound",
  CONFIRMED_FREE: "bg-primary",
  EXPIRED: "bg-status-inconclusive",
  REVOKED: "bg-status-inconclusive",
  BLOCKED: "bg-destructive",
  UNKNOWN: "bg-status-inconclusive",
  INVALID: "bg-status-inconclusive",
};

const PAGE = 100;
type Sort = "recent" | "oldest" | "az" | "za" | "length";
const SORT_LABEL: Record<Sort, string> = {
  recent: "Mais recentes",
  oldest: "Mais antigos",
  az: "Código A→Z",
  za: "Código Z→A",
  length: "Mais curtos primeiro",
};
const fmt = (sec: number) =>
  new Date(sec * 1000).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function ResultsTab({
  results,
  setResults,
  entries,
  running,
  abbreviationRecords = BUILT_IN_ABBREVIATIONS,
}: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [length, setLength] = useState<"all" | "2" | "3">("all");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const deferredResults = useDeferredValue(results);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [sort, setSort] = useState<Sort>("recent");
  const [confirmClear, setConfirmClear] = useState(false);
  const meanings = useMemo(() => new Map(entries.map((e) => [e.code, e.meaning])), [entries]);
  const favorites = useMemo(
    () => new Set(entries.filter((e) => e.favorite).map((e) => e.code)),
    [entries],
  );

  const all = useMemo(() => Object.entries(deferredResults), [deferredResults]);
  const counts = useMemo(() => countAvailability(deferredResults), [deferredResults]);

  const matchingAbbreviationCodes = useMemo(
    () => findMatchingAbbreviationCodes(deferredQuery, abbreviationRecords),
    [deferredQuery, abbreviationRecords],
  );
  const list = useMemo(() => {
    const filtered = all.filter(([code, r]) => {
      if (filter !== "all" && availabilityOf(r) !== filter) return false;
      if (length !== "all" && code.length !== Number(length)) return false;
      if (onlyFavorites && !favorites.has(code)) return false;
      if (
        !matchesSearch(deferredQuery, code, meanings.get(code)) &&
        !matchingAbbreviationCodes.has(normalizeAbbreviationCode(code))
      )
        return false;
      return true;
    });
    const by: Record<Sort, (a: (typeof all)[number], b: (typeof all)[number]) => number> = {
      recent: (a, b) => b[1][2] - a[1][2] || a[0].localeCompare(b[0]),
      oldest: (a, b) => a[1][2] - b[1][2] || a[0].localeCompare(b[0]),
      az: (a, b) => a[0].localeCompare(b[0]),
      za: (a, b) => b[0].localeCompare(a[0]),
      length: (a, b) => a[0].length - b[0].length || a[0].localeCompare(b[0]),
    };
    return [...filtered].sort(by[sort]);
  }, [
    all,
    filter,
    length,
    deferredQuery,
    meanings,
    favorites,
    onlyFavorites,
    sort,
    matchingAbbreviationCodes,
  ]);

  const filtersActiveExceptCategory = length !== "all" || !!query || onlyFavorites;
  const filtersActive = filter !== "all" || filtersActiveExceptCategory;

  function clearFilters() {
    setFilter("all");
    setLength("all");
    setQuery("");
    setOnlyFavorites(false);
    setSort("recent");
    setLimit(PAGE);
  }

  function exportCsv() {
    downloadCsv(
      CSV_NAME[filter],
      toCsv(
        [
          "codigo",
          "link",
          "comprimento",
          "status",
          "http",
          "verificado_em",
          "significado",
          "aviso",
          "verified_availability",
          "categoria",
        ],
        list.map(([code, r]) => [
          code,
          inviteLabel(code),
          code.length,
          statusLabelOf(r),
          r[1] ?? "",
          new Date(r[2] * 1000).toISOString(),
          meanings.get(code) ?? "",
          availabilityOf(r) === "CONFIRMED_FREE"
            ? ""
            : r[0] === "n"
              ? NOT_FOUND_WARNING
              : r[0] === "x"
                ? describeResult(r)
                : "",
          availabilityOf(r),
          AVAILABILITY_LABEL[availabilityOf(r)],
        ]),
      ),
    );
  }

  async function copyList() {
    const text = list.map(([code]) => inviteLabel(code)).join("\n");
    const ok = await copyText(text);
    if (ok) toast.success(`${list.length.toLocaleString("pt-BR")} links copiados`);
    else toast.error("Não foi possível copiar.");
  }

  async function copy(code: string) {
    const ok = await copyText(inviteLabel(code));
    if (ok) toast.success(`Copiado: ${inviteLabel(code)}`);
    else toast.error("Não foi possível copiar.");
  }

  return (
    <div className="space-y-4">
      <p className="text-sm" data-testid="results-summary">
        <strong className="font-mono">{all.length.toLocaleString("pt-BR")}</strong> códigos testados
        · {counts.ACTIVE} ativas · {counts.NOT_IN_USE} não estão em uso · {counts.CONFIRMED_FREE}{" "}
        liberadas · {counts.UNKNOWN} indefinidas
      </p>

      <section
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
        aria-label="Resumo das verificações"
      >
        {[
          {
            label: "Total verificado",
            value: all.length,
            percent: all.length ? 100 : 0,
            tone: "bg-primary",
          },
          ...CATEGORY_ORDER.filter((a) => a !== "INVALID" || counts.INVALID > 0).map((a) => ({
            label: AVAILABILITY_PLURAL[a],
            value: counts[a],
            percent: all.length ? (counts[a] / all.length) * 100 : 0,
            tone: STAT_TONE[a],
          })),
        ].map((stat) => (
          <div key={stat.label} className="min-w-0 rounded-lg border bg-card p-3">
            <p className="truncate text-xs text-muted-foreground">{stat.label}</p>
            <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">
              {stat.value.toLocaleString("pt-BR")}
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" role="presentation">
              <div
                className={`h-full rounded-full ${stat.tone}`}
                style={{ width: `${stat.percent}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {stat.percent.toFixed(1).replace(".", ",")}% do total
            </p>
          </div>
        ))}
      </section>

      <section className="space-y-3 rounded-lg border bg-card p-3 sm:p-4" aria-label="Filtros">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por status">
          {FILTERS.filter((f) => f.value !== "INVALID" || counts.INVALID > 0).map((f) => (
            <Button
              key={f.value}
              type="button"
              size="sm"
              variant={filter === f.value ? "default" : "outline"}
              aria-pressed={filter === f.value}
              onClick={() => {
                setFilter(f.value);
                setLimit(PAGE);
              }}
              className="h-11 flex-1 sm:flex-none"
            >
              {f.label} (
              {(f.value === "all" ? all.length : counts[f.value]).toLocaleString("pt-BR")})
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-[1fr_7rem] gap-2 sm:grid-cols-[1fr_10rem]">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(PAGE);
              }}
              placeholder="Buscar código ou significado"
              aria-label="Buscar código ou significado"
              autoCapitalize="none"
              autoCorrect="off"
              className="h-11 pl-9 text-base sm:text-sm"
            />
          </div>
          <div>
            <Label htmlFor="r-length" className="sr-only">
              Comprimento
            </Label>
            <NativeSelect
              id="r-length"
              className="h-11"
              value={length}
              onChange={(e) => {
                setLength(e.target.value as typeof length);
                setLimit(PAGE);
              }}
            >
              <option value="all">Todos</option>
              <option value="2">2 letras</option>
              <option value="3">3 letras</option>
            </NativeSelect>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={onlyFavorites ? "default" : "outline"}
              aria-pressed={onlyFavorites}
              onClick={() => {
                setOnlyFavorites((v) => !v);
                setLimit(PAGE);
              }}
              className="h-10"
            >
              {onlyFavorites ? "★ Só favoritos" : "☆ Filtrar favoritos"}
            </Button>
            {filtersActive && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-10"
                onClick={clearFilters}
              >
                Limpar filtros
              </Button>
            )}
          </div>
          <Label htmlFor="r-sort" className="sr-only">
            Ordenar
          </Label>
          <NativeSelect
            className="h-11"
            id="r-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
          >
            {(Object.keys(SORT_LABEL) as Sort[]).map((k) => (
              <option key={k} value={k}>
                Ordenar: {SORT_LABEL[k]}
              </option>
            ))}
          </NativeSelect>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Button
          type="button"
          variant="outline"
          onClick={copyList}
          disabled={list.length === 0}
          className="h-11"
        >
          <ClipboardList aria-hidden /> Copiar lista
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={exportCsv}
          disabled={list.length === 0}
          className="h-11"
        >
          <Download aria-hidden /> CSV ({list.length.toLocaleString("pt-BR")})
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setConfirmClear(true)}
          disabled={all.length === 0 || running}
          className="col-span-2 h-11 text-destructive hover:text-destructive"
        >
          <Trash2 aria-hidden /> Apagar resultados
        </Button>
      </div>

      {all.length === 0 ? (
        <EmptyState icon={History} title="Nenhum código testado ainda">
          Inicie uma varredura na aba Scanner. Os resultados ficam salvos só neste aparelho.
        </EmptyState>
      ) : list.length === 0 && filter === "CONFIRMED_FREE" && !filtersActiveExceptCategory ? (
        <EmptyState icon={BadgeCheck} title="Nenhuma URL liberada">
          Só entra aqui um código com confirmação positiva de uma operação oficial e autorizada do
          Discord. A API pública não oferece essa confirmação, então HTTP 404 fica em “Não estão em
          uso” e erros ou limites ficam em “Indefinidas” — nunca aqui.
        </EmptyState>
      ) : list.length === 0 ? (
        <EmptyState icon={Search} title="Nenhum resultado com esses filtros" />
      ) : (
        <>
          <ul className="space-y-2 sm:grid sm:grid-cols-2 sm:gap-3 sm:space-y-0 xl:grid-cols-3">
            {list.slice(0, limit).map(([code, r]) => (
              <li key={code} className="rounded-lg border bg-card p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-lg font-semibold">{code}</span>
                  <StatusBadge status={statusOf(r)} />
                  <span className="ml-auto text-xs text-muted-foreground">{fmt(r[2])}</span>
                </div>
                {meanings.get(code) && <p className="mt-1 text-sm">{meanings.get(code)}</p>}
                <p className="mt-1 text-xs text-muted-foreground">{describeResult(r)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Verified Availability:{" "}
                  <span className="font-medium text-foreground">
                    {AVAILABILITY_LABEL[availabilityOf(r)]}
                  </span>
                </p>
                <div className="mt-2 flex flex-wrap gap-2 border-t pt-2">
                  {r[0] === "n" && (
                    <Button asChild size="sm" variant="outline" className="h-11 flex-1">
                      <a href={inviteUrl(code)} target="_blank" rel="noopener noreferrer">
                        <ExternalLink aria-hidden /> Validar {inviteLabel(code)}
                      </a>
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-11"
                    aria-label={`Copiar ${inviteLabel(code)}`}
                    onClick={() => copy(code)}
                  >
                    <Copy aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          {list.length > limit && (
            <Button
              type="button"
              variant="outline"
              className="h-12 w-full"
              onClick={() => setLimit((l) => l + PAGE)}
            >
              Mostrar mais ({(list.length - limit).toLocaleString("pt-BR")} restantes)
            </Button>
          )}
        </>
      )}

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar todos os resultados?</AlertDialogTitle>
            <AlertDialogDescription>
              O progresso da varredura volta a zero neste aparelho. Não pode ser desfeito.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => setResults({})}>Apagar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
