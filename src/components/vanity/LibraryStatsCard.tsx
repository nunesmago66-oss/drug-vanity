import { useMemo } from "react";
import { BookOpen } from "lucide-react";
import { BUILT_IN_ABBREVIATIONS, type AbbreviationRecord } from "@/lib/vanity/abbreviation-library";
import { analyzeLibrary, buildLibraryIndex } from "@/lib/vanity/global-library";

/** Library numbers, always computed from the real records. */
export function LibraryStatsCard({ custom }: { custom: AbbreviationRecord[] }) {
  const a = useMemo(
    () => analyzeLibrary(buildLibraryIndex([...BUILT_IN_ABBREVIATIONS, ...custom])),
    [custom],
  );
  const fmt = (n: number) => n.toLocaleString("pt-BR");
  const max = Math.max(1, ...a.byGroup.map(([, n]) => n));
  const tiles: Array<[string, number]> = [
    ["Total de registros", a.total],
    ["Abreviações", a.abbreviations],
    ["Códigos técnicos", a.codes],
    ["Fontes verificadas", a.verified],
    ["Não verificados", a.unverified],
    ["Siglas ambíguas", a.ambiguousCodes],
  ];
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <BookOpen className="size-5 text-primary" />
        <h2 className="font-semibold">Biblioteca Global</h2>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {tiles.map(([label, n]) => (
          <div key={label} className="rounded-xl bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{fmt(n)}</p>
          </div>
        ))}
      </div>
      <div className="space-y-1.5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Por categoria
        </p>
        {a.byGroup.map(([g, n]) => (
          <div key={g} className="flex items-center gap-2 text-sm">
            <span className="w-40 shrink-0 truncate text-xs sm:w-52">{g}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-primary"
                style={{ width: `${(n / max) * 100}%` }}
              />
            </span>
            <span className="w-14 text-right text-xs tabular-nums text-muted-foreground">
              {fmt(n)}
            </span>
          </div>
        ))}
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
          Por idioma ({a.byLanguage.length})
        </summary>
        <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
          {a.byLanguage.map(([l, n]) => (
            <li key={l} className="flex justify-between gap-2">
              <span className="truncate">{l}</span>
              <span className="tabular-nums text-muted-foreground">{fmt(n)}</span>
            </li>
          ))}
        </ul>
      </details>
      {a.duplicates > 0 && (
        <p className="text-xs text-muted-foreground">
          {fmt(a.duplicates)} registros duplicados identificados.
        </p>
      )}
    </section>
  );
}
