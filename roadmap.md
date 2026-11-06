# Meaning-based discovery
- [x] Background mode: independent local Node process, existing controls, atomic local checkpoints, authenticated loopback communication and reconnection; real Discord calls continued with browser closed, pause and reload verified. Clean npm installation and npm run background verified; 136/136 tests passed. Source ZIP prepared. Physical Windows/macOS minimize behavior and computer suspension not tested; execution requires an awake PC.
- [x] Add multilingual dictionary and phonetic generation with ranking and tests.
- [x] Add independent meaning-search settings, suggestions and results using existing verification.
- [x] Verify mobile search, expansion, pause/resume, CSV, persistence, simulated 429 and automated error/batch rules. Actual iPhone Safari remains unverified; Chromium mobile and desktop checked.

# Safe persistence and cross-tab scanning
- [x] Add versioned validation, non-destructive recovery, visible save errors, retry and backup.
- [x] Add cross-tab exclusive execution with Web Locks and a fail-closed fallback.
- [x] Test old data, corruption, quota failures, two tabs, pause and HTTP 429 (simulated); do not publish.

# Remix audit (2026-11-06)
- [x] Typecheck, build log and 42 unit tests pass.
- [x] Browser audit: quota warning/retry, recovery sidecar, cross-tab lock, simulated 429 cooldown, both scan modes, favorites, CSV, persistence after reload.
- [ ] Real iPhone Safari and a real Discord 429 remain unverified (Chromium mobile emulation used).

# Responsive layout (2026-11-06)
- [x] Wider container on desktop; two-column Scanner and meaning mode; grid lists in Results/Catalog/Suggestions; mobile stays compact.
- [x] Verified zero horizontal overflow and zero page errors at 390px, 768px and 1440px on all tabs; 42/42 tests and typecheck pass; not published.

# DRUG URL rebrand (2026-11-06)
- [x] Dark black/graphite theme with violet accents, Space Grotesk + JetBrains Mono, link-symbol logo, favicon, hero header with slogan and signature.
- [x] Visuals and brand text only; logic, tests and protections untouched; 42/42 tests, typecheck and build OK; zero overflow at 390/768/1440px; not published.

# Rate-limit origin and cooldown recovery (2026-11-06)
- [x] Distinguish a Discord 429 from the app's preventive block in messages, saved results and CSV (legacy results still load).
- [x] Cooldown/last-check reconcile memory, original and recovery copy by the largest valid value.
- [x] 54/54 tests; simulated phone-size runs (no real Discord calls); not published.

# Full error audit (2026-11-06)
- [x] 429 evidence (Discord API vs Cloudflare edge, scope, global), 5xx/timeout/connection kinds, Discord's reset-after wait, browser-side deadline per check.
- [x] 68/68 tests; simulated phone runs: Cloudflare 429 + 30 s cooldown across reload, 500s, stuck request, meaning mode + CSV, two tabs, reload mid-scan.
- [ ] Confirm the real 429 layer on the hosted site (needs one scan by the user in the preview; the hosted preview requires sign-in, so it could not be called from here).
- [ ] Dedicated outbound address (e.g. Oracle Always Free VM) — waits on user approval and an account only the user can create.

# Mobile UX and limits pass (2026-11-06)
- [x] Clear mode cards, advanced settings, richer progress panel, results sort/copy, larger touch targets.
- [x] 429 honors full wait (longest signal), server global/per-visitor guard, README limits match code.
- [ ] Shared cross-instance server limit — needs storage the hosting does not offer for free.


# Hardening e painel de resultados (2026-11-06)
- [x] Remover confiança em `X-Forwarded-For` não validado para a chave do limitador por visitante.
- [x] Neutralizar conteúdo CSV que pode ser interpretado como fórmula em aplicativos de planilha e cobrir com teste.
- [x] Adicionar indicadores visuais proporcionais para o resumo dos resultados.
- [x] Traduzir páginas de erro e 404 e alinhar o erro isolado ao tema escuro/mobile.
- [x] Build, lint e suíte automatizada completos (verificado na nova conta: 84/84 testes, lint e typecheck limpos).

