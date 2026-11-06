# VERIFIED AVAILABILITY — DRUG URL V7

Cada código verificado recebe um dos estados: `CONFIRMED_FREE`, `ACTIVE`, `INVALID`,
`EXPIRED`, `REVOKED`, `BLOCKED`, `UNKNOWN`. Regras em `src/lib/vanity/availability.ts`.

## Como cada estado é atribuído

| Evidência do Discord                                   | Estado          |
| ------------------------------------------------------ | --------------- |
| HTTP 200 com objeto de convite do mesmo código         | ACTIVE          |
| HTTP 200 com `expires_at` no passado                   | EXPIRED         |
| HTTP 200 com corpo inesperado                          | UNKNOWN         |
| HTTP 400 / formato de código inválido                  | INVALID         |
| HTTP 403                                               | BLOCKED         |
| HTTP 404 (erro 10006 Unknown Invite)                   | UNKNOWN         |
| HTTP 429 (Retry-After respeitado, código fica pendente)| UNKNOWN         |
| 5xx, timeout, falha de conexão, resposta desconhecida  | UNKNOWN         |
| Bloqueio preventivo do app (Discord não consultado)    | UNKNOWN         |
| Confirmação oficial explícita (`OfficialConfirmation`) | CONFIRMED_FREE  |

## Limitação oficial do Discord (importante)

- A API pública do Discord **não possui nenhuma operação que confirme que um código de
  vanity URL está livre**. `GET /invites/{code}` responde 404 igualmente para códigos que
  nunca existiram, expiraram, foram revogados ou estão reservados.
- Por isso o scanner **nunca** produz `CONFIRMED_FREE` sozinho. Esse estado só é aceito
  quando um objeto `OfficialConfirmation` válido (fonte `discord_official`, mesmo código)
  é fornecido; nenhum mecanismo falso foi inventado.
- `REVOKED` existe no modelo, mas o Discord não expõe sinal que diferencie revogação de
  inexistência; ele nunca é atribuído a partir da API pública.
- Ao carregar dados/backup, um estado salvo incoerente com o HTTP (ex.: `CONFIRMED_FREE`
  com 429) é rejeitado.

## Persistência

Resultados compactos ganharam um 5º campo opcional (chave de disponibilidade), gravado só
quando não é dedutível do HTTP (ex.: EXPIRED). Dados antigos continuam válidos e derivam o
estado do HTTP salvo. Adaptive Pacing, filas, 429/Retry-After, retomada e exportação não
foram alterados; a exportação CSV ganhou a coluna `verified_availability`.

## Instalação e execução

```
bun install        # ou npm install
bun run dev        # site
bun run background # companheiro desktop (opcional)
bun run test       # testes
bun run lint
bun run build
```

## Instalação no PC (comando único)

Requisitos: Node.js 22+ e Bun.

```
bun install
bun run test
bun run start          # gera a versão de produção (1ª vez) e inicia site + background
bun run start:rebuild  # força nova geração após atualizar o código
```

- Abra o endereço exibido no terminal: `http://127.0.0.1:5173/#background=<chave>`
  (a chave muda a cada início; copie sempre do terminal).
- O processamento continua com a aba fechada; o PC não pode dormir.
- Progresso salvo em `.background/state.json`. Ctrl+C encerra tudo com segurança
  (a varredura fica pausada para retomar). Se o processo cair ou o PC desligar,
  a varredura em andamento retoma sozinha no próximo `bun run start`.
- Portas: `BACKGROUND_UI_PORT` (site, 5173) e `BACKGROUND_PORT` (helper, 4318).

## iPhone / iPad (Safari)

O site funciona no Safari do iPhone: o scanner consulta o Discord direto do aparelho,
com o mesmo Adaptive Pacing e Verified Availability, e o progresso fica salvo no próprio
iPhone (sobrevive a recarregar/fechar). O Background Helper é só para PC.

Limitação do iOS: o Safari pausa a varredura quando você troca de app ou bloqueia a tela;
ao voltar, toque em "Retomar". PC e iPhone têm históricos separados (use Backup →
exportar/importar para levar resultados de um para o outro).

### Publicar com HTTPS (acesso de qualquer lugar)
O iPhone precisa de HTTPS para instalar o app. Opções:
- Publicar no Lovable (botão Publish) — HTTPS automático.
- Ou `bun run build` e hospedar a pasta gerada em Cloudflare Pages/Workers
  (`npx wrangler deploy` dentro de `dist/`), também com HTTPS automático.

### Adicionar à Tela de Início
1. Abra o endereço HTTPS no **Safari**.
2. Toque em **Compartilhar** (quadrado com seta).
3. Toque em **Adicionar à Tela de Início** → **Adicionar**.
O DRUG URL abre em tela cheia, com ícone próprio, respeitando notch e barra inferior.
