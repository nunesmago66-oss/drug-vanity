export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Não foi possível carregar esta página — DRUG URL</title>
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#100d16" />
    <style>
      * { box-sizing: border-box; }
      body { font: 15px/1.6 system-ui, -apple-system, sans-serif; background: #100d16; color: #f5f3f7; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: max(1.5rem, env(safe-area-inset-top)) 1.5rem max(1.5rem, env(safe-area-inset-bottom)); }
      .card { max-width: 28rem; width: 100%; text-align: center; padding: 2rem; border: 1px solid #34283f; border-radius: 1rem; background: #191421; box-shadow: 0 24px 80px #0008; }
      .brand { color: #c4a5ff; font-size: .75rem; font-weight: 700; letter-spacing: .24em; margin-bottom: 1.5rem; }
      h1 { font-size: 1.35rem; margin: 0 0 0.5rem; }
      p { color: #b7adbf; margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.6rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: 0.65rem 1rem; border-radius: 0.55rem; font: inherit; font-weight: 600; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      .primary { background: #9b6bdb; color: #100d16; }
      .secondary { background: #211a2b; color: #f5f3f7; border-color: #493858; } 
    </style>
  </head>
  <body>
    <main class="card">
      <div class="brand">DRUG URL</div>
      <h1>Não foi possível carregar esta página</h1>
      <p>Ocorreu um erro inesperado. Você pode tentar atualizar a página ou voltar ao início.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Tentar novamente</button>
        <a class="secondary" href="/">Voltar ao início</a>
      </div>
    </div>
  </body>
</html>`;
}
