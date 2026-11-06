import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Plus,
  Search,
  Star,
  Trash2,
  Pencil,
  X,
  Download,
  Upload,
  FolderPlus,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "./shared";
import { downloadCsv } from "@/lib/vanity/browser";
import { toCsv } from "@/lib/vanity/check-rules";
import {
  ABBREVIATION_KINDS,
  ABBREVIATION_PACKS,
  BUILT_IN_ABBREVIATIONS,
  MAX_CUSTOM_ABBREVIATIONS,
  groupMeanings,
  type AbbreviationCategory,
  type AbbreviationKind,
  type AbbreviationRecord,
  type AbbreviationUserData,
} from "@/lib/vanity/abbreviation-library";
import {
  analyzeLibrary,
  buildLibraryIndex,
  rankedSearch,
  type LibraryGroup,
  type RecordNature,
} from "@/lib/vanity/global-library";

const CATEGORIES: AbbreviationCategory[] = [
  "Crypto & Blockchain",
  "Finance & Business",
  "Technology",
  "Internet & Social",
  "Gaming & Esports",
  "Science & Education",
  "Health",
  "Entertainment",
  "Relationships",
  "Travel & Geography",
  "Security & Privacy",
  "Portuguese Slang",
  "Spanish Slang",
  "French",
  "German",
  "Italian",
  "Chinese",
  "Russian",
  "Japanese & Korean",
  "General English",
  "Countries & Territories",
  "Languages",
  "States & Provinces",
  "Chemistry",
  "Airports & Aviation",
];
const BASE_LANGUAGES = [
  "English",
  "Portuguese",
  "Spanish",
  "French",
  "German",
  "Italian",
  "Japanese",
  "Korean",
  "Chinese",
  "Russian",
  "Latin",
  "International",
  "Other",
];
const PAGE = 200;
const normalize = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

interface Props {
  data: AbbreviationUserData;
  setData: React.Dispatch<React.SetStateAction<AbbreviationUserData>>;
  mode?: "browse" | "manage";
  initialQuery?: string;
}

