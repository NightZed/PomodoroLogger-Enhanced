import { app } from 'electron';
import { readSettingValueSync } from './db';
import { isLogLevel } from '../shared/log';
import { configureLogging, writeSessionBanner } from './log';
import { installCrashHandlers } from './crashHandlers';
import './worker/fork';

// Reads SQLite when it exists, or the pre-migration setting.nedb on the first
// start. This must run before app.ready, so it deliberately does not open the
// long-lived database connection.
const useHardwareAcceleration = readSettingValueSync<boolean>('useHardwareAcceleration');
if (!useHardwareAcceleration) {
    if (process.platform !== 'darwin') {
        app.commandLine.appendSwitch('disable-gpu');
        app.commandLine.appendSwitch('disable-software-rasterizer');
    }
    app.disableHardwareAcceleration();
}

/**
 * Logging has to be ready before anything else can fail, and the level has to
 * come from the settings database read above (the renderer only learns about
 * `logLevel` later). A corrupt value falls back to the default instead of
 * throwing here: this runs before `app.ready`, where an exception means the
 * app never shows a window at all.
 *
 * Priority: `--log-level` > `POMODORO_LOG_LEVEL` > stored setting > default.
 */
function resolveLogLevel() {
    const flagIndex = process.argv.findIndex((arg) => arg === '--log-level');
    const fromFlag = flagIndex >= 0 ? process.argv[flagIndex + 1] : undefined;
    if (isLogLevel(fromFlag)) {
        return fromFlag;
    }

    if (isLogLevel(process.env.POMODORO_LOG_LEVEL)) {
        return process.env.POMODORO_LOG_LEVEL;
    }

    let stored: unknown;
    try {
        stored = readSettingValueSync('logLevel');
    } catch {
        stored = undefined;
    }

    if (isLogLevel(stored)) {
        return stored;
    }

    return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

const logLevel = resolveLogLevel();
configureLogging({ level: logLevel });
installCrashHandlers();
writeSessionBanner({
    version: app.getVersion(),
    electron: process.versions.electron,
    platform: process.platform,
    arch: process.arch,
    level: logLevel,
});

// Fix setTimeout not reliable problem
// See https://github.com/electron/electron/issues/7079#issuecomment-325706135
app.commandLine.appendSwitch('disable-background-timer-throttling');
import('./init');
