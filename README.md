# DRUG URL

Scanner de convites curtos do Discord (2 e 3 caracteres). Indica apenas se existe um convite ativo
(HTTP 200), se nenhum foi encontrado (HTTP 404 — **não** confirma vanity URL disponível) ou se houve
erro/limite de taxa. No navegador móvel, a execução depende da aba ativa; no PC, há um processo local independente opcional.

## Modos de busca

- **Todas as combinações** — gera cada código de 2–3 caracteres (letras ou letras+números) ou usa os
  códigos selecionados no Catálogo.
- **URLs com significado** — 3.623 sugestões de um dicionário multilíngue e gerador fonético.

Cada modo tem configuração e resultados próprios; só um modo pode verificar por vez.

## Limites reais (como o código se comporta)

Navegador (limitador principal, `src/lib/vanity/check-rules.ts`):

- Uma consulta por vez. No modo automático, o ritmo adaptativo começa em **2 s**, pode acelerar até **1 s** após respostas limpas e desacelera após limites 429 (faixa automática: 1–30 s). No modo fixo, as opções nunca ficam abaixo de **1 s**.
- Pausa automática a cada **50, 100 ou 250** verificações; retomar exige um toque.
- Pausa após **3 erros seguidos** (sem contar 429).
- **HTTP 429**: a varredura para imediatamente e espera o **Retry-After inteiro** (o maior entre
  `Retry-After`, `retry_after` do corpo e `X-RateLimit-Reset-After`, arredondado para cima; 60 s quando
  ausente; nunca menos de 5 s). A espera fica salva no aparelho e sobrevive a recarregar a página.
  **Não há retomada automática**: depois da espera, o usuário toca em “Retomar”.
- Quando o Discord responde 200/404 com `X-RateLimit-Remaining: 0`, a próxima consulta espera o
  `X-RateLimit-Reset-After` informado.
- Só uma aba executa a verificação (Web Locks ou transação IndexedDB; se nenhum funcionar, não inicia).
- O Safari pausa ao trocar de aba ou bloquear a tela; o progresso fica salvo.

Origem das consultas (`src/lib/vanity/invite-check.browser.ts`):

- O verificador e a varredura consultam o Discord **direto do navegador**, pela internet de quem usa o
  site (o endpoint público de convites do Discord permite isso). Assim o limite do Discord passa a valer
  só para o seu próprio uso, e não para o endereço compartilhado da hospedagem.
- Um 429 continua parando a varredura e exigindo “Retomar” depois da espera; o app nunca troca de rota
  ou de endereço para fugir do limite.

Servidor (`src/lib/vanity/server-limiter.ts`, reserva não usada pela interface atual):

- Intervalo mínimo de **0,8 s por visitante** (piso do cliente menos tolerância de rede) e **1 consulta a cada
  0,9 s somando todos os visitantes**, com no máximo uma consulta em andamento por visitante. Esses limites são por instância do servidor; instâncias diferentes não compartilham contadores.
- Depois de um 429 do Discord (ou bucket vazio), **todos os visitantes** ficam bloqueados até o fim da
  espera; essas respostas não chegam ao Discord e aparecem como “bloqueio preventivo do app”.
- Esses limites ficam na memória de cada instância do servidor. Instâncias diferentes não compartilham
  contadores: um limite único e compartilhado exigiria armazenamento extra (ex.: Durable Objects), que
  não está disponível nesta hospedagem sem custo/configuração adicional.

## O que o app não faz

Não usa login, tokens, proxies, rotação de IP nem qualquer forma de contornar limites ou CAPTCHA do
Discord. Não há banco de dados: catálogo, favoritos, seleção, resultados e configurações ficam apenas
no navegador (localStorage), com cópia de recuperação.

## Desenvolvimento

```sh
bun install
bun run dev
bunx vitest run
```

Feito com TanStack Start, React, TypeScript e Tailwind CSS.

## Execução em segundo plano no PC

Requer **Node.js 22.12 ou mais recente** e npm. Extraia o ZIP em uma pasta e execute:

```sh
npm install
npm run background
```

Abra **exatamente o endereço exibido no terminal** (inclui a chave local de conexão). Use os mesmos
controles de Scanner → Iniciar/Retomar/Pausar. Não há mudança de layout. O processo Node faz as
consultas pela internet do seu PC, sem depender da aba. Pode trocar de aba, minimizar ou até fechar
o navegador; reabra o endereço do terminal para sincronizar resultados e acompanhar a execução.
Os dados do site publicado não migram automaticamente: use o backup existente em Ajustes para
restaurá-los no site local antes de começar.

