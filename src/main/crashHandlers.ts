import { app, dialog } from 'electron';
import { getLogDir, logError } from './log';
import { m } from './i18n';

/**
 * Last-resort handlers for the main process.
 *
 * Without these an exception thrown outside a promise chain kills the process
 * silently -- on Windows a packaged build has no console, so nothing is left
 * behind at all. `appendFileSync` (inside `log.ts`) is used instead of any
 * async write precisely because the event loop may not run again.
 *
 * A main-process exception leaves the app in an unknown state, so the app is
 * exited after telling the user where the log is. It is deliberately *not*
 * relaunched: a startup crash would otherwise become a restart loop, which is
 * what this change set out to remove.
 */
let installed = false;

export function installCrashHandlers(): void {
    if (installed) {
        return;
    }
    installed = true;

    process.on('uncaughtException', (error) => {
        logError('crash', 'main: uncaught exception', error);
        showCrashDialog(error);
        app.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
        logError('crash', 'main: unhandled rejection', reason);
    });
}

function showCrashDialog(error: unknown): void {
    try {
        const body = m('native.dialog.crashBody', getLogDir());
        dialog.showErrorBox(m('native.dialog.crashTitle'), body);
    } catch {
        // No dialog backend (or no database for `m()` yet): the log file is
        // written either way, which is the part that matters.
        void error;
    }
}
