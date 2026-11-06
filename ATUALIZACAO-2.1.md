# DRUG URL 2.1 — Biblioteca global de abreviações

## Incluído
- Nova área Catálogo → Abreviações, sem remover as quatro abas principais.
- Biblioteca offline com 230 registros editoriais iniciais após deduplicação, em vários idiomas e categorias.
- Significados alternativos quando a mesma abreviação possui usos diferentes.
- Busca por sigla, significado, aliases, idioma e categoria.
- Filtros por idioma/categoria; favoritos; consultados recentemente.
- Gerenciamento de registros próprios e coleções personalizadas.
- Importação CSV (máximo 10 MB e até 10.000 linhas por arquivo) e exportação CSV.
- Backup/restauração inclui registros personalizados, favoritos, histórico e coleções. Backups anteriores continuam aceitos porque o campo novo é opcional.
- Busca do dicionário integrada como apoio à pesquisa no Catálogo e em Resultados; não altera as consultas ao Discord.

## Limitação de conteúdo
A meta de 10.000 registros validados não foi atingida nesta entrega. O conjunto incluído é uma base inicial de 230 registros, sem preenchimento artificial. A interface permite expandir por importação CSV, mas a validação editorial e as fontes por registro ainda precisam ser ampliadas antes de apresentar a biblioteca como 10.000 entradas verificadas.

## Validação realizada neste ambiente
- Compilação TypeScript isolada do módulo de dados da biblioteca.
- Verificação funcional isolada da pesquisa por Bitcoin/BTC, AI/Artificial Intelligence, LOL/Laughing Out Loud e múltiplos significados de MVP.
- Tentativa de instalar dependências para executar build e suíte Vitest: não concluída dentro do tempo disponível. Portanto, build completo, lint, suíte de testes e validação em Safari físico não são declarados como aprovados.
