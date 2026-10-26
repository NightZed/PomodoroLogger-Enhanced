/* istanbul ignore file */
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { uid } from '../utils/uid';

/**
 * Main-process filesystem layout.
 *
 * The renderer only needs the pure time-scale helpers from `src/config.ts`;
 * keeping every `fs`/`path` access here is what lets the renderer run with
 * `nodeIntegration: false` and `sandbox: true`.
 */

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

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

/**
 * Development and test runs keep their files inside one ignored folder at the
 * repository root (`<repo>/.local/dev` or `<repo>/.local/test`) instead of
 * scattering `db/`, `db-bk/` and `screenshots/` next to the sources. The whole
 * folder can be deleted at any time without touching tracked files, and it
 * never collides with the README assets in `docs/images/`.
 */
const localDataDir = join(process.cwd(), '.local', isTest ? 'test' : 'dev');

export const dbBaseDir = isProduction ? join(baseDir, 'db') : join(localDataDir, 'db');
export const dbBkBaseDir = isProduction ? join(baseDir, 'db-bk') : join(localDataDir, 'db-bk');
export const screenshotDir = isProduction
    ? join(baseDir, 'screenshots')
    : join(localDataDir, 'screenshots');

if (!existsSync(dbBaseDir)) {
    // recursive: the development/test parent (`.local/<env>`) is not guaranteed
    // to exist yet.
    mkdirSync(dbBaseDir, { recursive: true });
}

if (!existsSync(screenshotDir)) {
    mkdirSync(screenshotDir, { recursive: true });
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
