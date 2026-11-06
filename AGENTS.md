<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules

- The optional desktop companion lives in scripts/background/ and runs only in local Node, never in the Worker import graph; its authenticated loopback API is enabled only for the locally launched UI, so published/browser-only scanning remains unchanged.
- Desktop background scans use the shared verification queue/pacing and atomic local file checkpoints; existing UI controls delegate to the companion with no browser fallback on disconnect or 429, preventing overlapping verification queues.

- Scanner and quick check call Discord directly from the browser via `invite-check.browser.ts` (Discord's invite endpoint allows CORS), so each visitor uses their own connection instead of the hosting's shared outbound IP; response parsing is shared in `invite-response.ts`, and the `checkInvite` server function remains only as an unused fallback. Never fall back to the server or another route on a 429.
- Verification rules (status classification, min interval, batch auto-pause, consecutive-error pause, 429 handling via the rate-limit manager) live in `src/lib/vanity/check-rules.ts` with tests beside it; change them there, not in components.
- Scanner candidate generation and compact result storage live in `src/lib/vanity/scanner.ts` so ~48k results fit in localStorage and survive reloads.
- User data (catalog, favorites, selection, scan results/progress) is stored in the browser only (localStorage/sessionStorage); no accounts or backend database.
- Meaning discovery uses a deterministic multilingual dictionary and phonetic generator in `meaning-generator.ts`; invented sounds remain separate from dictionary meanings to prevent fabricated translations.
- Exhaustive and meaning scanners have separate persistent configs/results and use the same ScannerTab/verification queue; shared cooldown and last-request time plus mutual exclusion preserve rate limits across modes.
- Persist browser state through versioned validation and non-destructive recovery sidecars; surface save failures and retain unsaved values for retry/backup to avoid silent data loss.
- Hold a Web Lock or an atomic IndexedDB readwrite transaction for the entire verification queue; fail closed if neither works, and reread shared timing under the lock to prevent cross-tab overlap.
- Each check result records failure evidence (Discord contacted or not, 429 layer Discord API vs Cloudflare edge, scope, timeout/connection/5xx kind; compact origin marker on error results) and honors X-RateLimit-Remaining/Reset-After before the next request; cooldown/last-check reads reconcile memory, original and recovery copies by the largest valid value (`reconcileTiming`), so blocks are never mislabeled and a recovered value can never shorten a wait.
- Server-side request guarding lives in `src/lib/vanity/server-limiter.ts` (global gap, per-visitor gap, one in-flight per visitor, 429 block for all visitors); it is per-isolate memory because shared storage would add cost, so the browser queue remains the primary limiter.
- 429 handling is centralized in `src/lib/vanity/rate-limit-manager.ts` (tested in rate-limit.test.ts): short per-route Discord 429s are waited out inline and the same code retried; global, Cloudflare, suspected-edge (network error right after a 429) or long waits stop into a persisted cooldown (`cooldownSecondsFor`) that auto-resumes when it ends unless the user paused; a stale pace slowdown decays after 10 min without 429s; the scanner, quick check (same cross-tab lock) and background engine all record shared diagnostics. Why: stopping on every sub-second 429 and requiring manual resume made the scanner look permanently blocked.
- Full-device backup/restore lives in `src/lib/vanity/backup.ts` (tested beside it): restore validates with the same rules as saved data, merges non-destructively (newest check wins), and never exports or imports cooldown/last-check timing.
- Dashboard statistics come only from `src/lib/vanity/stats.ts` (tested beside it): the scanner reports each finished check via `onCheck`, the log (`dvf:stats:v1`) keeps all-time totals, bounded daily aggregates and a bounded recent history, and is seeded once from saved results; charts load lazily so the scanner page stays light.
- Abbreviation library data lives in JSON packs under `src/data/abbreviations/` (auto-loaded via import.meta.glob; standards packs regenerated by `scripts/build-abbreviation-packs.py` from cited sources); dedupe only identical abbreviation+meaning so distinct senses survive, and mark hand-curated packs `verified: false`.
- Library classification (unified groups, code vs abbreviation, ranked search, counters) lives in src/lib/vanity/global-library.ts and is derived from pack fields; new packs are JSON files in src/data/abbreviations built by scripts/, never hand-typed in components.
- VERIFIED AVAILABILITY states are derived only from Discord response evidence in `src/lib/vanity/availability.ts`; CONFIRMED_FREE ("Liberada") requires an explicit official confirmation object because Discord has no public availability endpoint; 404 is NOT_IN_USE, a separate category. Filters, counters, history and CSV derive the category only via `availabilityOf`/`historyAvailability` so each result lands in exactly one category.
- Home-screen install is manifest-only (public/manifest.webmanifest + apple meta in __root); no service worker, since scanning needs the network and an app-shell cache would risk stale builds.
