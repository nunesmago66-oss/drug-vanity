import { useDeferredValue, useMemo, useState } from "react";
import { Search, Star, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BUILT_IN_ABBREVIATIONS,
  groupMeanings,
  type AbbreviationRecord,
  type AbbreviationUserData,
} from "@/lib/vanity/abbreviation-library";
import { buildLibraryIndex, rankedSearch } from "@/lib/vanity/global-library";

const PAGE = 100;
const normalize = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

interface Props {
  data: AbbreviationUserData;
  setData: React.Dispatch<React.SetStateAction<AbbreviationUserData>>;
}

/**
 * Global search: one field over every record (abbreviations, slang, airports,
 * countries, currencies, languages, technical codes). Results appear inline.
 */
export function GlobalSearch({ data, setData }: Props) {
  const [query, setQuery] = useState("");
  const [visible, setVisible] = useState(PAGE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);

  const all = useMemo(() => [...BUILT_IN_ABBREVIATIONS, ...data.custom], [data.custom]);
  const index = useMemo(() => buildLibraryIndex(all), [all]);
  const indexById = useMemo(() => new Map(index.entries.map((e) => [e.record.id, e])), [index]);
  const meaningsByCode = useMemo(() => groupMeanings(all), [all]);
  const results = useMemo(
    () => (deferredQuery.trim() ? rankedSearch(index, deferredQuery) : []),
    [index, deferredQuery],
  );
  const selected = all.find((r) => r.id === selectedId) ?? null;
  const favorites = useMemo(() => new Set(data.favorites), [data.favorites]);

  function open(record: AbbreviationRecord) {
    setSelectedId(record.id);
    setData((cur) => ({
      ...cur,
      recent: [record.id, ...cur.recent.filter((id) => id !== record.id)].slice(0, 30),
    }));
  }

  function toggleFavorite(record: AbbreviationRecord) {
    setData((cur) => ({
      ...cur,
      favorites: cur.favorites.includes(record.id)
        ? cur.favorites.filter((id) => id !== record.id)
        : [...cur.favorites, record.id],
    }));
  }

  return (
    <section
      aria-label="Pesquisa global de códigos e abreviações"
      className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm sm:p-5"
    >
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          inputMode="search"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setVisible(PAGE);
          }}
          placeholder="Pesquisar código, sigla, aeroporto, país, moeda…"
          aria-label="Pesquisa global"
          className="h-12 rounded-xl pl-11 text-base"
        />
      </div>

      {deferredQuery.trim() && (
        <p className="text-xs text-muted-foreground">
          {results.length.toLocaleString("pt-BR")} resultados em{" "}
          {all.length.toLocaleString("pt-BR")} registros
        </p>
      )}

      {results.length > 0 && (
        <div className="max-h-[55vh] space-y-1 overflow-y-auto overscroll-contain">
          {results.slice(0, visible).map((entry) => {
            const r = entry.record;
            const meanings = meaningsByCode.get(normalize(r.abbreviation)) ?? [r];
            return (
              <div
                key={r.id}
                className={`flex items-center gap-2 rounded-lg border p-3 ${
                  selectedId === r.id
                    ? "border-primary bg-accent/40"
                    : "border-transparent bg-muted/30"
                }`}
              >
                <button type="button" onClick={() => open(r)} className="min-w-0 flex-1 text-left">
                  <span className="flex flex-wrap items-center gap-2">
                    <strong className="font-mono text-sm tracking-wide">{r.abbreviation}</strong>
                    <span className="text-sm text-muted-foreground">{r.meaning}</span>
                    {meanings.length > 1 && (
                      <Badge variant="outline" className="text-[10px]">
                        {meanings.length} significados
                      </Badge>
                    )}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    <Badge variant="secondary" className="text-[10px]">
                      {entry.group}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {r.region && r.region !== "Global" ? r.region : r.language}
                    </Badge>
                    {r.verified && (
                      <Badge
                        variant="outline"
                        className="border-primary/40 text-[10px] text-primary"
                      >
                        verificado
                      </Badge>
                    )}
                  </span>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9 shrink-0"
                  aria-label={
                    favorites.has(r.id) ? "Remover dos favoritos" : "Adicionar aos favoritos"
                  }
                  onClick={() => toggleFavorite(r)}
                >
                  <Star
                    className={`size-4 ${favorites.has(r.id) ? "fill-amber-400 text-amber-500" : ""}`}
                  />
                </Button>
              </div>
            );
          })}
          {results.length > visible && (
            <div className="p-3 text-center">
              <Button size="sm" variant="outline" onClick={() => setVisible((v) => v + PAGE)}>
                Mostrar mais ({(results.length - visible).toLocaleString("pt-BR")} restantes)
              </Button>
            </div>
          )}
        </div>
      )}

      {deferredQuery.trim() && results.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nenhum registro encontrado para essa pesquisa.
        </div>
      )}

      {selected && (
        <div className="space-y-3 rounded-xl border bg-background/60 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-2xl font-bold">{selected.abbreviation}</p>
              <h3 className="text-lg font-semibold">{selected.meaning}</h3>
              <div className="mt-1 flex flex-wrap gap-1">
                <Badge variant="secondary">
                  {indexById.get(selected.id)?.group ?? "Não classificado"}
                </Badge>
                <Badge variant="outline">{selected.language}</Badge>
                <Badge variant={selected.verified ? "secondary" : "outline"}>
                  {selected.verified ? "Verificado" : "Não verificado"}
                </Badge>
              </div>
            </div>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Fechar detalhes"
              onClick={() => setSelectedId(null)}
            >
              <X className="size-4" />
            </Button>
          </div>
          {selected.description && (
            <p className="text-sm text-muted-foreground">{selected.description}</p>
          )}
          {selected.aliases.length > 0 && (
            <p className="text-sm">
              <strong>Termos relacionados:</strong> {selected.aliases.join(", ")}
            </p>
          )}
          {(meaningsByCode.get(normalize(selected.abbreviation)) ?? []).length > 1 && (
            <div className="rounded-lg bg-muted/30 p-3">
              <p className="mb-2 text-sm font-semibold">
                Todos os significados de {selected.abbreviation}
              </p>
              <ul className="space-y-1">
                {(meaningsByCode.get(normalize(selected.abbreviation)) ?? []).map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => open(m)}
                      className={`text-left text-sm ${
                        m.id === selected.id
                          ? "font-semibold"
                          : "text-muted-foreground underline-offset-2 hover:underline"
                      }`}
                    >
                      {m.meaning}{" "}
                      <span className="text-xs">
                        · {m.language} · {m.category}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {selected.sourceNote}
            {selected.sourceUrl && (
              <>
                {" "}
                <a
                  className="text-primary underline"
                  href={selected.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Ver fonte
                </a>
              </>
            )}
          </p>
        </div>
      )}
    </section>
  );
}
