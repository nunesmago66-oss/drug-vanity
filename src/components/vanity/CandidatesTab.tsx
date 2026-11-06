import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  SearchX,
  Star,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { copyText, downloadCsv, inviteLabel, inviteUrl } from "@/lib/vanity/browser";
import { CATEGORIES, DEFAULT_CATALOG, KIND_LABEL, type CatalogEntry } from "@/lib/vanity/catalog";
import { toCsv } from "@/lib/vanity/check-rules";
import { matchesSearch } from "@/lib/vanity/search";
import {
  BUILT_IN_ABBREVIATIONS,
  findMatchingAbbreviationCodes,
  normalizeAbbreviationCode,
  type AbbreviationRecord,
} from "@/lib/vanity/abbreviation-library";
import { statusLabelOf, statusOf, type ResultsMap } from "@/lib/vanity/scanner";
import { cn } from "@/lib/utils";

import { EntryDialog } from "./EntryDialog";
import { EmptyState, NOT_FOUND_WARNING, NativeSelect, StatusBadge } from "./shared";

interface Props {
  entries: CatalogEntry[];
  setEntries: React.Dispatch<React.SetStateAction<CatalogEntry[]>>;
  selected: string[];
  setSelected: React.Dispatch<React.SetStateAction<string[]>>;
  lastStatus: ResultsMap;
  onGoVerify: () => void;
  abbreviationRecords?: AbbreviationRecord[];
}

