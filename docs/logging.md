# Logs and the crash page

Pomodoro Logger Enhanced writes diagnostics to `<dataDir>/logs`:

| Build | Folder |
| --- | --- |
| installed | `%APPDATA%\PomodoroLogger\logs` |
| dev (`pnpm start`) | `<repo>/.local/dev/logs` |
| tests | `<repo>/.local/test/logs` (deleted by `posttest`) |

`<dataDir>` is the folder the settings page opens with **Open Data Folder**;
logs sit beside `db/`, `db-bk/` and `screenshots/`, never inside `db/`.

## Files

| File | Contents |
| --- | --- |
| `app.log` | Start banner (version, Electron, platform, log level), update pipeline, IPC failures, worker fallbacks, migration summary |
| `active-win.log` | Activity backend initialization and failures (the legacy name is kept on purpose) |
| `crash.log` | Renderer crash reports, `uncaughtException`, `unhandledRejection`, `render-process-gone`, `child-process-gone`, `did-fail-load`, preload errors |
| `migration.log` | The one-off NeDB → SQLite report, overwritten on each migration |

Every line starts with the ISO timestamp and a six character process id:

```
2026-11-05T09:12:33.451Z [k3f9qa] ERROR crash: renderer react: Cannot read properties of undefined
    Error: Cannot read properties of undefined
        at Timer.render (dist/app.js:1:12345)
```

The same session id is shown on the error page, so a screenshot can be matched
to a log line without asking for the file.

## Levels

`debug < info < warn < error`. Production defaults to `info`, development and
tests to `debug`. The settings page (**System → Logging**) changes it and
applies immediately; the value is stored in the settings table and read at
startup. A command-line flag or environment variable wins over the setting:

```powershell
pnpm start:prod -- --log-level=debug
$env:POMODORO_LOG_LEVEL = 'debug'; pnpm start:prod
```

`crash` records ignore the level: a crash log that could be silenced by a
setting would defeat its purpose. Each file is rotated at 1 MiB and keeps three
archives (`.1`, `.2`, `.3`); identical messages are collapsed for 5 s and no
scope writes more than 20 lines per second.

## Asking a user for logs

1. Settings → System → Logging → **Debug**, reproduce the problem, set it back.
2. **Open Log Folder** and attach `app.log` and `crash.log` to the report.

Logs never contain window titles or application names: `active-win.log` only
records whether the activity backend initialized.

## Crash page

A React render failure is caught by `AppErrorBoundary` (`src/renderer/app.tsx`)
and replaced by `ErrorScreen`; the app does not restart by itself. The page
offers **Restart**, **Quit**, **Copy Details** and **Open Log Folder**, and shows
the log folder plus the session id. Non-React errors (`window 'error'`,
`unhandledrejection`) are reported to `crash.log` but leave the UI in place,
because React is still healthy in that case.
