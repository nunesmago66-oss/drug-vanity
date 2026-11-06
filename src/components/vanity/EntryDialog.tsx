import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CATEGORIES,
  KINDS,
  KIND_LABEL,
  type CatalogEntry,
  type Category,
  type Kind,
} from "@/lib/vanity/catalog";
import { isValidCode, normalizeCode } from "@/lib/vanity/check-rules";

import { NativeSelect } from "./shared";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: CatalogEntry | null;
  existingCodes: string[];
  onSave: (entry: CatalogEntry) => void;
}

export function EntryDialog({ open, onOpenChange, editing, existingCodes, onSave }: Props) {
  const [code, setCode] = useState("");
  const [meaning, setMeaning] = useState("");
  const [category, setCategory] = useState<Category>("outros");
  const [kind, setKind] = useState<Kind>("personalizado");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCode(editing?.code ?? "");
    setMeaning(editing?.meaning ?? "");
    setCategory(editing?.category ?? "outros");
    setKind(editing?.kind ?? "personalizado");
    setError(null);
  }, [open, editing]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const normalized = normalizeCode(code);
    if (!editing) {
      if (!isValidCode(normalized)) {
        setError("Use 2 ou 3 caracteres: letras minúsculas (a-z), números ou hífen no meio.");
        return;
      }
      if (existingCodes.includes(normalized)) {
        setError(`O código “${normalized}” já está no catálogo.`);
        return;
      }
    }
    onSave({
      ...(editing ?? { custom: true }),
      code: editing?.code ?? normalized,
      meaning: meaning.trim(),
      category,
      kind,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>{editing ? `Editar “${editing.code}”` : "Adicionar código"}</DialogTitle>
            <DialogDescription>
              Informe um significado só se tiver certeza. Interpretações contextuais devem ser
              marcadas como “sigla/abreviação”.
            </DialogDescription>
          </DialogHeader>

          {!editing && (
            <div className="space-y-1.5">
              <Label htmlFor="entry-code">Código (2–3 caracteres)</Label>
              <Input
                id="entry-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                maxLength={40}
                placeholder="ex.: ace"
                className="h-10 font-mono"
                aria-invalid={!!error}
                aria-describedby={error ? "entry-error" : undefined}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="entry-meaning">Significado (opcional)</Label>
            <Input
              id="entry-meaning"
              value={meaning}
              onChange={(e) => setMeaning(e.target.value)}
              maxLength={120}
              placeholder="ex.: Ás / excelência"
              className="h-10"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="entry-category">Categoria</Label>
              <NativeSelect
                id="entry-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="entry-kind">Tipo de significado</Label>
              <NativeSelect
                id="entry-kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as Kind)}
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          {error && (
            <p id="entry-error" role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit">{editing ? "Salvar" : "Adicionar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
