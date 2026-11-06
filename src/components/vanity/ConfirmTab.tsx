import { BookOpen, ExternalLink, MessageSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DISCORD_APP_URL,
  DISCORD_BOOST_FAQ_URL,
  DISCORD_VANITY_HELP_URL,
} from "@/lib/vanity/browser";

import { WarningBanner } from "./shared";

export function ConfirmTab() {
  return (
    <div className="space-y-4">
      <WarningBanner />

      <section className="space-y-3 rounded-lg border bg-card p-4">
        <h2 className="font-semibold">Confirmação oficial no Discord</h2>
        <p className="text-sm text-muted-foreground">
          Este app não consulta endpoints privados e não pode prometer que um código está livre. A
          única confirmação válida é tentar definir a URL personalizada no próprio Discord.
        </p>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>
            Use um servidor <strong>elegível</strong> a URL personalizada (vanity URL). Os
            requisitos atuais (por exemplo, nível de impulsos ou status de Parceiro/Verificado)
            estão na ajuda oficial.
          </li>
          <li>
            Tenha permissão de <strong>Gerenciar Servidor</strong> nesse servidor.
          </li>
          <li>
            Abra o Discord → toque no nome do servidor → <strong>Configurações do servidor</strong>.
          </li>
          <li>
            Procure a opção de <strong>URL de convite personalizada</strong> (Vanity URL).
          </li>
          <li>
            Digite o código. O próprio Discord informa se ele pode ser usado. Só esse resultado é
            confirmação oficial.
          </li>
        </ol>
      </section>

      <div className="grid gap-2 sm:grid-cols-3">
        <Button asChild className="h-11">
          <a href={DISCORD_APP_URL} target="_blank" rel="noopener noreferrer">
            <MessageSquare aria-hidden /> Abrir Discord
          </a>
        </Button>
        <Button asChild variant="outline" className="h-11">
          <a href={DISCORD_VANITY_HELP_URL} target="_blank" rel="noopener noreferrer">
            <BookOpen aria-hidden /> Ajuda: URL personalizada
          </a>
        </Button>
        <Button asChild variant="outline" className="h-11">
          <a href={DISCORD_BOOST_FAQ_URL} target="_blank" rel="noopener noreferrer">
            <ExternalLink aria-hidden /> FAQ de impulsos
          </a>
        </Button>
      </div>

      <section className="space-y-2 rounded-lg border bg-card p-4 text-sm">
        <h2 className="font-semibold">Por que “não encontrado” não basta?</h2>
        <p className="text-muted-foreground">
          O endpoint público só responde se existe um convite ativo com aquele código. Um código
          pode não ter convite ativo e ainda assim estar reservado, bloqueado, ser restrito pelo
          Discord ou exigir requisitos que seu servidor não cumpre.
        </p>
      </section>
    </div>
  );
}
