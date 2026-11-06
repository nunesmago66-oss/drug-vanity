import { Download, Upload } from "lucide-react";
import { useRef, useState, type Dispatch, type SetStateAction } from "react";
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
import {
  buildBackup,
  MAX_BACKUP_BYTES,
  mergeCatalog,
  mergeResults,
  mergeSelected,
  parseBackup,
  summarizeBackup,
  type BackupData,
  type ParsedBackup,
} from "@/lib/vanity/backup";
import type { CatalogEntry } from "@/lib/vanity/catalog";
import {
  mergeAbbreviationUserData,
  type AbbreviationUserData,
} from "@/lib/vanity/abbreviation-library";
import type { ResultsMap, ScannerConfig } from "@/lib/vanity/scanner";
import { mergeStats, type StatsLog } from "@/lib/vanity/stats";
import type { MeaningFilters } from "./MeaningSuggestions";

type Setter<T> = Dispatch<SetStateAction<T>>;

interface Props {
  data: BackupData;
  defaults: BackupData;
  busy: boolean;
  setResults: Setter<ResultsMap>;
  setMeaningResults: Setter<ResultsMap>;
  setEntries: Setter<CatalogEntry[]>;
  setSelected: Setter<string[]>;
  setConfig: Setter<ScannerConfig>;
  setMeaningConfig: Setter<ScannerConfig>;
  setMeaningFilters: Setter<MeaningFilters>;
  setStats: Setter<StatsLog>;
  setAbbreviations: Setter<AbbreviationUserData>;
}

const fmt = (n: number) => n.toLocaleString("pt-BR");

export function BackupPanel(props: Props) {
  const { data, defaults, busy } = props;
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<ParsedBackup | null>(null);
  const current = summarizeBackup(data);

  const exportBackup = () => {
    try {
      const blob = new Blob([buildBackup(data)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `drug-url-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      toast.success("Backup baixado");
    } catch {
      toast.error("Não foi possível gerar o backup neste navegador.");
    }
  };

  const onFile = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) {
      toast.error("Arquivo grande demais para ser um backup do DRUG URL.");
      return;
    }
    try {
      setPending(parseBackup(await file.text(), defaults));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível ler o arquivo.");
    }
  };

  const apply = () => {
    if (!pending) return;
    const d = pending.data;
    if (d.results) props.setResults((cur) => mergeResults(cur, d.results!));
    if (d.meaningResults) props.setMeaningResults((cur) => mergeResults(cur, d.meaningResults!));
    if (d.catalog) props.setEntries((cur) => mergeCatalog(cur, d.catalog!));
    if (d.selected) props.setSelected((cur) => mergeSelected(cur, d.selected!));
    if (d.stats) props.setStats((cur) => mergeStats(cur, d.stats!));
    if (d.abbreviations)
      props.setAbbreviations((cur) => mergeAbbreviationUserData(cur, d.abbreviations!));
    if (d.config) props.setConfig(d.config);
    if (d.meaningConfig) props.setMeaningConfig(d.meaningConfig);
    if (d.meaningFilters) props.setMeaningFilters(d.meaningFilters as unknown as MeaningFilters);
    toast.success("Backup restaurado e combinado com os dados deste aparelho");
    setPending(null);
  };

  const incoming = pending ? summarizeBackup(pending.data) : null;

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <div>
        <h2 className="font-semibold">Backup e restauração</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Seus dados ficam só neste aparelho. Baixe um backup para guardar ou levar para outro
          navegador.
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        {[
          ["Resultados", current.results],
          ["Com significado", current.meaningResults],
          ["Catálogo", current.catalog],
          ["Favoritos", current.favorites],
          ["Abreviações próprias", current.abbreviations],
          ["Favoritos da biblioteca", current.abbreviationFavorites],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border bg-background/40 p-2">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="font-mono text-lg">{fmt(Number(value))}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button className="h-11" onClick={exportBackup}>
          <Download aria-hidden /> Baixar backup
        </Button>
        <Button
          variant="outline"
          className="h-11"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          <Upload aria-hidden /> Restaurar backup
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="sr-only"
          aria-label="Arquivo de backup"
          tabIndex={-1}
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {busy
          ? "Pause a verificação para restaurar um backup."
          : "Restaurar combina o backup com os dados atuais: nada é apagado e, para o mesmo código, vale a verificação mais recente. A espera de limite de taxa deste aparelho não é alterada."}
      </p>

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurar este backup?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left text-sm">
                {pending?.createdAt && (
                  <p>Criado em {new Date(pending.createdAt).toLocaleString("pt-BR")}.</p>
                )}
                {incoming && (
                  <ul className="list-disc pl-5">
                    <li>{fmt(incoming.results)} resultados (todas as combinações)</li>
                    <li>{fmt(incoming.meaningResults)} resultados com significado</li>
                    <li>
                      {fmt(incoming.catalog)} códigos no catálogo ({fmt(incoming.favorites)}{" "}
                      favoritos)
                    </li>
                    <li>{fmt(incoming.selected)} selecionados</li>
                    <li>{fmt(incoming.checks)} verificações no histórico</li>
                  </ul>
                )}
                {!!pending?.skipped && (
                  <p>{fmt(pending.skipped)} registros inválidos serão ignorados.</p>
                )}
                <p>As configurações do backup substituem as atuais; os dados são combinados.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={apply}>
              Restaurar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
