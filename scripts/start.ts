/**
 * `bun run start`: one command for the local install.
 * 1. Builds the production site as a Node server (.output) with the background
 *    helper address baked in (only when missing, or with --rebuild).
 * 2. Starts the background helper, which serves that production site and keeps
 *    scanning independently of the browser tab. Ctrl+C stops both safely.
 */
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const port = Number(process.env["BACKGROUND_PORT"] ?? 4318);
const helperUrl = `http://127.0.0.1:${port}`;
const marker = resolve(root, ".output/.drug-url-build");
const needsBuild =
  process.argv.includes("--rebuild") ||
  !existsSync(resolve(root, ".output/server/index.mjs")) ||
  !existsSync(marker) ||
  readFileSync(marker, "utf8") !== helperUrl;

if (needsBuild) {
  console.log("Gerando a versão de produção do site...");
  const env = { ...process.env, NITRO_PRESET: "node-server", VITE_BACKGROUND_URL: helperUrl };
  const r = spawnSync(process.execPath, [resolve(root, "node_modules/vite/bin/vite.js"), "build"], {
    cwd: root,
    stdio: "inherit",
    env,
  });
  if (r.status !== 0 || !existsSync(resolve(root, ".output/server/index.mjs"))) {
    console.error("Falha ao gerar a versão de produção. Nada foi iniciado.");
    process.exit(1);
  }
  writeFileSync(marker, helperUrl);
}

process.env["BACKGROUND_UI_MODE"] = "production";
await import("./background/cli");
