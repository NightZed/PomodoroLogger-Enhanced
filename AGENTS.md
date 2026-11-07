# AGENTS.md

Guidance for AI coding agents working in this repository. This is the single source of truth: `CODEBUDDY.md` only contains `@AGENTS.md`, so edit this file, not that one.

## Project

Electron desktop app (Pomodoro timer + Kanban + desktop activity tracking + statistics). Renderer is React 19 + Redux; main process owns SQLite (`better-sqlite3`). Requires Node.js 24+ and pnpm 11 (pinned in `packageManager`).

## Shell

Local commands run in **PowerShell 7 (`pwsh`)** — build, test, packaging and process inspection alike. Snippets copied from bash/CI must be translated:

- Env vars are `$env:NAME = '...'`, not a `NAME=x cmd` prefix.
- `$PWD` interpolates inside double quotes (`"$PWD/.local/prod-run"`); forward slashes are fine in paths.
- If execution policy blocks `pnpm.ps1`, call `pnpm.cmd`.

Process/memory inspection belongs here rather than in bash: `ps -W` reports no memory or CPU, and `tasklist` output depends on the console code page.

```powershell
# Session/process tree, filtered to this checkout so other Electron apps are safe
Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -match [regex]::Escape('PomodoroLogger-Enhanced') } |
  Select-Object ProcessId, ParentProcessId, Name

Get-Process -Name electron |
  Select-Object Id, @{n='WS_MB';e={[math]::Round($_.WorkingSet64/1MB,1)}},
                   @{n='Private_MB';e={[math]::Round($_.PrivateMemorySize64/1MB,1)}}

taskkill /PID <pid> /T /F      # Electron children do not die with the parent
Get-NetTCPConnection -LocalPort 2003 -State Listen | Select-Object OwningProcess
```

## Commands

```powershell
pnpm                                # install; postinstall rebuilds native modules (electron-builder install-app-deps)
pnpm build                          # tsc --noEmit + both webpack bundles
pnpm typecheck                      # tsc --noEmit -p tsconfig.json only
pnpm lint                           # eslint src/**/*.{ts,tsx} test/**/*.{ts,js}
pnpm test                           # jest --forceExit
pnpm test src/renderer/components/Timer/Timer.test.tsx   # single file
pnpm test -t "some test name"       # single test by name
pnpm test:watch
pnpm test:coverage
```

Team workflow: `/init` continues to write `CODEBUDDY.md`; after running it, move the content into this file and restore the `@AGENTS.md` stub.

Development (two terminals — `pnpm start` does NOT launch Electron itself):

```powershell
pnpm start        # webpack main (watch) + renderer dev server on :2003
npx electron .    # second terminal; downloads Electron on first run
```

Production build / packaging:

```powershell
# Build + run the production bundle. The release build takes a single-instance
# lock per Electron profile, so without a separate profile this run quits
# immediately whenever the installed app is open (src/main/init.ts).
# Only Electron's profile moves: the SQLite database still lives under
# %APPDATA%\PomodoroLogger (src/main/config.ts), i.e. this run reads and writes
# the same data as the installed app. The $env: line below also redirects the
# data directory (it stays set for the rest of the shell session).
pnpm start:prod -- --user-data-dir="$PWD/.local/prod-run"

$env:APPDATA = "$PWD/.local/prod-appdata"
pnpm start:prod -- --user-data-dir="$PWD/.local/prod-run"

pnpm run pack     # electron-builder --dir (pnpm pack alone builds an npm tarball)
pnpm run dist-win # or dist-mac / dist-linux / dist-all (each one is a separate script)
```

CI (`.github/workflows/test.yml`) runs `pnpm lint`, `pnpm typecheck` and `pnpm test --ci` on every push/PR; `build.yml` packages with `pnpm exec electron-builder` per OS (the old `action-electron-builder` was removed because it hard-codes yarn). Releases are cut manually via the `Build/release` workflow → semantic-release; never bump `package.json` version or create tags by hand.

### Package manager

