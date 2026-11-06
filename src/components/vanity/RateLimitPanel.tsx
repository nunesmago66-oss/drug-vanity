import { Activity } from "lucide-react";
import type { DiagView } from "@/lib/vanity/rate-limit-manager";
import { cn } from "@/lib/utils";

const mmss = (secs: number) =>
  secs >= 60 ? `${Math.floor(secs / 60)}min ${String(secs % 60).padStart(2, "0")}s` : `${secs}s`;

/** Diagnostics of the shared rate-limit manager. A block is never shown as a result. */
export function RateLimitPanel({ view }: { view: DiagView }) {
  const rows: [string, string][] = [
    ["Conexão", view.connection],
    ["Rate limit", view.limit],
    ["Origem do bloqueio", view.origin],
    ["Rota afetada", view.route],
    ["Tempo restante", view.remainingSeconds > 0 ? mmss(view.remainingSeconds) : "—"],
    ["Requisições ao Discord", view.requests.toLocaleString("pt-BR")],
    ["Respostas 429", view.limited.toLocaleString("pt-BR")],
    ["Recuperação", view.recovery],
    ["Bloqueio externo", view.external],
  ];
  return (
    <details className="group rounded-md border bg-background/40" aria-label="Diagnóstico">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <Activity className="size-4" aria-hidden /> Diagnóstico do limite
        </span>
        <span
          role="status"
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-normal",
            view.normal
              ? "bg-status-exists-bg text-status-exists"
              : "bg-status-inconclusive-bg text-status-inconclusive",
          )}
        >
          {view.normal ? "Funcionamento normal" : view.limit}
        </span>
      </summary>
      <dl className="grid gap-x-3 gap-y-1 border-t p-3 text-xs sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex flex-col">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="font-medium text-foreground">{v}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
