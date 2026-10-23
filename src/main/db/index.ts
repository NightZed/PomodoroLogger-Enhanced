import Database from 'better-sqlite3';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { dbBkBaseDir, dbBaseDir, dbPaths, sqlitePath } from '../config';
import { aggHistory } from '../../utils/aggPomodoro';
import { openSqlite } from './connection';
import { migrateNedbToSqlite } from './migrate';
import {
    boardSpec,
    cardSpec,
    createSchema,
    getUserVersion,
    listSpec,
    moveSpec,
    SCHEMA_VERSION,
    sessionSpec,
    setUserVersion,
} from './schema';
import { createSessionRepository, SettingsRepository, SqliteRepository } from './repository';
import { DbName, DbRepositories } from './types';

export { dbNames, type DbName, type DbRepositories } from './types';
export { migrateNedbToSqlite, readLegacyDocuments } from './migrate';

const isTest = process.env.NODE_ENV === 'test';

let database: Database.Database | undefined;
export let DBs: DbRepositories = undefined as unknown as DbRepositories;

function makeRepositories(db: Database.Database): DbRepositories {
    const sessions = new SqliteRepository(db, sessionSpec);
    return {
        sessionDB: createSessionRepository(
            db,
            sessions,
            (arg, recentRecords, yearRecords, boards, periodRecords) => {
                const boardNames: { [boardId: string]: string } = {};
                for (const board of boards) {
                    boardNames[board._id] = board.name;
                }
                return aggHistory(
                    recentRecords ?? yearRecords,
                    yearRecords,
                    boardNames,
                    arg.periodRange,
                    periodRecords
                );
            }
        ),
        settingDB: new SettingsRepository(db),
        kanbanDB: new SqliteRepository(db, boardSpec),
        cardsDB: new SqliteRepository(db, cardSpec),
        listsDB: new SqliteRepository(db, listSpec),
        moveDB: new SqliteRepository(db, moveSpec),
    };
}

function initializeDatabaseFile(): Database.Database {
    const hasLegacy = Object.values(dbPaths).some((path) => existsSync(path));
    let targetVersion = 0;
    if (existsSync(sqlitePath)) {
        try {
            const probe = new Database(sqlitePath, { readonly: true });
            targetVersion = getUserVersion(probe);
            probe.close();
        } catch {
            targetVersion = 0;
        }
    }

    if (targetVersion < SCHEMA_VERSION && hasLegacy) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        migrateNedbToSqlite({
            target: sqlitePath,
            backupDir: join(dbBkBaseDir, `pre-sqlite-${timestamp}`),
            logPath: join(dbBaseDir, 'migration.log'),
        });
    }

    const db = openSqlite(sqlitePath);
    createSchema(db);
    if (getUserVersion(db) < SCHEMA_VERSION) {
        setUserVersion(db, SCHEMA_VERSION);
    }
    return db;
}

function ensureDatabase(): Database.Database {
    if (database) {
        return database;
    }

    database = isTest ? openSqlite(':memory:') : initializeDatabaseFile();
    createSchema(database);
    DBs = makeRepositories(database);
    return database;
}

// Tests create repositories at module-evaluation time: several action modules
// capture `dbs.<name>` in a module-level `AsyncDB`, exactly like the renderer
// captured its remote handles before this migration.
if (isTest) {
    ensureDatabase();
}

/**
 * Kept for the existing startup/import flow. SQLite has one long-lived
 * connection, so "loading" a collection is now only a readiness check.
 */
export async function loadDBs(_names?: DbName[]): Promise<void> {
    ensureDatabase();
}

export async function refreshDbs(): Promise<DbRepositories> {
    ensureDatabase();
    return DBs;
}

/**
 * Run a synchronous multi-statement write on the single connection. Import
 * uses this so a failure cannot leave the user with an empty database.
 */
export function runInTransaction<T>(callback: () => T): T {
    return ensureDatabase().transaction(callback)();
}

function readLegacySettings(): Record<string, any> {
    try {
        const content = readFileSync(dbPaths.settingDB, { encoding: 'utf-8' });
        const lines = content.split(/\r?\n/).filter((line) => !!line.trim());
        for (let index = lines.length - 1; index >= 0; index -= 1) {
            try {
                return JSON.parse(lines[index]);
            } catch {
                // A crash can leave a truncated last line. Try the previous one.
            }
        }
    } catch {
        // Missing old file is the normal first-run case.
    }
    return {};
}

/**
 * Synchronous read used before the window exists (hardware acceleration and
 * the first-paint theme). It must not open the writable long-lived connection:
 * `main.ts` runs before `app.ready`, and `init.ts` only needs a value.
 */
export function readSettingsSync(): Record<string, any> {
    if (database) {
        return (DBs.settingDB as SettingsRepository).getAllSync();
    }

    if (existsSync(sqlitePath)) {
        let connection: Database.Database | undefined;
        try {
            connection = new Database(sqlitePath, { readonly: true });
            const rows = connection.prepare('SELECT key, value FROM settings').all() as {
                key: string;
                value: string;
            }[];
            if (rows.length > 0) {
                const settings: Record<string, any> = { name: 'setting' };
                for (const row of rows) {
                    try {
                        settings[row.key] = JSON.parse(row.value);
                    } catch {
                        settings[row.key] = row.value;
                    }
                }
                return settings;
            }
        } catch {
            // Fall through to the old file: a corrupt/partial SQLite database
            // must not keep the app from choosing a safe theme.
        } finally {
            try {
                connection?.close();
            } catch {
                // ignore
            }
        }
    }

    return readLegacySettings();
}

export function readSettingValueSync<T = any>(key: string): T | undefined {
    return readSettingsSync()[key];
}

/** Test hook: closes the connection so a test can start from a clean file. */
export function closeDatabase() {
    try {
        database?.close();
    } finally {
        database = undefined;
        DBs = undefined as unknown as DbRepositories;
    }
}
