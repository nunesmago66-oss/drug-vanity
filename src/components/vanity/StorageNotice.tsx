import { Download, RefreshCw } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  EMPTY_STORAGE_ISSUES,
  getRecoveryBackup,
  getStorageIssues,
  retryStorageSaves,
  subscribeStorage,
} from "@/lib/vanity/persistence";

export function StorageNotice() {
  const issues = useSyncExternalStore(
    subscribeStorage,
    getStorageIssues,
    () => EMPTY_STORAGE_ISSUES,
  );
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (getStorageIssues().some((i) => i.kind !== "recovery")) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, []);
  if (!issues.length) return null;
  const backup = () => {
    const url = URL.createObjectURL(
      new Blob([getRecoveryBackup()], { type: "application/json;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "discord-vanity-recuperacao.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };
  return (
    <section
      role="alert"
      aria-label="Aviso de armazenamento"
      className="space-y-2 border border-destructive bg-background p-3 text-sm"
    >
      {[...new Set(issues.map((i) => i.message))].map((message) => (
        <p key={message}>{message}</p>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={backup}>
          <Download aria-hidden /> Baixar cópia de segurança
        </Button>
        <Button variant="outline" size="sm" onClick={retryStorageSaves}>
          <RefreshCw aria-hidden /> Tentar salvar novamente
        </Button>
      </div>
    </section>
  );
}
