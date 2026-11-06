import { mkdir, readFile, rename, writeFile, open } from "node:fs/promises";
import { dirname } from "node:path";
import { checkInviteFromBrowser } from "../../src/lib/vanity/invite-check.browser";
import {
  cooldownForResult,
  normalizeCheckResult,
  runVerificationQueue,
  type CheckResult,
} from "../../src/lib/vanity/check-rules";
import { effectiveInterval, recentLimitCount, validatePace } from "../../src/lib/vanity/pacing";
import {
  emptyDiag,
  inlineLimitWaitMs,
  isSuspectedEdgeBlock,
  noteLimit,
  noteResponse,
  validateDiag,
} from "../../src/lib/vanity/rate-limit-manager";
import { needsCheck, toCompact } from "../../src/lib/vanity/scanner";
import { eventFromResult, recordCheck, mergeStats } from "../../src/lib/vanity/stats";
import {
  emptyBackground,
  mergeResults,
  validateBackground,
  type BackgroundSnapshot,
} from "../../src/lib/vanity/background-protocol";

/** Local Node only. A checkpoint is durable before the next Discord request. */
export class BackgroundEngine {
  state = emptyBackground();
  private stopRequested = false;
  private task: Promise<void> | null = null;
  private starting = false;
  private forceCode: string | null = null;
  private autoTimer: ReturnType<typeof setTimeout> | null = null;
  constructor(
    private file: string,
    private check = (code: string) => checkInviteFromBrowser({ data: { code } }),
  ) {}
  async load() {
    try {
      this.state = validateBackground(JSON.parse(await readFile(this.file, "utf8")));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT")
        throw new Error(
          "Checkpoint inválido; o arquivo foi preservado. Restaure uma cópia antes de executar.",
        );
    }
  }
  private async save() {
    this.state.revision++;
    await mkdir(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, JSON.stringify(this.state), { mode: 0o600 });
    const handle = await open(tmp, "r+");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(tmp, this.file);
  }
  async start(raw: unknown) {
    if (this.task || this.starting) throw new Error("Outra verificação está em execução");
    this.starting = true;
    try {
      const input = validateBackground(raw);
      if (Math.max(this.state.cooldownUntil, input.cooldownUntil) > Date.now())
        throw new Error("Aguarde o limite de taxa");
      // Honor the existing explicit "Retestar erros temporários" deletion only.
      for (const c of input.codes) {
        const own = input.mode === "a" ? this.state.results : this.state.meaningResults;
        const incoming = input.mode === "a" ? input.results : input.meaningResults;
        const old = own[c];
        if (
          !incoming[c] &&
          old?.[0] === "x" &&
          (old[1] === null || old[1] >= 500 || old[1] === 403 || old[1] === 408)
        )
          delete own[c];
      }
      this.state = {
        ...input,
        results: mergeResults(this.state.results, input.results),
        meaningResults: mergeResults(this.state.meaningResults, input.meaningResults),
        stats: mergeStats(this.state.stats, input.stats),
        // Re-validated so an old slowdown (no 429 in the last 10 min) decays to the normal pace.
        pace: validatePace(this.state.revision ? this.state.pace : input.pace) ?? input.pace,
        diag: validateDiag(this.state.diag ?? input.diag ?? emptyDiag(Date.now())),
        cooldownUntil: Math.max(this.state.cooldownUntil, input.cooldownUntil),
        lastCheckAt: Math.max(this.state.lastCheckAt, input.lastCheckAt),
        revision: this.state.revision,
        status: "running",
        error: null,
      };
      await this.save();
      this.resume();
    } finally {
      this.starting = false;
    }
  }
  /** After a rate-limit stop the run continues by itself once the wait ends (until the user pauses). */
  private scheduleAutoResume() {
    if (this.autoTimer) clearTimeout(this.autoTimer);
    const wait = Math.max(0, this.state.cooldownUntil - Date.now()) + 250;
    this.autoTimer = setTimeout(() => {
      this.autoTimer = null;
      if (this.task || this.state.status !== "rate_limited") return;
      this.state.status = "running";
      this.state.diag = { ...(this.state.diag ?? emptyDiag(Date.now())) };
      this.state.diag.recoveries++;
      void this.save().then(() => this.resume());
    }, wait);
    this.autoTimer.unref?.();
  }
  resume() {
    if (this.state.status === "rate_limited" && !this.task) return this.scheduleAutoResume();
    if (this.task || this.state.status !== "running") return;
    this.stopRequested = false;
    this.task = this.run()
      .catch(async (e) => {
        this.state.status = "errors";
        this.state.error = `Execução interrompida: ${e instanceof Error ? e.message : "erro"}`;
        try {
          await this.save();
        } catch {
          /* keep state in memory, original checkpoint intact */
        }
      })
      .finally(() => {
        this.task = null;
        this.forceCode = null;
        this.state.current = null;
        this.state.nextAt = 0;
      });
  }
  /** User pause: also cancels a pending automatic resume. */
  async stop() {
    this.cancelAutoResume();
    if (this.state.status === "rate_limited" && !this.task) {
      this.state.status = "stopped";
      await this.save();
    }
    this.stopRequested = true;
    await this.task;
  }
  /** Process shutdown: keeps the saved status so a restart resumes where it was. */
  async shutdown() {
    this.cancelAutoResume();
    this.stopRequested = true;
    await this.task;
  }
  private cancelAutoResume() {
    if (this.autoTimer) clearTimeout(this.autoTimer);
    this.autoTimer = null;
  }
  async quick(code: string) {
    if (this.task || this.starting) throw new Error("Outra verificação está em execução");
    const results = { ...this.state.results };
    delete results[code];
    const meaningResults = { ...this.state.meaningResults };
    delete meaningResults[code];
    // Single checks share the exact same owner and timing; no parallel browser request.
    this.forceCode = code;
    try {
      await this.start({ ...this.state, mode: "a", codes: [code], results, meaningResults });
    } catch (e) {
      this.forceCode = null;
      throw e;
    }
    await this.task;
    const result = this.state.recent[0];
    if (!result || result.code !== code) throw new Error("Nenhuma nova consulta realizada");
    return result;
  }
  private async run() {
    const own = this.state.mode === "a" ? this.state.results : this.state.meaningResults;
    const other = this.state.mode === "a" ? this.state.meaningResults : this.state.results;
    const codes = this.state.codes.filter((code) => {
      if (code === this.forceCode) return true;
      if (!needsCheck(own[code])) return false;
      if (other[code] && (other[code]?.[0] === "e" || other[code]?.[0] === "n")) {
        const r = other[code];
        if (r) own[code] = r;
        return false;
      }
      return true;
    });
    let startedAt = 0;
    const log = (r: CheckResult) => {
      this.state.recent = [r, ...this.state.recent].slice(0, 6);
      if (r.discordQueried !== false)
        this.state.stats = recordCheck(
          this.state.stats,
          eventFromResult(r, this.state.mode, startedAt),
        );
    };
    const outcome = await runVerificationQueue({
      codes,
      batchLimit: Infinity,
      intervalMs: this.state.config.intervalMs,
      pace: this.state.pace,
      initialDelayMs:
        Math.max(
          this.state.cooldownUntil,
          this.state.lastCheckAt + effectiveInterval(this.state.pace, this.state.config.intervalMs),
        ) - Date.now(),
      shouldStop: () => this.stopRequested,
      sleep: async (ms) => {
        this.state.nextAt = Date.now() + ms;
        while (!this.stopRequested && Date.now() < this.state.nextAt)
          await new Promise((r) => setTimeout(r, Math.min(100, this.state.nextAt - Date.now())));
        this.state.nextAt = 0;
      },
      onStart: (code) => {
        this.state.current = code;
        startedAt = Date.now();
        this.state.lastCheckAt = startedAt;
      },
      check: async (code) => {
        await this.save();
        const r = normalizeCheckResult(code, await this.check(code));
        log(r);
        const diag = noteResponse(this.state.diag ?? emptyDiag(Date.now()), r);
        this.state.diag = diag;
        // Persist a 429 before anything else; a crash can never erase its wait.
        const suspected = isSuspectedEdgeBlock(r, this.state.pace);
        if (r.httpStatus === 429 || r.errorKind === "app_block" || suspected) {
          const inline = suspected ? null : inlineLimitWaitMs(r, 0);
          const until =
            Date.now() +
            (inline ?? cooldownForResult(r, recentLimitCount(this.state.pace) + 1) * 1000);
          this.state.cooldownUntil = Math.max(this.state.cooldownUntil, until);
          this.state.diag = noteLimit(diag, r, {
            inline: inline != null,
            appUntil: until,
            origin: suspected ? "suspected_edge" : undefined,
          });
        } else if (r.errorKind !== "app_throttle") {
          if (r.nextAllowedInSeconds)
            this.state.cooldownUntil = Math.max(
              this.state.cooldownUntil,
              Date.now() + r.nextAllowedInSeconds * 1000,
            );
          // Only definitive responses here; exhausted temporary failures saved by onResult.
          if (r.status !== "inconclusive") own[code] = toCompact(r);
        }
        await this.save();
        return r;
      },
      onResult: (r) => {
        own[r.code] = toCompact(r);
      },
      onPace: (p) => {
        this.state.pace = p;
      },
      onLimitWait: () => {
        if (this.state.diag) this.state.diag.recoveries++;
      },
    });
    this.state.status =
      outcome.reason === "done"
        ? "done"
        : outcome.reason === "rate_limited"
          ? "rate_limited"
          : outcome.reason === "errors"
            ? "errors"
            : "stopped";
    this.state.current = null;
    this.state.nextAt = 0;
    await this.save();
    if (this.state.status === "rate_limited") this.scheduleAutoResume();
  }
}