# Nova conta — importação da 1.1 (2026-11-06)
- [x] Código 1.1 importado integralmente; testes, lint, typecheck e build OK; abas verificadas em 390px e 1280px sem erros.
- [x] Verificação real de 3 códigos no Discord pelo servidor; resultados mantidos após recarregar.
- [x] Backup completo e restauração (mescla sem apagar) na aba Ajuda, com testes.
- [x] Barra “Total verificado” mostra 0% quando ainda não há resultados.
- [ ] Safari real no iPhone e um 429 real do Discord continuam não verificados (só emulação).

# Painel e estatísticas (2026-11-06)
- [x] Registro real de cada verificação, totais, taxa de sucesso, tempo de resposta, gráficos por dia e histórico com filtros em Resultados → Painel.
- [x] Histórico incluído no backup/restauração; testes de regras de contagem.
- [ ] Próximas melhorias pedidas: busca e filtros, desempenho, ajustes mobile.


# DRUG URL — pacote de melhorias integradas (2026-11-06)
- [x] Busca do catálogo e resultados sem diferenciar maiúsculas/minúsculas ou acentos; pesquisa por código, significado e categoria.
- [x] Filtros do catálogo por status (não verificado, convite ativo, sem convite ativo, erro), favoritos e categoria; ordenação alfabética e por verificação recente.
- [x] Filtro de favoritos nos resultados; pesquisa por código/significado, filtros por status e tamanho, ordenação e limpeza rápida dos filtros.
- [x] Paginação progressiva no catálogo para reduzir elementos renderizados em listas grandes.
- [x] Scanner calcula o progresso a partir dos resultados guardados, evitando percorrer toda a lista de candidatos a cada resposta.
- [x] Pesquisa com atualização adiada para manter a interface responsiva durante digitação e varreduras.
- [x] Ajuste de viewport para safe areas do iPhone e controles de busca com tamanho de texto que evita zoom automático do Safari.
- [ ] Build, suíte completa e teste em Safari físico pendentes neste ambiente; dependências não puderam ser instaladas dentro do tempo disponível.


## Biblioteca global de abreviações (implementação inicial)
- [x] Biblioteca offline integrada em Catálogo → Abreviações (230 registros iniciais).
- [x] Pesquisa por abreviação, significado, idioma, categoria, aliases e termos relacionados.
- [x] Significados alternativos para siglas ambíguas.
- [x] Filtros por categoria e idioma, favoritos e histórico recente.
- [x] Registros personalizados: criar, editar e excluir.
- [x] Coleções personalizadas.
- [x] Exportação e importação CSV, com deduplicação e limites de tamanho.
- [x] Backup/restauração de registros personalizados, favoritos, histórico e coleções.
- [x] Integração da busca por significado com Catálogo e Resultados.
- [ ] Ampliar o conjunto editorial para 10.000 registros validados, com fontes por entrada.
- [ ] Revisão linguística e verificação de contexto por falantes/ fontes de referência.

## Reformulação 3.0
- [x] Backup ZIP antes das alterações (DRUG-URL-backup-pre-3.0.zip).
- [x] Navegação em 4 áreas: Scanner, Biblioteca, Painel, Configurações.
- [x] Biblioteca Global unificada (13 categorias internas, códigos técnicos x abreviações, "Não classificado").
- [x] Pesquisa por relevância com tolerância a erros de digitação.
- [x] Pacote de aeroportos IATA (OurAirports, 3.245 registros).
- [x] Painel com números calculados dos dados reais.
- [x] CSV, coleções, favoritos e fontes centralizados em Configurações.
- [ ] Os 10.832 registros citados não estão no ZIP 2.1 (contém 1.779) — aguardando o usuário enviar os dados faltantes.