Mantenha o terminal/processo aberto e o PC ligado, com internet e **sem suspensão/hibernação**.
Node não executa enquanto o computador dorme. `Ctrl+C` encerra com checkpoint; uma execução
interrompida abruptamente é retomada ao executar o comando novamente. Pausas manuais, 429 e
erros consecutivos não retomam sozinhos. O ritmo adaptativo e todas as proteções de Discord são
os mesmos; não há pausa por quantidade de códigos no modo em segundo plano.

O checkpoint `.background/state.json` contém fila, configurações, resultados dos dois modos,
estatísticas, ritmo, última consulta e cooldown; é salvo atomicamente antes de cada consulta e após
cada resposta. Faça uma cópia dessa pasta para preservar o estado local entre instalações.
Um checkpoint corrompido é preservado e impede a execução, nunca é apagado silenciosamente.
Desconectar a interface não interrompe o scanner e não ativa outra fila no navegador.
Na versão local, o verificador avulso também usa o processo independente e não sobrepõe consultas.

A comunicação é exclusivamente local (`127.0.0.1`), com chave aleatória por execução, origem
restrita e sem acesso remoto. A versão hospedada permanece browser-only; `npm run background`
é um comando para executar no seu PC, não um serviço permanente na hospedagem.
Portas opcionais: `BACKGROUND_PORT` (4318) e `BACKGROUND_UI_PORT` (5173).

```sh
npm test
```


## Revisão de segurança e experiência (2026-11-06)

- A identificação do visitante no servidor confia somente no cabeçalho `CF-Connecting-IP` injetado pela Cloudflare. Em hospedagens sem esse cabeçalho, usa uma chave compartilhada conservadora; não confia em `X-Forwarded-For` enviado pelo cliente.
- Exportações CSV neutralizam células que poderiam ser interpretadas como fórmulas por planilhas (CSV Formula Injection).
- Resumos de resultados exibem total, convites ativos, não encontrados e erros, com indicadores proporcionais.
- Páginas de erro e 404 estão em português e seguem o tema escuro da marca, incluindo áreas seguras de dispositivos móveis.
- A suíte contém testes para a neutralização de fórmulas em CSV.

## Backup e restauração

Na aba **Ajuda**, “Baixar backup” gera um arquivo JSON com resultados (dos dois modos), catálogo,
favoritos, seleção e configurações. “Restaurar backup” valida o arquivo com as mesmas regras dos dados
salvos, combina com os dados atuais sem apagar nada (para o mesmo código vale a verificação mais
recente) e nunca altera a espera de limite de taxa do aparelho. Fica bloqueado durante uma varredura.

## Painel de estatísticas

Em **Resultados → Painel**: códigos verificados, sem convite ativo (candidatos — não confirma vanity
URL), em uso, inválidos (erro/limite), verificações realizadas (inclui retestes), taxa de sucesso
(respostas 200/404 sobre o total), tempo médio de resposta, limites 429, gráficos por dia (7, 14 ou 30
dias) e histórico das últimas 200 verificações com filtros. Tudo vem dos dados salvos no aparelho e
atualiza a cada novo resultado. Resultados salvos antes do painel entram uma vez no histórico, sem
tempo de resposta. O histórico entra no backup; restaurar não soma o mesmo dia duas vezes.


## Tela principal e pesquisa global

A tela inicial é focada em duas ações: o **verificador de URL do Discord** (cole um link discord.gg/… ou digite o código de 2–3 caracteres e toque em Verificar — o resultado é salvo no histórico e respeita os mesmos limites de taxa do scanner) e a **pesquisa global**, que consulta em um único campo todos os registros: abreviações e gírias, aeroportos (IATA), países, moedas, idiomas, subdivisões e elementos químicos — 5.024 registros embutidos, fora os registros personalizados do usuário. Os resultados aparecem na própria pesquisa, com significado, categoria e fonte.

Os recursos secundários ficam organizados de forma discreta: **Scanner** (todas as combinações, URLs com significado e minha lista), **Painel** (visão geral e resultados) e **Ajustes** (backup, dados da biblioteca, coleções e confirmações).

## Biblioteca global de abreviações

A pesquisa global da tela inicial usa a Global Abbreviation Library, uma biblioteca offline com 5.024 registros embutidos (seleção editorial + pacotes de padrões oficiais ISO, IATA e IUPAC). Ela oferece pesquisa por sigla, significado e aliases com tolerância a erros de digitação, favoritos, histórico recente, coleções personalizadas e criação/edição/exclusão de registros do usuário (em Ajustes). A busca da biblioteca também é usada como apoio para localizar códigos no Catálogo e em Resultados.

A biblioteca pode ser ampliada importando CSV no formato exportado pelo próprio app (limite de 10 MB por arquivo e até 10.000 linhas por importação). A quantidade inicial não é apresentada como 10.000 registros validados: a expansão depende de fontes e revisão editorial. Registros personalizados, favoritos, histórico recente e coleções entram no backup e na restauração.
