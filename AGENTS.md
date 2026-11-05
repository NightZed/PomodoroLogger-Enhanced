# AGENTS.md

Guidance for AI coding agents working in this repository. This is the single source of truth: `CODEBUDDY.md` only contains `@AGENTS.md`, so edit this file, not that one.

## Project

Electron desktop app (Pomodoro timer + Kanban + desktop activity tracking + statistics). Renderer is React 19 + Redux; main process owns SQLite (`better-sqlite3`). Requires Node.js 24+ and Yarn 1.22.

## Shell

Local commands run in **PowerShell 7 (`pwsh`)** — build, test, packaging and process inspection alike. Snippets copied from bash/CI must be translated:

- Env vars are `$env:NAME = '...'`, not a `NAME=x cmd` prefix.
- `$PWD` interpolates inside double quotes (`"$PWD/.local/prod-run"`); forward slashes are fine in paths.
- If execution policy blocks `yarn.ps1`, call `yarn.cmd`.

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
yarn                                # install; postinstall rebuilds native modules (electron-builder install-app-deps)
yarn build                          # tsc --noEmit + both webpack bundles
yarn typecheck                      # tsc --noEmit -p tsconfig.json only
yarn lint                           # eslint src/**/*.{ts,tsx} test/**/*.{ts,js}
yarn test                           # jest --forceExit
yarn test src/renderer/components/Timer/Timer.test.tsx   # single file
yarn test -t "some test name"       # single test by name
yarn test:watch
yarn test:coverage
```

Team workflow: `/init` continues to write `CODEBUDDY.md`; after running it, move the content into this file and restore the `@AGENTS.md` stub.

Development (two terminals — `yarn start` does NOT launch Electron itself):

```powershell
yarn start        # webpack main (watch) + renderer dev server on :2003
npx electron .    # second terminal
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
yarn start:prod -- --user-data-dir="$PWD/.local/prod-run"

$env:APPDATA = "$PWD/.local/prod-appdata"
yarn start:prod -- --user-data-dir="$PWD/.local/prod-run"

yarn pack         # electron-builder --dir
yarn dist-win     # or dist-mac / dist-linux / dist-all (each one is a separate script)
```

CI (`.github/workflows/test.yml`) runs `yarn lint`, `yarn typecheck` and `yarn test -- --ci` on every push/PR. Releases are cut manually via the `Build/release` workflow → semantic-release; never bump `package.json` version or create tags by hand.

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

### CPU-heavy work

- `src/main/worker/fork.ts` lazily forks `worker.js` for History aggregation (tokenizing every window title for the word cloud). It shuts the child down after 60s idle and `src/main/db/ipc.ts` falls back to in-process aggregation if the worker fails.
- The renderer's remaining web workers (`src/renderer/workers`) are tokenizer and KNN training only; `DBWorker` is a thin wrapper over the IPC proxies.

### Renderer state & UI

- `src/renderer/store/index.ts` is plain Redux + thunk; `src/renderer/reducers/index.ts` combines `timer`, `history`, `kanban`, `story`. Each feature folder (`components/Timer`, `History`, `Kanban`, `UserGuide`) owns its `action.ts` + reducer + tests — follow that pattern rather than adding cross-cutting slices.
- `src/renderer/components/appTabs.ts` is the single source of truth for pages; the tab bar, Ctrl+Tab handling and compact-mode transitions all derive from `APP_TABS` / `planTabChange`. Do not add a parallel tab list.
- The title bar keeps `-webkit-app-region: drag` so normal windows get the native move and Aero Snap, but Chromium clips that region once a scroller is scrolled (the cut strip follows the scroller's width). Any press that still reaches the renderer on the bar must therefore start `windowDrag` too, otherwise the window cannot be moved after scrolling — see `docs/title-bar-drag-after-scroll.md`.
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
`yarn typecheck`. The renderer reads strings through `useI18n()` (function
components) or the module level `t()` (class components, helpers, constant
tables); the main process has its own `m()` in `src/main/i18n.ts`.
`Setting.language` (`'system' | 'en' | 'zh'`) lives in the `timer` slice and
reaches the first paint through `additionalArguments`, exactly like the theme.
Keep `language` in the `settingUiStates` / `uiStateNames` / `trayStateKeys`
whitelists. See `docs/i18n.md`.

### Activity tracking & statistics

`src/renderer/monitor` collects the active window (`src/main/activeWin.ts` wraps `get-windows`, lazily imported and logged to `active-win.log`), aggregates per-app/per-title time into a `PomodoroRecord`, optionally captures screenshots, and saves sessions through the DB proxy. Efficiency scoring lives in `src/shared/efficiency/efficiency.ts`; history aggregation in `src/utils/aggPomodoro.ts` and `src/shared/dataMerger`.

### Development time scale

`src/config.ts` compresses the timer in non-production by `DEBUG_TIME_SCALE` (120): writes use `scaleMs`, reads expand back to nominal, statistics stay nominal. Any new timer/session code must go through these helpers or the dev clock, progress ring and history totals disagree.

## Testing conventions

- `jest.config.js` uses `jsdom`, Babel transforms, `maxWorkers: min(8, cpus)`, 30s per-test timeout, and JUnit output (`junit.xml`). `test/setup-env.js` pins `NODE_ENV=test` and polyfills `matchMedia`/`MessageChannel`/`ResizeObserver` for antd.
- `setupFilesAfterEnv` wiring in `test/` provides the DB bridge, React act environment, jsdom compat and console gating — new tests get these automatically.
- `posttest` deletes `.local/test`; action tests exercise real SQLite transactions, so prefer repository-level assertions over mocks.

## Conventions

- Commit messages must follow Conventional Commits (commitlint); the type decides the semantic-release version. Husky + lint-staged run prettier and `eslint --fix` on staged files.
- Keep renderer code free of Node globals — filesystem paths and native modules belong in `src/main`.

## Keeping this file accurate

This document drifts as the code changes; treat it as a claim to verify, not as ground truth. Before relying on a command, path or behavior described here, confirm it against `package.json`, the config files or the source.

When a task proves a statement here wrong or incomplete (a script was renamed, a file moved, a behavior changed, a constraint was lifted), update this file in the same change and say so in the hand-off. Prefer editing the existing entry over appending a note about the old one. Keep it dense: commands, non-obvious constraints and cross-file architecture only — no generic engineering advice.