pnpm 11, pinned in `packageManager`. `pnpm-workspace.yaml` is the only place for
install behaviour: `nodeLinker: hoisted` (electron-builder needs a flat
`node_modules`), `overrides` (replaces yarn's `resolutions`), and `allowBuilds`.
pnpm 11 defaults `strictDepBuilds` to `true`, so a dependency with an unreviewed
install script fails the whole install with a non-zero exit — list it as `true`
or `false` instead of relying on a warning. `electron` 44 and `better-sqlite3`
13 ship no install script: the former downloads its binary on the first
`electron .`, the latter loads its bundled `prebuilds/`.

`pnpm pack` is a built-in command and does **not** run `scripts.pack`; use
`pnpm run pack`. The store lives outside the repo (configured globally, on this
machine `E:\pnpm-store`) and must sit on the same drive as the checkout,
otherwise pnpm silently copies instead of hard-linking.

## Build toolchain constraints

- Babel 8 (`babel-loader`) transpiles everything in webpack and Jest. There is **no** `ts-loader` / `ts-jest`: `typescript` is aliased to `@typescript/typescript6` because typescript-eslint needs the TS 6 JS compiler API, while `@typescript/native` provides the `tsc` used for type-checking only. Adding a loader that needs the TS compiler API will break the build.
- Bundles: `dist/main.js` (entry `src/main/main.ts`), `dist/preload.js`, `dist/worker.js` (child-process worker), `dist/app.js` + `dist/index.html` (renderer). `.tsx` alone gets the React transform, so generic arrow functions in `.ts` files stay unambiguous — keep `preset-react` scoped to `.tsx`.
- Native/ESM-only modules (`better-sqlite3`, `get-windows`, `electron-updater`) are webpack `externals` in the main build and are shimmed for Jest through `moduleNameMapper` / `transformIgnorePatterns` in `jest.config.js`.

## Architecture

### Process & security model

- `src/main/main.ts` reads the hardware-acceleration setting synchronously (before `app.ready`) and then dynamically imports `src/main/init.ts`, which creates the frameless/transparent `BrowserWindow` (`sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`), the tray, close-to-tray behavior, window-mode handling and the auto-updater.
- The renderer reaches the main process only through `src/main/preload.ts`, which exposes a narrow `window.api` (`ExposedAPI` in `src/main/ipc/type.ts`). Every channel name, payload shape and sender is validated on the main side (`src/main/ipc/ipc.ts` `handleCommand` + `src/main/ipc/validate.ts`). When adding a capability, extend the type union, the preload method and the main handler together.
- All in-app messages go through the feedback layer (`src/renderer/components/feedback`): `feedback.toast` / `notice` / `confirm` / `alert`. Importing antd's `message` / `notification` directly is blocked by `no-restricted-imports`. Content dialogs must use `AppModal` (`src/renderer/components/AppModal.tsx`), which applies the shared instant dialog motion; importing antd's `Modal` directly is blocked too. antd's click ripple is disabled globally in `Application` because software rendering (the default) turns its 2s animation into a full-window 60fps repaint.

### Data layer (single writer)

- The main process owns the only SQLite connection (`src/main/db/index.ts`, `connection.ts`, `schema.ts`, `repository.ts`). Repositories mirror the old NeDB API (`find`/`findOne`/`insert`/`update`/`remove`/`count`) so action code did not have to be rewritten.
- The renderer never touches SQLite. `src/renderer/dbs.ts` builds IPC proxies named `sessionDB`, `settingDB`, `kanbanDB`, `cardsDB`, `listsDB`, `moveDB`; `src/main/db/ipc.ts` whitelists database names and the seven allowed operations. Tests install a real in-memory bridge in `test/dbBridge.ts` instead.
- Legacy NeDB → SQLite migration runs inside `initializeDatabaseFile()` (`migrate.ts`), keeping the old `.nedb` files untouched and backing up to `db-bk/pre-sqlite-<ts>`.
- `NODE_ENV=test` switches the database to `:memory:` and pins the data directory to `.local/test` (`src/main/config.ts`); dev runs use `.local/dev`; production uses `%APPDATA%\PomodoroLogger`.

### Diagnostics (logs & crash page)

- `src/main/log.ts` is the only component that writes log files. They live in `<dataDir>/logs` (production `%APPDATA%\PomodoroLogger\logs`), split by scope: `app.log`, `active-win.log`, `crash.log`, `data.log`; `migration.log` is written once by `migrate.ts` into the same folder. Diagnostics never go into `db/` and never into the asar.
- Levels are `debug < info < warn < error` (`src/shared/log.ts`); production defaults to `info`, dev and tests to `debug`, and `--log-level` / `POMODORO_LOG_LEVEL` override the stored setting. `crash` and `data` ignore the level entirely (see `LEVEL_EXEMPT_SCOPES`). Writes are synchronous (a crash report has to survive `app.exit`), bounded by a 1 MiB rotation per file, a 5 s identical-message window and 20 lines per second.
- `ImportData` writes its outcome to `data.log` at every exit: the JSON parser's message, or up to 500 of the validator's findings (`ValidationResult.recordedIssues`, split into <8 KiB blocks) when the file is refused, or the resulting record counts and merge warnings when it is accepted. The dialog only shows the first 20 (`ValidationResult.issues`) and offers an **Open Log Folder** button. `ClearUserFiles` logs the completion of a delete-all.
- A renderer crash is sent over `IpcEventName.ReportError` (`send`), written to `crash.log`, and then shown on the full-window `src/renderer/components/ErrorScreen.tsx`. **The app no longer restarts itself**; restart is a button on that page. `AppErrorBoundary` must stay *outside* `Application` in `app.tsx` — a boundary inside it unmounts together with the tree it is supposed to replace. The page draws its own drag bar and caption buttons because the frameless window has no native ones.
- Main-process failures are recorded by `src/main/crashHandlers.ts` (`uncaughtException` / `unhandledRejection`) and `installWindowDiagnostics()` in `init.ts` (`did-fail-load`, `preload-error`, `unresponsive`, `render-process-gone`, `child-process-gone`).

### CPU-heavy work

- `src/main/worker/fork.ts` lazily forks `worker.js` for History aggregation (tokenizing every window title for the word cloud). It shuts the child down after 60s idle and `src/main/db/ipc.ts` falls back to in-process aggregation if the worker fails.
- The renderer's remaining web worker (`src/renderer/workers`) is the tokenizer; `DBWorker` is a thin wrapper over the IPC proxies.

### Renderer state & UI

- `src/renderer/store/index.ts` is plain Redux + thunk; `src/renderer/reducers/index.ts` combines `timer`, `history`, `kanban`, `story`. Each feature folder (`components/Timer`, `History`, `Kanban`, `UserGuide`) owns its `action.ts` + reducer + tests — follow that pattern rather than adding cross-cutting slices.
- `src/renderer/components/appTabs.ts` is the single source of truth for pages; the tab bar, Ctrl+Tab handling and compact-mode transitions all derive from `APP_TABS` / `planTabChange`. Do not add a parallel tab list.
- Inactive pages are not kept forever: `DestroyOnTimeoutWrapper` drops a page's subtree after a per-page grace period (`TAB_UNLOAD_DELAY` in `Application.tsx`). The delays differ on purpose — history re-runs the whole `aggHistory` aggregation on every mount, kanban only re-reads the board rows, setting can still have an import/export in flight — so a new page needs an explicit entry, and shrinking a delay is a behaviour change, not a free win. `timer` stays mounted permanently because it owns the running session. With `unloadOnCloseToTray` on, a hidden window squeezes that grace to `HIDDEN_TAB_UNLOAD_DELAY` (30s), so a new page has to be wired into both places.
- The title bar keeps `-webkit-app-region: drag` so normal windows get the native move and Aero Snap, but Chromium clips that region once a scroller is scrolled (the cut strip follows the scroller's width). Any press that still reaches the renderer on the bar must therefore start `windowDrag` too, otherwise the window cannot be moved after scrolling — see `src/renderer/components/AppTitleBar/dragRegion.ts` and `src/main/ipc/windowDrag.ts`.
- `src/components/**` is the shared visualization/widget library (`Visualization/*`, `common/*`) imported from the renderer with relative paths — it is not the renderer's own component tree.
- Theme: `src/renderer/theme` (tokens + `applyTheme`, CSS custom properties `--pl-*`) is applied through `ThemeController`. The first-paint theme crosses the process boundary via `additionalArguments` → `window.api.initialTheme` so the renderer never flashes the wrong theme; keep both sides in sync when touching startup theming.
- Styling is styled-components (plus a few `.scss` global files); do not add standalone CSS files for components.

### Internationalization

The UI ships English and Simplified Chinese with a small custom `t()`, not an
i18n library — the renderer has no provider, so bare `render(<Component />)`
tests keep working and a switch re-renders components guarded by `React.memo` /
`shouldComponentUpdate`. `src/shared/i18n/en.ts` is the source of truth for the
key tree and interpolation signatures; `zh.ts` is typed as
`CatalogShape<typeof en>`, so a missing key or a wrong parameter list fails
`pnpm typecheck`. The renderer reads strings through `useI18n()` (function
components) or the module level `t()` (class components, helpers, constant
tables); the main process has its own `m()` in `src/main/i18n.ts`.
`Setting.language` (`'system' | 'en' | 'zh'`) lives in the `timer` slice and
reaches the first paint through `additionalArguments`, exactly like the theme.
Keep `language` in the `settingUiStates` / `uiStateNames` / `trayStateKeys`
whitelists. See `docs/i18n.md`.

### Activity tracking & statistics

`src/renderer/monitor` collects the active window (`src/main/activeWin.ts` wraps `get-windows`, lazily imported and logged to `logs/active-win.log`), aggregates per-app/per-title time into a `PomodoroRecord`, optionally captures screenshots, and saves sessions through the DB proxy. Efficiency scoring lives in `src/shared/efficiency/efficiency.ts`; history aggregation in `src/utils/aggPomodoro.ts` and `src/shared/dataMerger`.

### Development time scale

`src/config.ts` compresses the timer in non-production by `DEBUG_TIME_SCALE` (120): writes use `scaleMs`, reads expand back to nominal, statistics stay nominal. Any new timer/session code must go through these helpers or the dev clock, progress ring and history totals disagree.

## Testing conventions

- `jest.config.js` uses `jsdom`, Babel transforms, `maxWorkers: min(8, cpus)`, 30s per-test timeout, and JUnit output (`junit.xml`). `test/setup-env.js` pins `NODE_ENV=test` and polyfills `matchMedia`/`MessageChannel`/`ResizeObserver` for antd.
- `setupFilesAfterEnv` wiring in `test/` provides the DB bridge, React act environment, jsdom compat and console gating — new tests get these automatically.
- `posttest` deletes `.local/test`; action tests exercise real SQLite transactions, so prefer repository-level assertions over mocks.

## Conventions

- Commit messages must follow Conventional Commits (commitlint); the type decides the semantic-release version. Husky + lint-staged run prettier and `eslint --fix` on staged files.
- Undo an unpushed commit by rewriting it, not by reverting: `git reset --soft <base>` (or `git reset --hard` when the work is disposable), then commit the intended change. `revert:` is not a type semantic-release understands, so a revert commit adds a changelog entry the release never wanted, while the entry it cancels stays behind and describes a feature that no longer ships. `git status -sb` says whether the commits are still local (`ahead N`); once they are on `origin`, rewrite nothing and revert instead.
- Keep renderer code free of Node globals — filesystem paths and native modules belong in `src/main`.

## Keeping this file accurate

This document drifts as the code changes; treat it as a claim to verify, not as ground truth. Before relying on a command, path or behavior described here, confirm it against `package.json`, the config files or the source.

When a task proves a statement here wrong or incomplete (a script was renamed, a file moved, a behavior changed, a constraint was lifted), update this file in the same change and say so in the hand-off. Prefer editing the existing entry over appending a note about the old one. Keep it dense: commands, non-obvious constraints and cross-file architecture only — no generic engineering advice.
