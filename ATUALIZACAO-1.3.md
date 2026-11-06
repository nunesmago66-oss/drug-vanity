# DRUG URL 1.3 — melhorias integradas

Esta atualização parte do projeto 1.2 e preserva a arquitetura, as quatro abas e os recursos já existentes.

## Busca e filtros
- Pesquisa sem distinção entre maiúsculas/minúsculas ou acentos.
- Catálogo: filtros por categoria, tamanho, favoritos e status da verificação (incluindo nunca verificados).
- Catálogo: ordenação alfabética e por verificação mais recente.
- Catálogo: paginação progressiva para reduzir a quantidade de elementos montados de uma só vez.
- Resultados: pesquisa por código/significado, filtros por status, tamanho e favoritos, ordenação e limpeza rápida dos filtros.
- Histórico do Dashboard: pesquisa por código combinada com filtros de status e modo.
- Sugestões por significado: pesquisa acento-insensível por código, significado, idioma e família.

## Desempenho
- O progresso do Scanner agora percorre os resultados armazenados e consulta um conjunto pré-calculado de candidatos, em vez de percorrer toda a lista de candidatos a cada resposta.
- Campos de busca usam atualização adiada para reduzir trabalho durante a digitação e durante verificações em andamento.
- Listas do Catálogo e Resultados são paginadas progressivamente.
- Os gráficos do Dashboard continuam com carregamento sob demanda.

## Compatibilidade mobile
- Viewport configurado para respeitar as safe areas de dispositivos com recortes e Dynamic Island.
- Barra de navegação considera a safe area superior.
- Campos de busca principais usam tamanho de texto adequado para evitar zoom automático do Safari em iOS.
- Controles e filtros reorganizados para telas estreitas.

## Verificação realizada nesta entrega
- 95 arquivos TypeScript/TSX passaram pela análise de sintaxe do compilador TypeScript: zero erros de sintaxe.
- 3 verificações isoladas do helper de busca passaram.
- A instalação de dependências excedeu o tempo disponível; por isso, build, lint e suíte Vitest completa não foram executados nesta entrega.
- Teste em Safari físico de iPhone continua pendente e não deve ser considerado validado por simulação.
