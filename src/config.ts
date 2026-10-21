/* istanbul ignore file */
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { uid } from './utils/uid';

const appdataDir =
    process.env.APPDATA ||
    (process.platform === 'darwin'
        ? process.env.HOME + '/Library/Preferences'
        : process.env.HOME + '/.local/share');
export const baseDir = join(appdataDir, 'PomodoroLogger');
if (!existsSync(baseDir)) {
    // recursive: the platform appdata parent (e.g. ~/.local/share on a fresh CI
    // container) is not guaranteed to exist yet.
    mkdirSync(baseDir, { recursive: true });
}

const dbDir = process.env.NODE_ENV !== 'test' ? 'db' : '__test__db';
const dbBkDir = process.env.NODE_ENV !== 'test' ? 'db-bk' : '__test__db-bk';
const scDir = process.env.NODE_ENV !== 'test' ? 'screenshots' : '__test__screenshots';
export const dbBaseDir = process.env.NODE_ENV === 'production' ? join(baseDir, dbDir) : dbDir;
export const dbBkBaseDir = process.env.NODE_ENV === 'production' ? join(baseDir, dbBkDir) : dbBkDir;
export const screenshotDir = process.env.NODE_ENV === 'production' ? join(baseDir, scDir) : scDir;

if (!existsSync(dbBaseDir)) {
    mkdirSync(dbBaseDir);
}

if (!existsSync(screenshotDir)) {
    mkdirSync(screenshotDir);
}

/**
 * Legacy NeDB files. They are read once by the migrator and then kept on disk
 * untouched for at least one major version (see MIGRATION.md).
 */
export const dbPaths = {
    sessionDB: join(dbBaseDir, 'session.nedb'),
    settingDB: join(dbBaseDir, 'setting.nedb'),
    kanbanDB: join(dbBaseDir, 'kanban.nedb'),
    cardsDB: join(dbBaseDir, 'cards.nedb'),
    listsDB: join(dbBaseDir, 'lists.nedb'),
    moveDB: join(dbBaseDir, 'moveCard.nedb'),
};

export const sqlitePath = join(dbBaseDir, 'pomodoro.sqlite');

if (process.env.NODE_ENV === 'test') {
    for (const key in dbPaths) {
        // @ts-ignore
        dbPaths[key] = `${dbPaths[key]}${uid()}`;
    }
}

let asarDirName;
let dir = __dirname;
let oldDir = undefined;
while (!dir.endsWith('.asar')) {
    if (oldDir === dir) {
        break;
    }

    oldDir = dir;
    dir = dirname(dir);
}

if (dir.endsWith('.asar')) {
    asarDirName = dirname(dir);
}

export const env = {
    electronAsarDir: asarDirName ? join(asarDirName, 'electron.asar') : undefined,
    appAsarDir: asarDirName ? join(asarDirName, 'app.asar') : undefined,
};

export const modelPath = {
    knnPath: join(dbBaseDir, 'modelKnn.json'),
};

export const DEBUG_TIME_SCALE = 120;
export const __DEV__ = process.env.NODE_ENV === 'development';

/**
 * The factor the countdown clock runs at: `DEBUG_TIME_SCALE` outside
 * production, `1` in production.
 *
 * This is a *time span* scale, applied on both sides of `targetTime`:
 *
 * - writes compress the nominal duration (`scaleMs`), so a dev session of 25
 *   minutes ends after 25/120 minutes of wall time;
 * - reads expand the wall-clock span back to nominal before showing or
 *   comparing it (see `countdownSeconds` / `progressPercent` /
 *   `elapsedSeconds` in `Timer/sessionState.ts`).
 *
 * Statistics stay nominal: `spentTimeInHour` counts the configured duration,
 * and the monitor's wall-clock recordings are multiplied back up by the same
 * factor when a session is staged (`Timer.onFocusingSessionDone`).
 *
 * Mixing the two -- a compressed span measured against a nominal duration --
 * is what used to leave the dev progress ring stuck at ~99%, show `00:13`
 * instead of `25:00` for a fresh session, and report a session almost fully
 * elapsed the moment it started.
 *
 * The gate is `!== 'production'` -- exactly what `startTimer` has always
 * used, so no environment changes behaviour. (The screenshot interval is the
 * one setting that scales under its own `=== 'development'` gate in
 * `setScreenShotInterval`; its persisted value must stay untouched in tests.)
 */
export function timeScale(): number {
    return process.env.NODE_ENV !== 'production' ? DEBUG_TIME_SCALE : 1;
}

/** Compress a nominal duration into the wall time the dev clock uses. */
export function scaleMs(nominalMs: number): number {
    return nominalMs / timeScale();
}
