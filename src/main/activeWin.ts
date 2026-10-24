import * as fs from 'fs';
import * as path from 'path';
import { dbBaseDir } from './config';

let hasPermission = false;
let available = false;

type GetWindowsModule = typeof import('get-windows');

/**
 * get-windows is ESM-only, while the main process bundle is CommonJS. Load it
 * lazily so a missing/failed native addon is reported by initActiveWin()
 * instead of crashing the whole main process at startup. Cache the promise:
 * the monitor calls activeWin() once per tick and must not re-import the
 * module (or retry a known-broken installation) every time.
 */
let getWindowsModulePromise: Promise<GetWindowsModule> | undefined;

function loadGetWindows(): Promise<GetWindowsModule> {
    if (getWindowsModulePromise === undefined) {
        getWindowsModulePromise = import('get-windows');
    }
    return getWindowsModulePromise;
}

/**
 * This module decides whether a session records anything at all: when
 * `available` stays false, `activeWin()` returns `undefined` on every monitor
 * tick and the record is saved with empty `apps` / `switchActivities` /
 * `stayTimeInSecond` (a blank Sankey diagram in History).
 *
 * Packaged builds have no console, so the init result and any failure are also
 * appended to a small log next to the databases, where a bug report can carry
 * it. A packaging mistake that made the old active-win package fail to load
 * (v0.17.0 shipped without @mapbox/node-pre-gyp, which it required at runtime)
 * was completely silent because of this. Keep the legacy `active-win.log`
 * filename so existing bug reports and instructions still find the file.
 */
const statusLogPath = path.join(dbBaseDir, 'active-win.log');
/** The monitor polls every second; log each distinct failure only once. */
const loggedFailures = new Set<string>();

function errorMessage(e: unknown): string {
    return e instanceof Error ? `${e.name}: ${e.message}` : String(e);
}

function appendStatus(message: string): void {
    try {
        fs.appendFileSync(statusLogPath, `[${new Date().toISOString()}] ${message}\n`, {
            encoding: 'utf-8',
        });
    } catch (e) {
        // Diagnostics must never take the app down.
        console.error('getWindows: cannot append to status log', e);
    }
}

function logOnce(key: string, message: string): void {
    if (loggedFailures.has(key)) {
        return;
    }

    loggedFailures.add(key);
    appendStatus(message);
}

export async function initActiveWin() {
    try {
        const { activeWindow } = await loadGetWindows();
        await activeWindow({ screenRecordingPermission: false, accessibilityPermission: false });
        available = true;
        await activeWindow({ screenRecordingPermission: true, accessibilityPermission: true });
        hasPermission = true;
    } catch (e) {
        console.error('getWindows init error:', e);
        appendStatus(`init failed: ${errorMessage(e)}`);
    }

    console.log('Initialized with get-windows?', available);
    console.log('Initialized with get-windows title permission?', hasPermission);
    // The line to look for first when activity data is missing: `available=false`
    // means nothing will be recorded for the rest of this run.
    // Name the backend here as well: this is the only line a packaged build
    // writes on a healthy start, so it is what tells a bug report which
    // package actually ran (and that the migration took effect).
    appendStatus(
        `initialized: backend=get-windows, available=${available}, titlePermission=${hasPermission}`
    );
}

export async function activeWin() {
    if (!available) {
        logOnce('unavailable', 'skipped: get-windows is unavailable (init did not succeed)');
        return;
    }

    try {
        const { activeWindow } = await loadGetWindows();
        return await activeWindow({
            screenRecordingPermission: hasPermission,
            accessibilityPermission: hasPermission,
        });
    } catch (e) {
        // A failing tick only skips this sample, but a repeating failure means
        // lost records, so it must be visible in the log file.
        logOnce(errorMessage(e), `get-windows call failed: ${errorMessage(e)}`);
        return undefined;
    }
}