export function AbbreviationLibraryTab({ data, setData, mode = "browse", initialQuery }: Props) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<LibraryGroup | "all">("all");
  const [nature, setNature] = useState<"all" | RecordNature>("all");
  useEffect(() => {
    if (initialQuery !== undefined) setQuery(initialQuery);
  }, [initialQuery]);
  const [language, setLanguage] = useState("all");
  const [region, setRegion] = useState("all");
  const [kind, setKind] = useState("all");
  const [verification, setVerification] = useState<"all" | "verified" | "unverified">("all");
  const [onlyAmbiguous, setOnlyAmbiguous] = useState(false);
  const [visible, setVisible] = useState(PAGE);
  const [scope, setScope] = useState<"all" | "favorites" | "custom" | "collection">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const [collectionName, setCollectionName] = useState("");
  const [activeCollection, setActiveCollection] = useState<string>("");
  const [editing, setEditing] = useState<AbbreviationRecord | null>(null);
  const [form, setForm] = useState({
    abbreviation: "",
    meaning: "",
    language: "English",
    category: "General English" as AbbreviationCategory,
    description: "",
    aliases: "",
    related: "",
  });
  const deferredQuery = useDeferredValue(query);
  const all = useMemo(() => [...BUILT_IN_ABBREVIATIONS, ...data.custom], [data.custom]);
  const meaningsByCode = useMemo(() => groupMeanings(all), [all]);
  const libIndex = useMemo(() => buildLibraryIndex(all), [all]);
  const indexById = useMemo(
    () => new Map(libIndex.entries.map((e) => [e.record.id, e])),
    [libIndex],
  );
  const groupCounts = useMemo(() => analyzeLibrary(libIndex).byGroup, [libIndex]);
  const LANGUAGES = useMemo(
    () =>
      [...new Set([...BASE_LANGUAGES, ...all.map((r) => r.language)])].sort((a, b) =>
        a.localeCompare(b),
      ),
    [all],
  );
  const REGIONS = useMemo(
    () => [...new Set(all.map((r) => r.region ?? "Global"))].sort((a, b) => a.localeCompare(b)),
    [all],
  );
  const meaningsOf = (r: AbbreviationRecord) =>
    meaningsByCode.get(normalize(r.abbreviation)) ?? [r];
  const filtered = useMemo(() => {
    let entries = rankedSearch(libIndex, deferredQuery);
    if (group !== "all") entries = entries.filter((e) => e.group === group);
    if (nature !== "all") entries = entries.filter((e) => e.nature === nature);
    let list = entries.map((e) => e.record);
    if (region !== "all") list = list.filter((r) => (r.region ?? "Global") === region);
    if (kind !== "all") list = list.filter((r) => (r.kind ?? "popular") === kind);
    if (verification !== "all")
      list = list.filter((r) => (r.verified === true) === (verification === "verified"));
    if (onlyAmbiguous)
      list = list.filter((r) => (meaningsByCode.get(normalize(r.abbreviation))?.length ?? 1) > 1);
    if (language !== "all") list = list.filter((r) => r.language === language);
    if (scope === "favorites") {
      const fav = new Set(data.favorites);
      list = list.filter((r) => fav.has(r.id));
    }
    if (scope === "custom") {
      const mine = new Set(data.custom.map((c) => c.id));
      list = list.filter((r) => mine.has(r.id));
    }
    if (scope === "collection" && activeCollection) {
      const ids = new Set(data.collections.find((c) => c.id === activeCollection)?.recordIds ?? []);
      list = list.filter((r) => ids.has(r.id));
    }
    return list;
  }, [
    libIndex,
    group,
    nature,
    meaningsByCode,
    region,
    kind,
    verification,
    onlyAmbiguous,
    deferredQuery,
    language,
    scope,
    data.favorites,
    data.custom,
    data.collections,
    activeCollection,
  ]);
  const activeFilters = [
    nature !== "all",
    language !== "all",
    region !== "all",
    verification !== "all",
    scope !== "all",
    onlyAmbiguous,
  ].filter(Boolean).length;
  useEffect(
    () => setVisible(PAGE),
    [
      deferredQuery,
      group,
      nature,
      language,
      region,
      kind,
      verification,
      onlyAmbiguous,
      scope,
      activeCollection,
    ],
  );
  const selected = all.find((r) => r.id === selectedId) ?? null;

  function openRecord(record: AbbreviationRecord) {
    setSelectedId(record.id);
    setData((current) => ({
      ...current,
      recent: [record.id, ...current.recent.filter((id) => id !== record.id)].slice(0, 30),
    }));
  }
  function toggleFavorite(record: AbbreviationRecord) {
    setData((current) => ({
      ...current,
      favorites: current.favorites.includes(record.id)
        ? current.favorites.filter((id) => id !== record.id)
        : [...current.favorites, record.id],
    }));
  }
  function startCreate() {
    setEditing(null);
    setForm({
      abbreviation: "",
      meaning: "",
      language: "English",
      category: "General English",
      description: "",
      aliases: "",
      related: "",
    });
    setShowForm(true);
  }
  function startEdit(record: AbbreviationRecord) {
    setEditing(record);
    setForm({
      abbreviation: record.abbreviation,
      meaning: record.meaning,
      language: record.language,
      category: record.category,
      description: record.description ?? "",
      aliases: record.aliases.join(", "),
      related: record.related.join(", "),
    });
    setShowForm(true);
  }
  function saveCustom() {
    const abbreviation = form.abbreviation.trim();
    const meaning = form.meaning.trim();
    if (!abbreviation || !meaning) {
      toast.error("Preencha a abreviação e o significado.");
      return;
    }
    if (abbreviation.length > 40 || meaning.length > 300) {
      toast.error("Abreviação ou significado muito longo.");
      return;
    }
    const duplicate = all.find(
      (r) =>
        r.id !== editing?.id &&
        normalize(r.abbreviation) === normalize(abbreviation) &&
        normalize(r.meaning) === normalize(meaning),
    );
    if (duplicate) {
      toast.error("Essa abreviação com esse significado já existe.");
      return;
    }
    const id =
      editing?.id ??
      `custom-${normalize(abbreviation).replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`;
    const record: AbbreviationRecord = {
      id,
      abbreviation,
      meaning,
      language: form.language,
      category: form.category,
      description: form.description.trim(),
      aliases: form.aliases
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      related: form.related
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      sourceNote: "Registro personalizado pelo usuário.",
    };
    setData((current) => ({
      ...current,
      custom: editing
        ? current.custom.map((r) => (r.id === id ? record : r))
        : [...current.custom, record],
    }));
    setShowForm(false);
    setSelectedId(id);
    toast.success(editing ? "Registro atualizado" : "Abreviação adicionada");
  }
  function removeCustom(record: AbbreviationRecord) {
    setData((current) => ({
      ...current,
      custom: current.custom.filter((r) => r.id !== record.id),
      favorites: current.favorites.filter((id) => id !== record.id),
      recent: current.recent.filter((id) => id !== record.id),
    }));
    if (selectedId === record.id) setSelectedId(null);
    toast.success("Registro personalizado removido");
  }
  function createCollection() {
    const name = collectionName.trim();
    if (!name) {
      toast.error("Digite um nome para a coleção.");
      return;
    }
    const id = `collection-${Date.now().toString(36)}`;
    setData((current) => ({
      ...current,
      collections: [...current.collections, { id, name: name.slice(0, 60), recordIds: [] }],
    }));
    setActiveCollection(id);
    setScope("collection");
    setCollectionName("");
    toast.success("Coleção criada");
  }
  function addSelectedToCollection() {
    if (!selected || !activeCollection) {
      toast.error("Selecione uma coleção e uma abreviação.");
      return;
    }
    setData((current) => ({
      ...current,
      collections: current.collections.map((c) =>
        c.id === activeCollection
          ? { ...c, recordIds: [...new Set([...c.recordIds, selected.id])] }
          : c,
      ),
    }));
    toast.success("Adicionada à coleção");
  }
  async function importCsv(file?: File) {
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024) {
        toast.error("CSV maior que 10 MB.");
        return;
      }
      const text = await file.text();
      const parse = (input: string) => {
        const rows: string[][] = [];
        let row: string[] = [];
        let field = "";
        let quoted = false;
        for (let i = 0; i < input.length; i++) {
          const ch = input[i];
          if (ch === '"' && quoted && input[i + 1] === '"') {
            field += '"';
            i++;
          } else if (ch === '"') quoted = !quoted;
          else if (ch === "," && !quoted) {
            row.push(field);
            field = "";
          } else if ((ch === "\n" || ch === "\r") && !quoted) {
            if (ch === "\r" && input[i + 1] === "\n") i++;
            row.push(field);
            if (row.some((v) => v.trim())) rows.push(row);
            row = [];
            field = "";
          } else field += ch;
        }
        row.push(field);
        if (row.some((v) => v.trim())) rows.push(row);
        return rows;
      };
      const rows = parse(text);
      const header = (rows.shift() ?? []).map((v) => normalize(v));
      const index = (name: string) => header.indexOf(name);
      const existing = new Set(
        [...BUILT_IN_ABBREVIATIONS, ...data.custom].map(
          (r) => `${normalize(r.abbreviation)}|${normalize(r.meaning)}`,
        ),
      );
      const imported: AbbreviationRecord[] = [];
      for (const row of rows.slice(0, MAX_CUSTOM_ABBREVIATIONS)) {
        const get = (name: string) => {
          const i = index(name);
          return i >= 0 ? (row[i] ?? "").trim() : "";
        };
        const abbreviation = get("abbreviation");
        const meaning = get("meaning");
        if (!abbreviation || !meaning || abbreviation.length > 40 || meaning.length > 300) continue;
        const key = `${normalize(abbreviation)}|${normalize(meaning)}`;
        if (existing.has(key)) continue;
        existing.add(key);
        const lang = get("language") || "Other";
        const cat = CATEGORIES.includes(get("category") as AbbreviationCategory)
          ? (get("category") as AbbreviationCategory)
          : "General English";
        imported.push({
          id: `import-${normalize(abbreviation).replace(/[^a-z0-9]+/g, "-")}-${normalize(meaning)
            .replace(/[^a-z0-9]+/g, "-")
            .slice(0, 24)}`,
          abbreviation,
          meaning,
          language: lang,
          category: cat,
          description: get("description"),
          aliases: get("aliases")
            .split(";")
            .map((v) => v.trim())
            .filter(Boolean),
          related: get("related")
            .split(";")
            .map((v) => v.trim())
            .filter(Boolean),
          sourceNote: get("source") || "Importado pelo usuário.",
          ...(get("region") ? { region: get("region").slice(0, 60) } : {}),
          ...(get("kind") in ABBREVIATION_KINDS ? { kind: get("kind") as AbbreviationKind } : {}),
          ...(/^https?:\/\//.test(get("source_url"))
            ? { sourceUrl: get("source_url").slice(0, 300) }
            : {}),
        });
      }
      const accepted = imported.slice(
        0,
        Math.max(0, MAX_CUSTOM_ABBREVIATIONS - data.custom.length),
      );
      setData((current) => ({ ...current, custom: [...current.custom, ...accepted] }));
      toast.success(`${accepted.length.toLocaleString("pt-BR")} registros novos importados`);
    } catch {
      toast.error("Não foi possível importar o CSV. Confira o formato do arquivo.");
    }
    if (importRef.current) importRef.current.value = "";
  }
  function exportLibrary() {
    downloadCsv(
      "drug-url-abbreviation-library.csv",
      toCsv(
        [
          "abbreviation",
          "meaning",
          "language",
          "category",
          "description",
          "aliases",
          "related",
          "source",
          "region",
          "kind",
          "verified",
          "source_url",
        ],
        filtered.map((r) => [
          r.abbreviation,
          r.meaning,
          r.language,
          r.category,
          r.description ?? "",
          r.aliases.join("; "),
          r.related.join("; "),
          r.sourceNote,
          r.region ?? "Global",
          r.kind ?? "popular",
          r.verified ? "yes" : "no",
          r.sourceUrl ?? "",
        ]),
      ),
    );
  }

  return (
    <div className="space-y-4">
      {mode === "manage" ? (
        <section className="space-y-3 rounded-xl border bg-card p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <BookOpen className="size-5 text-primary" />
            <h2 className="font-semibold">Dados da biblioteca</h2>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {all.length.toLocaleString("pt-BR")} registros no total (
            {BUILT_IN_ABBREVIATIONS.length.toLocaleString("pt-BR")} incluídos,{" "}
            {data.custom.length.toLocaleString("pt-BR")} seus). Registros de padrões oficiais (ISO,
            IATA, IUPAC) são verificados; gírias da curadoria aparecem como “não verificado”.
          </p>
          <details className="rounded-lg bg-muted/30 p-3 text-xs">
            <summary className="cursor-pointer font-medium">
              Pacotes e fontes ({ABBREVIATION_PACKS.length})
            </summary>
            <ul className="mt-2 space-y-1.5">
              {ABBREVIATION_PACKS.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium">{p.name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {p.count.toLocaleString("pt-BR")}
                  </span>
                  <Badge variant={p.verified ? "secondary" : "outline"} className="text-[10px]">
                    {p.verified ? "verificado" : "não verificado"}
                  </Badge>
                  {p.sourceUrl ? (
                    <a
                      className="text-primary underline"
                      href={p.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {p.source}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">{p.source}</span>
                  )}
                </li>
              ))}
            </ul>
          </details>
          <div className="flex flex-wrap gap-2">
            <input
              ref={importRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => void importCsv(e.target.files?.[0])}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-9"
              onClick={() => importRef.current?.click()}
            >
              <Upload className="mr-1 size-4" /> Importar
            </Button>
            <Button size="sm" variant="outline" className="h-9" onClick={exportLibrary}>
              <Download className="mr-1 size-4" /> CSV
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            CSV com colunas abbreviation, meaning, language, category, description, aliases,
            related. Até {MAX_CUSTOM_ABBREVIATIONS.toLocaleString("pt-BR")} registros próprios.
          </p>
          <div className="space-y-2 rounded-lg bg-muted/30 p-3">
            <p className="text-sm font-medium">Coleções e favoritos</p>
            <p className="text-xs text-muted-foreground">
              {data.favorites.length.toLocaleString("pt-BR")} favoritos · {data.collections.length}{" "}
              coleções
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <FolderPlus className="size-4 text-muted-foreground" />
              <Input
                aria-label="Nome da nova coleção"
                className="h-9 min-w-0 flex-1"
                value={collectionName}
                onChange={(e) => setCollectionName(e.target.value)}
                placeholder="Nova coleção..."
              />
              <Button size="sm" variant="outline" className="h-9" onClick={createCollection}>
                Criar
              </Button>
            </div>
            {data.collections.length > 0 && (
              <ul className="space-y-1">
                {data.collections.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                    <span>
                      {c.name}{" "}
                      <span className="text-xs text-muted-foreground">({c.recordIds.length})</span>
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8"
                      onClick={() =>
                        setData((cur) => ({
                          ...cur,
                          collections: cur.collections.filter((x) => x.id !== c.id),
                        }))
                      }
                    >
                      Excluir
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {data.favorites.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8"
                onClick={() => setData((cur) => ({ ...cur, favorites: [] }))}
              >
                Limpar favoritos
              </Button>
            )}
          </div>
        </section>
      ) : (
        <section className="space-y-3 rounded-2xl border bg-card p-3 shadow-sm sm:p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              inputMode="search"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-12 rounded-xl pl-11 text-base"
              placeholder="Pesquisar código, sigla ou significado…"
              aria-label="Pesquisar na Biblioteca Global"
            />
          </div>
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            <Button
              size="sm"
              variant={group === "all" ? "default" : "outline"}
              className="h-8 shrink-0 rounded-full"
              onClick={() => setGroup("all")}
            >
              Tudo
            </Button>
            {groupCounts.map(([g, n]) => (
              <Button
                key={g}
                size="sm"
                variant={group === g ? "default" : "outline"}
                className="h-8 shrink-0 rounded-full"
                onClick={() => setGroup(g)}
              >
                {g}{" "}
                <span className="ml-1 tabular-nums opacity-60">{n.toLocaleString("pt-BR")}</span>
              </Button>
            ))}
          </div>
          <details className="rounded-lg bg-muted/30 p-2 text-sm">
            <summary className="cursor-pointer px-1 py-1 text-xs font-medium text-muted-foreground">
              Filtros avançados{activeFilters > 0 ? ` (${activeFilters})` : ""}
            </summary>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Natureza</Label>
                <NativeSelect
                  aria-label="Natureza"
                  className="h-10"
                  value={nature}
                  onChange={(e) => setNature(e.target.value as typeof nature)}
                >
                  <option value="all">Todas</option>
                  <option value="abbreviation">Abreviações linguísticas</option>
                  <option value="code">Códigos técnicos</option>
                </NativeSelect>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Idioma</Label>
                <NativeSelect
                  className="h-10"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  <option value="all">Todos os idiomas</option>
                  {LANGUAGES.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Região</Label>
                <NativeSelect
                  aria-label="Região"
                  className="h-10"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                >
                  <option value="all">Todas as regiões</option>
                  {REGIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Fonte</Label>
                <NativeSelect
                  aria-label="Fonte"
                  className="h-10"
                  value={verification}
                  onChange={(e) => setVerification(e.target.value as typeof verification)}
                >
                  <option value="all">Todas</option>
                  <option value="verified">Verificadas</option>
                  <option value="unverified">Não verificadas</option>
                </NativeSelect>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Mostrar</Label>
                <NativeSelect
                  aria-label="Mostrar"
                  className="h-10"
                  value={scope}
                  onChange={(e) => setScope(e.target.value as typeof scope)}
                >
                  <option value="all">Todos</option>
                  <option value="favorites">Favoritos ({data.favorites.length})</option>
                  <option value="custom">Meus registros</option>
                  {data.collections.length > 0 && <option value="collection">Coleção</option>}
                </NativeSelect>
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  size="sm"
                  variant={onlyAmbiguous ? "default" : "outline"}
                  className="h-10 w-full"
                  onClick={() => setOnlyAmbiguous((v) => !v)}
                >
                  Só ambíguas
                </Button>
              </div>
            </div>
            {scope === "collection" && (
              <div className="mt-2 flex flex-wrap gap-2">
                {data.collections.length > 0 && (
                  <NativeSelect
                    className="h-9 min-w-0 flex-1 sm:max-w-56"
                    value={activeCollection}
                    onChange={(e) => {
                      setActiveCollection(e.target.value);
                      if (e.target.value) setScope("collection");
                    }}
                  >
                    <option value="">Selecionar coleção</option>
                    {data.collections.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.recordIds.length})
                      </option>
                    ))}
                  </NativeSelect>
                )}
                {activeCollection && (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-9"
                      onClick={addSelectedToCollection}
                      disabled={!selected}
                    >
                      Adicionar selecionada
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-9"
                      onClick={() => {
                        setData((current) => ({
                          ...current,
                          collections: current.collections.filter((c) => c.id !== activeCollection),
                        }));
                        setActiveCollection("");
                        setScope("all");
                      }}
                    >
                      Excluir coleção
                    </Button>
                  </>
                )}
              </div>
            )}
          </details>
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{filtered.length.toLocaleString("pt-BR")} resultados</span>
            <Button size="sm" variant="ghost" className="h-8" onClick={startCreate}>
              <Plus className="mr-1 size-4" /> Adicionar registro
            </Button>
          </div>
          <div className="max-h-[60vh] space-y-1 overflow-y-auto overscroll-contain">
            {filtered.slice(0, visible).map((record) => (
              <div
                key={record.id}
                className={`flex items-center gap-2 rounded-lg border p-3 ${selectedId === record.id ? "border-primary bg-accent/40" : "border-transparent bg-muted/30"}`}
              >
                <button
                  type="button"
                  onClick={() => openRecord(record)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <strong className="font-mono text-sm tracking-wide">
                      {record.abbreviation}
                    </strong>
                    <span className="text-sm text-muted-foreground">{record.meaning}</span>
                    {meaningsOf(record).length > 1 && (
                      <Badge variant="outline" className="text-[10px]">
                        {meaningsOf(record).length} significados
                      </Badge>
                    )}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    <Badge variant="secondary" className="text-[10px]">
                      {indexById.get(record.id)?.group ?? "Não classificado"}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {indexById.get(record.id)?.nature === "code"
                        ? "Código técnico"
                        : "Abreviação"}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {record.region && record.region !== "Global"
                        ? record.region
                        : record.language}
                    </Badge>
                    {record.verified && (
                      <Badge
                        variant="outline"
                        className="border-primary/40 text-[10px] text-primary"
                      >
                        verificado
                      </Badge>
                    )}
                    {data.custom.some((c) => c.id === record.id) && (
                      <Badge className="text-[10px]">Personalizado</Badge>
                    )}
                  </span>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9 shrink-0"
                  aria-label={
                    data.favorites.includes(record.id)
                      ? "Remover dos favoritos"
                      : "Adicionar aos favoritos"
                  }
                  onClick={() => toggleFavorite(record)}
                >
                  <Star
                    className={`size-4 ${data.favorites.includes(record.id) ? "fill-amber-400 text-amber-500" : ""}`}
                  />
                </Button>
              </div>
            ))}
            {filtered.length > visible && (
              <div className="p-3 text-center">
                <p className="mb-2 text-xs text-muted-foreground">
                  Mostrando {visible.toLocaleString("pt-BR")} de{" "}
                  {filtered.length.toLocaleString("pt-BR")}
                </p>
                <Button size="sm" variant="outline" onClick={() => setVisible((v) => v + PAGE)}>
                  Mostrar mais
                </Button>
              </div>
            )}
            {filtered.length === 0 && (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                Nenhuma abreviação encontrada com esses filtros.
              </div>
            )}
          </div>
        </section>
      )}

      {mode === "browse" && selected && (
        <section className="space-y-3 rounded-xl border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-2xl font-bold">{selected.abbreviation}</p>
              <h3 className="text-lg font-semibold">{selected.meaning}</h3>
              <div className="mt-1 flex flex-wrap gap-1">
                <Badge variant="secondary">
                  {indexById.get(selected.id)?.group ?? "Não classificado"}
                </Badge>
                <Badge variant="outline">
                  {indexById.get(selected.id)?.nature === "code"
                    ? "Código técnico"
                    : "Abreviação linguística"}
                </Badge>
                <Badge variant="outline">{selected.language}</Badge>
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
          {selected.related.length > 0 && (
            <p className="text-sm">
              <strong>Abreviações relacionadas:</strong> {selected.related.join(", ")}
            </p>
          )}
          <div className="flex flex-wrap gap-1">
            <Badge variant="outline">{selected.region ?? "Global"}</Badge>
            <Badge variant="outline">{ABBREVIATION_KINDS[selected.kind ?? "popular"]}</Badge>
            <Badge variant={selected.verified ? "secondary" : "outline"}>
              {selected.verified ? "Verificado" : "Não verificado"}
            </Badge>
          </div>
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
          {meaningsOf(selected).length > 1 && (
            <div className="rounded-lg bg-muted/30 p-3">
              <p className="mb-2 text-sm font-semibold">
                Todos os significados de {selected.abbreviation} ({meaningsOf(selected).length})
              </p>
              <ul className="space-y-1">
                {meaningsOf(selected).map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => openRecord(m)}
                      className={`text-left text-sm ${m.id === selected.id ? "font-semibold" : "text-muted-foreground underline-offset-2 hover:underline"}`}
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
          {activeCollection && (
            <Button size="sm" variant="outline" onClick={addSelectedToCollection}>
              <FolderPlus className="mr-1 size-4" /> Adicionar à coleção
            </Button>
          )}
          {data.custom.some((c) => c.id === selected.id) && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => startEdit(selected)}>
                <Pencil className="mr-1 size-4" /> Editar
              </Button>
              <Button size="sm" variant="destructive" onClick={() => removeCustom(selected)}>
                <Trash2 className="mr-1 size-4" /> Excluir
              </Button>
            </div>
          )}
        </section>
      )}

      {mode === "browse" && data.recent.length > 0 && (
        <section className="rounded-xl border bg-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Consultados recentemente</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setData((c) => ({ ...c, recent: [] }))}
            >
              Limpar
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.recent
              .map((id) => all.find((r) => r.id === id))
              .filter((r): r is AbbreviationRecord => !!r)
              .map((r) => (
                <Button
                  key={r.id}
                  size="sm"
                  variant="outline"
                  onClick={() => openRecord(r)}
                  className="font-mono"
                >
                  {r.abbreviation}
                </Button>
              ))}
          </div>
        </section>
      )}

      {showForm && (
        <section className="space-y-3 rounded-xl border border-primary/40 bg-card p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{editing ? "Editar abreviação" : "Nova abreviação"}</h3>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setShowForm(false)}
              aria-label="Fechar formulário"
            >
              <X className="size-4" />
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Abreviação</Label>
              <Input
                maxLength={40}
                value={form.abbreviation}
                onChange={(e) => setForm((f) => ({ ...f, abbreviation: e.target.value }))}
                placeholder="Ex.: BTC"
              />
            </div>
            <div className="space-y-1">
              <Label>Significado</Label>
              <Input
                maxLength={300}
                value={form.meaning}
                onChange={(e) => setForm((f) => ({ ...f, meaning: e.target.value }))}
                placeholder="Ex.: Bitcoin"
              />
            </div>
            <div className="space-y-1">
              <Label>Idioma</Label>
              <NativeSelect
                className="h-10"
                value={form.language}
                onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}
              >
                {LANGUAGES.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <Label>Categoria</Label>
              <NativeSelect
                className="h-10"
                value={form.category}
                onChange={(e) =>
                  setForm((f) => ({ ...f, category: e.target.value as AbbreviationCategory }))
                }
              >
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Descrição (opcional)</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Contexto e uso"
              />
            </div>
            <div className="space-y-1">
              <Label>Sinônimos / aliases</Label>
              <Input
                value={form.aliases}
                onChange={(e) => setForm((f) => ({ ...f, aliases: e.target.value }))}
                placeholder="Separados por vírgula"
              />
            </div>
            <div className="space-y-1">
              <Label>Relacionadas</Label>
              <Input
                value={form.related}
                onChange={(e) => setForm((f) => ({ ...f, related: e.target.value }))}
                placeholder="Ex.: ETH, SOL"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={saveCustom}>Salvar registro</Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
