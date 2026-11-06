import { ChevronDown, ChevronUp, Download, Plus, Search } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { downloadCsv } from "@/lib/vanity/browser";
import { toCsv } from "@/lib/vanity/check-rules";
import { matchesSearch } from "@/lib/vanity/search";
import { expandMeaningLimit, type MeaningCandidate } from "@/lib/vanity/meaning-generator";
import { NativeSelect } from "./shared";

export interface MeaningFilters {
  query: string;
  length: string;
  family: string;
  language: string;
  sort: string;
  limit: number;
}
export const DEFAULT_MEANING_FILTERS: MeaningFilters = {
  query: "",
  length: "all",
  family: "all",
  language: "all",
  sort: "relevance",
  limit: 250,
};
export function filterMeaningCandidates(all: MeaningCandidate[], filters: MeaningFilters) {
  return all
    .filter(
      (c) =>
        (filters.length === "all" || c.code.length === Number(filters.length)) &&
        (filters.family === "all" || c.family === filters.family) &&
        (filters.language === "all" || c.language.includes(filters.language)) &&
        matchesSearch(filters.query, c.code, c.meaning, c.language, c.family),
    )
    .sort((a, b) => {
      const score = (c: MeaningCandidate) =>
        filters.sort === "pronunciation"
          ? c.pronunciation
          : filters.sort === "aesthetics"
            ? c.aesthetics
            : c.relevance;
      return score(b) - score(a) || a.code.localeCompare(b.code);
    });
}

export function MeaningSuggestions({
  all,
  filters,
  setFilters,
  running,
}: {
  all: MeaningCandidate[];
  filters: MeaningFilters;
  setFilters: React.Dispatch<React.SetStateAction<MeaningFilters>>;
  running: boolean;
}) {
  const [show, setShow] = useState(20);
  const [expanded, setExpanded] = useState(false);
  const deferredFilters = useDeferredValue(filters);
  const matches = useMemo(
    () => filterMeaningCandidates(all, deferredFilters),
    [all, deferredFilters],
  );
  const candidates = matches.slice(0, filters.limit);
  const languages = useMemo(
    () => [...new Set(all.flatMap((c) => c.language.split(" / ")))].sort(),
    [all],
  );
  const update = (key: keyof MeaningFilters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setShow(20);
  };
  return (
    <section className="space-y-3 border-b pb-4" aria-label="Busca por URLs com significado">
      <h2 className="text-lg font-semibold">Busca por URLs com significado</h2>
      <fieldset disabled={running} className="space-y-3 disabled:opacity-60">
        <div className="relative">
          <Search aria-hidden className="absolute left-3 top-3 size-4 text-muted-foreground" />
          <Input
            className="h-11 pl-9 text-base sm:text-sm"
            type="search"
            aria-label="Buscar sugestões"
            placeholder="Código, significado ou idioma"
            value={filters.query}
            onChange={(e) => update("query", e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <Label htmlFor="m-length">Tamanho</Label>
            <NativeSelect
              id="m-length"
              value={filters.length}
              onChange={(e) => update("length", e.target.value)}
            >
              <option value="all">2 e 3 caracteres</option>
              <option value="2">2 caracteres</option>
              <option value="3">3 caracteres</option>
            </NativeSelect>
          </div>
          <div>
            <Label htmlFor="m-family">Origem</Label>
            <NativeSelect
              id="m-family"
              value={filters.family}
              onChange={(e) => update("family", e.target.value)}
            >
              <option value="all">Todas</option>
              {["palavra", "abreviação", "nome", "fonético"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <Label htmlFor="m-language">Idioma</Label>
            <NativeSelect
              id="m-language"
              value={filters.language}
              onChange={(e) => update("language", e.target.value)}
            >
              <option value="all">Todos</option>
              {languages.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <Label htmlFor="m-sort">Prioridade</Label>
            <NativeSelect
              id="m-sort"
              value={filters.sort}
              onChange={(e) => update("sort", e.target.value)}
            >
              <option value="relevance">Significado + som</option>
              <option value="pronunciation">Pronúncia</option>
              <option value="aesthetics">Estética (subjetiva)</option>
            </NativeSelect>
          </div>
        </div>
        <p className="text-sm text-muted-foreground" role="status">
          {candidates.length} sugestões na busca · {matches.length} combinações nos filtros
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={candidates.length >= matches.length}
            onClick={() =>
              setFilters((f) => ({ ...f, limit: expandMeaningLimit(f.limit, matches.length) }))
            }
          >
            <Plus aria-hidden /> Ampliar busca (+250)
          </Button>
          <Button
            variant="outline"
            disabled={!candidates.length}
            onClick={() =>
              downloadCsv(
                "vanity-sugestoes.csv",
                toCsv(
                  [
                    "codigo",
                    "significado",
                    "origem",
                    "idioma",
                    "pronuncia_heuristica",
                    "estetica_subjetiva",
                    "relevancia",
                  ],
                  candidates.map((c) => [
                    c.code,
                    c.meaning,
                    c.family,
                    c.language,
                    c.pronunciation,
                    c.aesthetics,
                    c.relevance,
                  ]),
                ),
              )
            }
          >
            <Download aria-hidden /> Sugestões CSV
          </Button>
        </div>
      </fieldset>
      <Button variant="ghost" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
        {expanded ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
        {expanded ? "Ocultar sugestões" : `Ver sugestões (${candidates.length})`}
      </Button>
      {expanded && (
        <ul className="space-y-2 sm:grid sm:grid-cols-2 sm:gap-2 sm:space-y-0">
          {candidates.slice(0, show).map((c) => (
            <li key={c.code} className="rounded-md border bg-card p-3">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="font-mono text-lg">{c.code}</strong>
                <Badge variant="outline">{c.family}</Badge>
                <span className="ml-auto text-xs text-muted-foreground">
                  Relevância {c.relevance}/100
                </span>
              </div>
              <p className="mt-1 text-sm break-words">{c.meaning}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Pronúncia {c.pronunciation}/100 · estética subjetiva {c.aesthetics}/100
              </p>
            </li>
          ))}
        </ul>
      )}
      {!candidates.length && (
        <p className="text-sm text-muted-foreground">Nenhuma sugestão corresponde aos filtros.</p>
      )}
      {expanded && candidates.length > show && (
        <Button variant="ghost" onClick={() => setShow((s) => s + 20)}>
          Mostrar mais sugestões
        </Button>
      )}
    </section>
  );
}
