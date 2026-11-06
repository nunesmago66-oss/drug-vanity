# DRUG URL — backend externo de consultas (VPS com IP fixo)

Serviço Node.js que faz **somente** as consultas ao Discord, usando o mesmo código do site
(`invite-check.server.ts`, `invite-response.ts`, `availability.ts`, `check-rules.ts`,
`server-limiter.ts`). Resposta idêntica a `/api/public/invites/{code}` (CheckResult).

## Garantias
- Fila global única no processo: uma consulta ao Discord por vez, com espaçamento mínimo.
- Bloqueio global após HTTP 429 (Retry-After + margem) vale para todos os visitantes do processo.
- Uma consulta na fila por visitante; fila limitada (`MAX_QUEUE`) — excesso é recusado sem consultar o Discord.
- CORS só para `ALLOWED_ORIGINS`; códigos validados; logs sem IP, cookies ou tokens.
- **Rode UMA instância.** Várias instâncias teriam filas independentes (sem coordenação). Não escale horizontalmente.

## Implantação (sem custos automáticos — você escolhe e contrata a VPS)
1. VPS Linux com **IPv4 público fixo e dedicado** (não use NAT compartilhado, proxy ou rotação de IP).
   O IP de saída da VPS é o que o Discord verá: confira com `curl -4 https://ifconfig.me`.
2. Instale Docker. Na raiz do projeto:
   ```
   docker build -f scripts/invite-api/Dockerfile -t drugurl-invite-api .
   docker run -d --name drugurl-api --restart unless-stopped -p 127.0.0.1:8787:8787 \
     -e ALLOWED_ORIGINS=https://verified-url.lovable.app -e TRUST_PROXY=1 drugurl-invite-api
   ```
   Sem Docker: `npm i -g tsx && tsx scripts/invite-api/server.ts` (Node 22+).
3. HTTPS: aponte um subdomínio (ex.: `api.seudominio.com`, registro A → IP da VPS) e use Caddy:
   ```
   api.seudominio.com {
     reverse_proxy 127.0.0.1:8787
   }
   ```
   Caddy emite o certificado automaticamente.
4. Teste: `curl https://api.seudominio.com/health` → `{"ok":true,...}`.
   Uma única consulta controlada: `curl -H "Origin: https://verified-url.lovable.app" https://api.seudominio.com/api/public/invites/zq7`.
5. Conecte o site: defina `VITE_INVITE_API_BASE_URL=https://api.seudominio.com` no projeto Lovable e publique.
   Sem essa variável o site continua usando o endpoint próprio (`/api/public/invites/...`), como hoje.

## Operacional somente depois
A correção só é considerada operacional após a implantação e uma consulta real controlada.
Se o Discord também limitar o IP da VPS, o motivo aparece nos `limitHeaders` de cada 429.
