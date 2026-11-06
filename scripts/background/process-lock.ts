import { mkdir, open, readFile, unlink } from "node:fs/promises";
import { dirname } from "node:path";

/** One Node owner per checkpoint, even if different API ports are requested. */
export async function acquireProcessLock(file: string) {
  const lock = `${file}.lock`;
  await mkdir(dirname(file), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await open(lock, "wx", 0o600);
      await handle.writeFile(String(process.pid));
      await handle.close();
      return async () => {
        await unlink(lock);
      };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      const pid = Number(await readFile(lock, "utf8"));
      if (!Number.isInteger(pid) || pid <= 0)
        throw new Error("Bloqueio local inválido; outra execução não será iniciada.");
      try {
        process.kill(pid, 0);
        throw new Error("Já existe um processo usando este checkpoint.");
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ESRCH") throw err;
        await unlink(lock);
      }
    }
  }
  throw new Error("Não foi possível proteger o checkpoint.");
}
