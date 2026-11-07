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
| `data.log` | Import results and every import problem (up to 500 findings), including the ones the dialog could not show; completion of a delete-all |
| `migration.log` | The one-off NeDB → SQLite report, overwritten on each migration |

Every line starts with the local timestamp -- with its UTC offset -- and a six
character process id. Local time is what the user saw; the offset keeps the
instant unambiguous when the file is compared with another machine:

```
2026-11-05T19:12:33.451+08:00 [k3f9qa] ERROR crash: renderer react: Cannot read properties of undefined
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

`crash` and `data` records ignore the level: a crash log that could be silenced
by a setting would defeat its purpose, and the import dialog promises that the
complete finding list is in the log folder. Each file is rotated at 1 MiB and
keeps three archives (`.1`, `.2`, `.3`); identical messages are collapsed for
5 s and no scope writes more than 20 lines per second.

## Import problems

The import dialog shows at most 20 findings; the validator records up to 500
for `data.log` (and counts anything beyond that, so the total is never lost).
Entries are split into blocks under 8 KiB so the logger's per-detail cap never
cuts the list. Only the file *name* is recorded, never its full path:

```
2026-11-07T10:12:33.451+08:00 [k3f9qa] WARN  data: import refused (validation) file="backup.json" bytes=48213 issues=137
    records[3].startTime: is missing; a finite number is required
    records[4]._id: must be a string
    ...
```

A successful import writes one line with the resulting counts
(`records=`, `cards=`, `lists=`, `boards=`, `move=`, `warnings=`), followed by
the merge warnings when there are any.

## Asking a user for logs

1. Settings → System → Logging → **Debug**, reproduce the problem, set it back.
2. **Open Log Folder** and attach `app.log` and `crash.log` to the report.
   For an import that failed or had to adjust entries, attach `data.log` too --
   the dialogs about those problems carry an **Open Log Folder** button.

Logs never contain window titles or application names: `active-win.log` only
records whether the activity backend initialized.

## Crash page

A React render failure is caught by `AppErrorBoundary` (`src/renderer/app.tsx`)
and replaced by `ErrorScreen`; the app does not restart by itself. The page
offers **Restart**, **Quit**, **Copy Details** and **Open Log Folder**, and shows
the log folder plus the session id. Non-React errors (`window 'error'`,
`unhandledrejection`) are reported to `crash.log` but leave the UI in place,
because React is still healthy in that case.
