import _activeWin from 'active-win';
import * as fs from 'fs';
import * as path from 'path';
import { dbBaseDir } from '../config';

let hasPermission = false;
let available = false;

/**
 * This module decides whether a session records anything at all: when
 * `available` stays false, `activeWin()` returns `undefined` on every monitor
 * tick and the record is saved with empty `apps` / `switchActivities` /
 * `stayTimeInSecond` (a blank Sankey diagram in History).
 *
 * Packaged builds have no console, so the init result and any failure are also
 * appended to a small log next to the databases, where a bug report can carry
 * it. A packaging mistake that made active-win fail to load (v0.17.0 shipped
 * without @mapbox/node-pre-gyp, which active-win requires at runtime) was
 * completely silent because of this.
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
        console.error('activeWin: cannot append to status log', e);
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
        await _activeWin({ screenRecordingPermission: false, accessibilityPermission: false });
        available = true;
        await _activeWin({ screenRecordingPermission: true, accessibilityPermission: true });
        hasPermission = true;
    } catch (e) {
        console.error('activeWin init error:', e);
        appendStatus(`init failed: ${errorMessage(e)}`);
    }

    console.log('Initialized with activeWin?', available);
    console.log('Initialized with activeWin title permission?', hasPermission);
    // The line to look for first when activity data is missing: `available=false`
    // means nothing will be recorded for the rest of this run.
    appendStatus(`initialized: available=${available}, titlePermission=${hasPermission}`);
}

export async function activeWin() {
    if (!available) {
        logOnce('unavailable', 'skipped: active-win is unavailable (init did not succeed)');
        return;
    }

    try {
        return await _activeWin({
            screenRecordingPermission: hasPermission,
            accessibilityPermission: hasPermission,
        });
    } catch (e) {
        // A failing tick only skips this sample, but a repeating failure means
        // lost records, so it must be visible in the log file.
        logOnce(errorMessage(e), `active-win call failed: ${errorMessage(e)}`);
        return undefined;
    }
}
