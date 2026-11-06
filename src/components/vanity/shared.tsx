import { AlertTriangle, CircleHelp, Link2, SearchX } from "lucide-react";
import type { SelectHTMLAttributes } from "react";

import { Badge } from "@/components/ui/badge";
import { STATUS_LABEL, type CheckStatus } from "@/lib/vanity/check-rules";
import { cn } from "@/lib/utils";

export const NOT_FOUND_WARNING = "Não encontrado NÃO significa disponível para vanity URL";

const STATUS_VARIANT = {
  exists: "exists",
  not_found: "notFound",
  inconclusive: "inconclusive",
} as const;

const STATUS_ICON = { exists: Link2, not_found: SearchX, inconclusive: CircleHelp };

export function StatusBadge({ status, className }: { status: CheckStatus; className?: string }) {
  const Icon = STATUS_ICON[status];
  return (
    <Badge variant={STATUS_VARIANT[status]} className={cn("gap-1 text-left", className)}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export function WarningBanner({ compact = false }: { compact?: boolean }) {
  return (
    <div
      role="note"
      className={cn(
        "flex items-start gap-2 rounded-md border border-warning-border bg-warning-bg text-warning",
        compact ? "px-3 py-2 text-xs" : "p-3 text-sm",
      )}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>
        <strong>{NOT_FOUND_WARNING}.</strong>{" "}
        {compact ? (
          "A API pública não confirma disponibilidade de vanity URL."
        ) : (
          <>
            A API pública de convites só informa se já existe um convite com o código. Ela não
            confirma elegibilidade nem disponibilidade de vanity URL — só o fluxo oficial do
            Discord, nas configurações de um servidor elegível, pode confirmar isso.
          </>
        )}
      </p>
    </div>
  );
}

export function NativeSelect({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-10 w-full rounded-md border border-input bg-card px-2 text-base text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export function EmptyState({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Link2;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed bg-card px-4 py-10 text-center">
      <Icon className="size-8 text-muted-foreground" aria-hidden />
      <p className="mt-3 font-medium">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}
