import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BackgroundEngine } from "./engine";
import { companionServer } from "./http";
import { acquireProcessLock } from "./process-lock";

const root = fileURLToPath(new URL("../../", import.meta.url));
const port = Number(process.env["BACKGROUND_PORT"] ?? 4318);
const uiPort = Number(process.env["BACKGROUND_UI_PORT"] ?? 5173);
const token = randomBytes(32).toString("hex");
const origin = `http://127.0.0.1:${uiPort}`;
const stateFile = resolve(root, process.env["BACKGROUND_STATE_FILE"] ?? ".background/state.json");
const releaseLock = await acquireProcessLock(stateFile);
const engine = new BackgroundEngine(stateFile);
await engine.load();
const server = companionServer(engine, token, origin);
server.on("error", (e) => {
  console.error(`Não foi possível iniciar: ${e.message}. Já existe uma execução?`);
  process.exit(1);
});
server.listen(port, "127.0.0.1", () => {
  engine.resume();
  console.log(
    `\nDRUG URL — modo em segundo plano\nAbra: ${origin}/#background=${token}\nMantenha este processo aberto. Abas e janelas podem ser fechadas; o PC não pode dormir.\nProgresso: .background/state.json\n`,
  );
});
// "production" serves the prebuilt Node server (.output, see scripts/start.ts);
// default keeps the original Vite dev UI.
const production = process.env["BACKGROUND_UI_MODE"] === "production";
const ui = production
  ? spawn(process.execPath, [resolve(root, ".output/server/index.mjs")], {
      cwd: root,
      stdio: "inherit",
      env: {
        ...process.env,
        HOST: "127.0.0.1",
        PORT: String(uiPort),
        NITRO_HOST: "127.0.0.1",
        NITRO_PORT: String(uiPort),
      },
    })
  : spawn(
      process.execPath,
      [
        resolve(root, "node_modules/vite/bin/vite.js"),
        "--host",
        "127.0.0.1",
        "--port",
        String(uiPort),
        "--strictPort",
      ],
      {
        cwd: root,
        stdio: "inherit",
        env: { ...process.env, VITE_BACKGROUND_URL: `http://127.0.0.1:${port}` },
      },
    );
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  await engine.shutdown();
  await releaseLock();
  ui.kill();
  server.close(() => process.exit(0));
}
ui.on("exit", () => {
  void shutdown();
});
process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