## Simplificação 4.0 (2026-11-06)
- [x] Backup ZIP antes das alterações (DRUG-URL-backup-pre-4.0.zip).
- [x] Tela inicial focada: verificador de URL do Discord (código avulso, aceita link discord.gg/…) + pesquisa global integrada (5.024 registros, resultados inline).
- [x] Navegação reduzida a 4 áreas: Início, Scanner, Painel, Ajustes; Biblioteca deixou de ser aba (busca na tela inicial, gestão em Ajustes).
- [x] Todas as funcionalidades preservadas: scanner (3 modos), histórico, favoritos, coleções, CSV, backup/restauração, persistência.
- [x] 120/120 testes, typecheck e build OK; verificação real de 1 código (gg → HTTP 200) pela tela principal; telas conferidas em 390px sem erros.
- [ ] Safari real no iPhone e 429 real do Discord continuam não verificados (só emulação).

## Auditoria técnica completa (2026-11-06)
- [x] Backup ZIP antes das alterações (DRUG-URL-backup-pre-auditoria.zip).
- [x] Lint: 286 erros de formatação corrigidos automaticamente; 11 avisos restantes justificados (fast-refresh em componentes ui e dependência `initial` intencional em use-persistent-state).
- [x] Metadados: og:title em português e twitter:card "summary" (não havia imagem para summary_large_image).
- [x] Dados: 4.890 linhas nos pacotes + seed = 5.024 registros; 6 pares sigla+significado duplicados (territórios EUA em países e subdivisões) já removidos pela desduplicação no carregamento; 0 registros inválidos.
- [x] Teste no navegador: 4 áreas, verificação real (gg → HTTP 200), pesquisa global (CGR), painel e ajustes em 390px e 1280px, zero erros de console.
- [x] 120/120 testes, typecheck e build de produção OK.
- [ ] Safari real no iPhone e 429 real do Discord continuam não verificados (só emulação).

## Importação da versão 5 (corrigido-429) (2026-11-06)
- [x] Código importado; testes ajustados ao novo intervalo mínimo de 5 s (122/122 OK); README atualizado; tela inicial conferida em 390px.
- [ ] Safari real no iPhone e 429 real do Discord continuam não verificados (só emulação).

## Correção do rate limit e velocidade (2026-11-06)
- [ ] Diagnóstico real do 429 (logs do servidor) e ritmo adaptativo baseado nas respostas.
- [ ] 429 não vira resultado: código continua pendente; retomada manual após espera com margem e recuo progressivo.
- [ ] Erros temporários com novas tentativas e recuo; separar temporário x permanente; "Retestar" só temporários.
- [ ] Fila sem duplicatas (inclusive reaproveitando resultados do outro modo), salvamento periódico eficiente.
- [ ] Estimativa pelo ritmo real; painel com consultas/min, tempo médio, estado da fila e espera.
- [ ] Testes, lint, typecheck, build; ZIP antes (feito) e depois.

## Filtro LIBERADAS (2026-11-06)
- [x] Categoria "Não está em uso" (404) separada de "Liberada" (só confirmação oficial); contadores exclusivos.
- [x] Filtros, contadores, CSV por categoria em Resultados; categorias no Painel, histórico e verificação rápida.
- [x] Persistência, helper em segundo plano, histórico e backup preservam/validam a categoria; 15 testes novos.
- [x] Sugerir próximos passos após o remix (respondido).

## Correção definitiva do rate limit (2026-11-06)
- [x] Causa raiz: todo 429 (mesmo de 0,3 s) parava a varredura, exigia "Retomar" e reduzia o ritmo por horas; aviso antigo continuava na tela; bloqueio Cloudflare aparecia como erro de conexão e era repetido.
- [x] Gerenciador central, espera automática, retomada automática, diagnóstico visual, quick check com trava entre abas; 180 testes.
- [ ] iPhone real e 429 real no aparelho do usuário continuam não verificados.
- [x] Connection-failure diagnosis: real error/trace, split counters, CORS-block detection, Safari <17.4 support
- [x] Route all page lookups through the site's own server endpoint (/api/public/invites/$code)