export function CandidatesTab({
  entries,
  setEntries,
  selected,
  setSelected,
  lastStatus,
  onGoVerify,
  abbreviationRecords = BUILT_IN_ABBREVIATIONS,
}: Props) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const deferredLastStatus = useDeferredValue(lastStatus);
  const [length, setLength] = useState<"all" | "2" | "3">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "unverified" | "e" | "n" | "x">("all");
  const [limit, setLimit] = useState(100);
  const [category, setCategory] = useState<string>("all");
  const [sort, setSort] = useState<"asc" | "desc" | "recent">("asc");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogEntry | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CatalogEntry | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const matchingAbbreviationCodes = useMemo(
    () => findMatchingAbbreviationCodes(deferredQuery, abbreviationRecords),
    [deferredQuery, abbreviationRecords],
  );
  const visible = useMemo(() => {
    const list = entries.filter((e) => {
      if (length !== "all" && e.code.length !== Number(length)) return false;
      if (category !== "all" && e.category !== category) return false;
      if (onlyFavorites && !e.favorite) return false;
      const result = deferredLastStatus[e.code];
      if (statusFilter === "unverified" && result) return false;
      if (statusFilter !== "all" && statusFilter !== "unverified" && result?.[0] !== statusFilter)
        return false;
      if (
        !matchesSearch(deferredQuery, e.code, e.meaning, e.category) &&
        !matchingAbbreviationCodes.has(normalizeAbbreviationCode(e.code))
      )
        return false;
      return true;
    });
    if (sort === "recent") {
      list.sort(
        (a, b) =>
          (deferredLastStatus[b.code]?.[2] ?? 0) - (deferredLastStatus[a.code]?.[2] ?? 0) ||
          a.code.localeCompare(b.code, "pt-BR"),
      );
    } else {
      list.sort((a, b) => a.code.localeCompare(b.code, "pt-BR"));
      if (sort === "desc") list.reverse();
    }
    return list;
  }, [
    entries,
    deferredQuery,
    length,
    category,
    sort,
    onlyFavorites,
    statusFilter,
    deferredLastStatus,
    matchingAbbreviationCodes,
  ]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const statusCounts = useMemo(() => {
    const counts = { unverified: 0, e: 0, n: 0, x: 0 };
    for (const entry of entries) {
      const result = deferredLastStatus[entry.code];
      if (!result) counts.unverified++;
      else counts[result[0]]++;
    }
    return counts;
  }, [entries, deferredLastStatus]);
  const filtersActive =
    query || length !== "all" || category !== "all" || onlyFavorites || statusFilter !== "all";

  const update = (code: string, patch: Partial<CatalogEntry>) =>
    setEntries((list) => list.map((e) => (e.code === code ? { ...e, ...patch } : e)));

  const toggleSelected = (code: string) =>
    setSelected((s) => (s.includes(code) ? s.filter((c) => c !== code) : [...s, code]));

  async function handleCopy(code: string) {
    const ok = await copyText(inviteLabel(code));
    if (ok) toast.success(`Copiado: ${inviteLabel(code)}`);
    else toast.error("Não foi possível copiar. Copie manualmente: " + inviteLabel(code));
  }

  function handleSave(entry: CatalogEntry) {
    if (editing) {
      update(entry.code, entry);
      toast.success(`“${entry.code}” atualizado`);
    } else {
      setEntries((list) => [...list, entry]);
      toast.success(`“${entry.code}” adicionado ao catálogo`);
    }
  }

  function exportCatalog() {
    const rows = visible.map((e) => {
      const st = lastStatus[e.code];
      return [
        e.code,
        inviteLabel(e.code),
        e.meaning,
        KIND_LABEL[e.kind],
        e.category,
        e.code.length,
        e.favorite ? "sim" : "não",
        st ? statusLabelOf(st) : "não verificado",
        st ? new Date(st[2] * 1000).toISOString() : "",
        st?.[0] === "n" ? NOT_FOUND_WARNING : "",
      ];
    });
    downloadCsv(
      "vanity-catalogo.csv",
      toCsv(
        [
          "codigo",
          "link",
          "significado",
          "tipo_significado",
          "categoria",
          "tamanho",
          "favorito",
          "status_convite",
          "verificado_em",
          "aviso",
        ],
        rows,
      ),
    );
  }

  return (
    <div className="space-y-4">
      <section aria-label="Filtros" className="space-y-3 rounded-lg border bg-card p-3 sm:p-4">
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
              setLimit(100);
            }}
            placeholder="Buscar código ou significado"
            aria-label="Buscar código ou significado"
            autoCapitalize="none"
            autoCorrect="off"
            className="h-11 pl-9 text-base sm:text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="f-length" className="text-xs text-muted-foreground">
              Tamanho
            </Label>
            <NativeSelect
              id="f-length"
              value={length}
              className="h-11"
              onChange={(e) => {
                setLength(e.target.value as typeof length);
                setLimit(100);
              }}
            >
              <option value="all">Todos</option>
              <option value="2">2 letras</option>
              <option value="3">3 letras</option>
            </NativeSelect>
          </div>
          <div className="space-y-1">
            <Label htmlFor="f-cat" className="text-xs text-muted-foreground">
              Categoria
            </Label>
            <NativeSelect
              id="f-cat"
              className="h-11"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setLimit(100);
              }}
            >
              <option value="all">Todas</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1">
            <Label htmlFor="f-sort" className="text-xs text-muted-foreground">
              Ordem
            </Label>
            <NativeSelect
              id="f-sort"
              className="h-11"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as typeof sort);
                setLimit(100);
              }}
            >
              <option value="asc">A → Z</option>
              <option value="desc">Z → A</option>
              <option value="recent">Verificados recentemente</option>
            </NativeSelect>
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="f-status" className="text-xs text-muted-foreground">
            Status da verificação
          </Label>
          <NativeSelect
            id="f-status"
            className="h-11"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as typeof statusFilter);
              setLimit(100);
            }}
          >
            <option value="all">Todos os status</option>
            <option value="unverified">
              Nunca verificados ({statusCounts.unverified.toLocaleString("pt-BR")})
            </option>
            <option value="e">Com convite ativo ({statusCounts.e.toLocaleString("pt-BR")})</option>
            <option value="n">Sem convite ativo ({statusCounts.n.toLocaleString("pt-BR")})</option>
            <option value="x">
              Erros / inconclusivos ({statusCounts.x.toLocaleString("pt-BR")})
            </option>
          </NativeSelect>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={onlyFavorites ? "default" : "outline"}
            size="sm"
            aria-pressed={onlyFavorites}
            onClick={() => {
              setOnlyFavorites((v) => !v);
              setLimit(100);
            }}
            className="h-9"
          >
            <Star className={cn(onlyFavorites && "fill-current")} aria-hidden />
            Só favoritos
          </Button>
          {filtersActive && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9"
              onClick={() => {
                setQuery("");
                setLength("all");
                setStatusFilter("all");
                setCategory("all");
                setOnlyFavorites(false);
                setSort("asc");
                setLimit(100);
              }}
            >
              Limpar filtros
            </Button>
          )}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
          className="h-10"
        >
          <Plus aria-hidden /> Adicionar
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-10"
          onClick={exportCatalog}
          disabled={visible.length === 0}
        >
          <Download aria-hidden /> CSV
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-10"
          onClick={() => setConfirmReset(true)}
        >
          <RotateCcw aria-hidden /> Restaurar padrão
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-muted-foreground" aria-live="polite">
          {visible.length.toLocaleString("pt-BR")} de {entries.length.toLocaleString("pt-BR")}{" "}
          códigos · {selected.length.toLocaleString("pt-BR")} selecionado(s)
        </p>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={visible.length === 0}
            onClick={() =>
              setSelected((s) => Array.from(new Set([...s, ...visible.map((v) => v.code)])))
            }
          >
            Selecionar visíveis
          </Button>
          {selected.length > 0 && (
            <>
              <Button type="button" variant="ghost" size="sm" onClick={() => setSelected([])}>
                Limpar seleção
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={onGoVerify}>
                Escanear ({selected.length})
              </Button>
            </>
          )}
        </div>
      </div>

      {entries.length === 0 ? (
        <EmptyState icon={SearchX} title="Catálogo vazio">
          Adicione códigos manualmente ou toque em “Restaurar padrão”.
        </EmptyState>
      ) : visible.length === 0 ? (
        <EmptyState icon={SearchX} title="Nenhum código corresponde aos filtros">
          Ajuste a busca ou limpe os filtros.
        </EmptyState>
      ) : (
        <ul className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
          {visible.slice(0, limit).map((e) => {
            const st = lastStatus[e.code];
            const isSel = selectedSet.has(e.code);
            return (
              <li
                key={e.code}
                className={cn(
                  "rounded-lg border bg-card p-3 transition-colors",
                  isSel && "border-primary/50 bg-accent",
                )}
              >
                <div className="flex items-start gap-3">
                  <span className="min-w-[3.5rem] rounded-md bg-muted px-2 py-1 text-center font-mono text-xl font-semibold">
                    {e.code}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm", !e.meaning && "italic text-muted-foreground")}>
                      {e.meaning || "Sem significado definido"}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <Badge variant="muted">{e.category}</Badge>
                      <Badge variant="outline" className="font-normal">
                        {KIND_LABEL[e.kind]}
                      </Badge>
                      {st && <StatusBadge status={statusOf(st)} />}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-10 shrink-0"
                    aria-label={
                      e.favorite ? `Remover ${e.code} dos favoritos` : `Favoritar ${e.code}`
                    }
                    aria-pressed={!!e.favorite}
                    onClick={() => update(e.code, { favorite: !e.favorite })}
                  >
                    <Star
                      className={cn(
                        e.favorite ? "fill-favorite text-favorite" : "text-muted-foreground",
                      )}
                      aria-hidden
                    />
                  </Button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1 border-t pt-2">
                  <Button
                    type="button"
                    variant={isSel ? "default" : "outline"}
                    size="sm"
                    className="h-9"
                    aria-pressed={isSel}
                    onClick={() => toggleSelected(e.code)}
                  >
                    {isSel && <Check aria-hidden />}
                    {isSel ? "Selecionado" : "Selecionar"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-9"
                    aria-label={`Copiar ${inviteLabel(e.code)}`}
                    onClick={() => handleCopy(e.code)}
                  >
                    <Copy aria-hidden />
                  </Button>
                  <Button asChild variant="ghost" size="icon" className="size-9">
                    <a
                      href={inviteUrl(e.code)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Abrir ${inviteLabel(e.code)} em nova aba`}
                    >
                      <ExternalLink aria-hidden />
                    </a>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-9"
                    aria-label={`Editar significado de ${e.code}`}
                    onClick={() => {
                      setEditing(e);
                      setDialogOpen(true);
                    }}
                  >
                    <Pencil aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="ml-auto size-9 text-destructive hover:text-destructive"
                    aria-label={`Remover ${e.code}`}
                    onClick={() => setPendingDelete(e)}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {visible.length > limit && (
        <Button
          type="button"
          variant="outline"
          className="h-12 w-full"
          onClick={() => setLimit((n) => n + 100)}
        >
          Mostrar mais ({(visible.length - limit).toLocaleString("pt-BR")} restantes)
        </Button>
      )}

      <EntryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        existingCodes={entries.map((e) => e.code)}
        onSave={handleSave}
      />

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover “{pendingDelete?.code}”?</AlertDialogTitle>
            <AlertDialogDescription>
              O código sai do catálogo e da seleção. O histórico de verificações é mantido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingDelete) return;
                const code = pendingDelete.code;
                setEntries((list) => list.filter((x) => x.code !== code));
                setSelected((s) => s.filter((c) => c !== code));
                toast.success(`“${code}” removido`);
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurar catálogo padrão?</AlertDialogTitle>
            <AlertDialogDescription>
              Códigos adicionados, edições e favoritos serão substituídos pela lista original.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setEntries(DEFAULT_CATALOG);
                setSelected([]);
                toast.success("Catálogo restaurado");
              }}
            >
              Restaurar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
