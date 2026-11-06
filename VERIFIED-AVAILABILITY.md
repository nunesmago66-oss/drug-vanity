# VERIFIED AVAILABILITY — DRUG URL V7

Cada código verificado recebe exatamente uma categoria (regras em
`src/lib/vanity/availability.ts`):

| Estado           | No site           |
| ---------------- | ----------------- |
| `ACTIVE`         | Ativa             |
| `NOT_IN_USE`     | Não está em uso   |
| `CONFIRMED_FREE` | Liberada          |
| `EXPIRED`        | Expirada          |
| `REVOKED`        | Revogada          |
| `BLOCKED`        | Bloqueada         |
| `UNKNOWN`        | Indefinida        |
| `INVALID`        | Inválida (só aparece quando existe algum resultado assim) |

"Não está em uso" e "Liberada" são categorias diferentes e nunca se misturam.

## Como cada estado é atribuído

| Evidência do Discord                                   | Estado          |
| ------------------------------------------------------ | --------------- |
| HTTP 200 com objeto de convite do mesmo código         | ACTIVE          |
| HTTP 200 com `expires_at` no passado                   | EXPIRED         |
| HTTP 200 com corpo inesperado                          | UNKNOWN         |
| HTTP 400 / formato de código inválido                  | INVALID         |
| HTTP 403                                               | BLOCKED         |
| HTTP 404 (erro 10006 Unknown Invite)                   | NOT_IN_USE      |
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

## Opção LIBERADAS no site

Painel → "Todas as combinações" ou "URLs com significado" → botão **Liberadas (n)**, ao lado
de **Não estão em uso (n)**. Cada botão mostra só a sua categoria; a busca, o filtro de
comprimento, favoritos e ordenação continuam valendo; **CSV** exporta só a lista filtrada
(`vanity-liberadas.csv`). Os contadores por categoria aparecem nos Resultados e na Visão
geral; o histórico do Painel filtra por categoria. Como o Discord não oferece confirmação
oficial pública, a lista LIBERADAS fica vazia até existir uma confirmação oficial autorizada;
HTTP 404, expirados, erros e 429 nunca entram nela.

A categoria é salva com o resultado, no histórico (7º campo opcional), no estado do helper
em segundo plano e no backup — exportar o backup no PC e importar no iPhone (ou o contrário)
mantém as categorias. Valores incoerentes com o HTTP são rejeitados ao carregar.

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

## Limite de taxa (429) — recuperação automática

- Medido na rota real `GET /invites/{code}`: o Discord não envia cabeçalhos X-RateLimit em 200/404; o 429 chega depois de ~20 consultas rápidas ou ~40 a 1 por segundo, com `retry_after` abaixo de 1 s, `global: false`.
- 429 curto da rota: o app espera o tempo pedido + margem e repete o mesmo código sozinho (até 3 vezes).
- 429 global, Cloudflare, espera longa ou falha de conexão logo após um 429: a varredura para, salva a espera e recomeça sozinha quando ela termina (a menos que você toque em "Pausar"). Vale também depois de recarregar o site ou reiniciar o segundo plano.
- Um ritmo lento antigo volta ao normal depois de 10 min sem 429.
- Scanner → Progresso → "Diagnóstico do limite" mostra conexão, estado, origem, rota, tempo restante, requisições, respostas 429, recuperação e se o bloqueio do Discord ainda está ativo ou se resta só a margem do app.
- Um bloqueio nunca vira resultado: o código continua pendente.
