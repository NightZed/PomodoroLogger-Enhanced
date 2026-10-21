import type { Database } from 'better-sqlite3';
import {
    copyFileSync,
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    renameSync,
    rmSync,
    writeFileSync,
} from 'fs';
import { basename, dirname, join } from 'path';
import { dbPaths } from '../../config';
import { openSqlite } from './connection';
import {
    boardSpec,
    cardSpec,
    createSchema,
    listSpec,
    moveSpec,
    SCHEMA_VERSION,
    sessionSpec,
    setUserVersion,
} from './schema';
import { SettingsRepository, SqliteRepository } from './repository';

export interface MigrationOptions {
    /** Final SQLite file. A `.tmp` sibling is used while importing. */
    target: string;
    /** Source NeDB files. Missing files are ignored. */
    legacyPaths?: Partial<Record<keyof typeof dbPaths, string>>;
    /** Copy of the original files, e.g. db-bk/pre-sqlite-<timestamp>/. */
    backupDir?: string;
    /** Human-readable import report. */
    logPath?: string;
}

export interface MigrationStats {
    imported: Record<string, number>;
    skipped: Record<string, number>;
    backupDir?: string;
}

interface LegacyDocument {
    doc: any;
    skipped: number;
}

/**
 * NeDB's persistence format is one JSON document per line. A hard crash can
 * leave a truncated last line; that line is counted and skipped instead of
 * making the whole import unusable.
 */
export function readLegacyDocuments(filename: string): LegacyDocument[] {
    if (!existsSync(filename)) {
        return [];
    }

    const lines = readFileSync(filename, { encoding: 'utf-8' }).split(/\r?\n/);
    const docs: LegacyDocument[] = [];
    let skipped = 0;
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index].trim();
        if (!line) {
            continue;
        }
        try {
            docs.push({ doc: JSON.parse(line), skipped: 0 });
        } catch {
            skipped += 1;
        }
    }
    if (docs.length > 0 && skipped > 0) {
        docs[docs.length - 1].skipped = skipped;
    }
    return docs;
}

function copyLegacyFiles(paths: Partial<Record<string, string>>, backupDir: string) {
    mkdirSync(backupDir, { recursive: true });
    const copied = new Set<string>();
    for (const source of Object.values(paths)) {
        if (source && existsSync(source) && !source.endsWith('~')) {
            copyFileSync(source, join(backupDir, basename(source)));
            copied.add(basename(source));
        }
    }

    // Preserve unknown/older collections too (for example the unused
    // projects.nedb). The import deliberately ignores them, but a rollback
    // must still find the complete old directory.
    for (const source of Object.values(paths)) {
        if (!source) {
            continue;
        }
        for (const file of readdirSync(dirname(source))) {
            if (!file.endsWith('.nedb') || copied.has(file)) {
                continue;
            }
            copyFileSync(join(dirname(source), file), join(backupDir, file));
        }
    }
}

function importTable(
    db: Database,
    spec: typeof sessionSpec,
    filename: string | undefined,
    stats: MigrationStats,
    tableName: string
) {
    if (!filename || !existsSync(filename)) {
        stats.imported[tableName] = 0;
        stats.skipped[tableName] = 0;
        return 0;
    }

    const documents = readLegacyDocuments(filename);
    const repository = new SqliteRepository(db, spec);
    let imported = 0;
    let skipped = 0;

    for (const entry of documents) {
        skipped += entry.skipped;
        try {
            repository.insert(entry.doc);
            imported += 1;
        } catch {
            skipped += 1;
        }
    }

    stats.imported[tableName] = imported;
    stats.skipped[tableName] = skipped;
    return imported;
}

function importSettings(db: Database, filename: string | undefined, stats: MigrationStats) {
    if (!filename || !existsSync(filename)) {
        stats.imported.settings = 0;
        stats.skipped.settings = 0;
        return;
    }

    const documents = readLegacyDocuments(filename);
    const latest = documents[documents.length - 1]?.doc;
    if (!latest) {
        stats.imported.settings = 0;
        stats.skipped.settings = documents.reduce((sum, entry) => sum + entry.skipped, 0);
        return;
    }

    const repository = new SettingsRepository(db);
    repository.insert({ ...latest, name: 'setting' });
    stats.imported.settings = 1;
    stats.skipped.settings = documents.reduce((sum, entry) => sum + entry.skipped, 0);
}

function writeMigrationLog(logPath: string | undefined, stats: MigrationStats, target: string) {
    if (!logPath) {
        return;
    }
    mkdirSync(dirname(logPath), { recursive: true });
    const lines = [
        `date=${new Date().toISOString()}`,
        `target=${target}`,
        ...Object.keys(stats.imported).map(
            (table) => `${table}: imported=${stats.imported[table]} skipped=${stats.skipped[table]}`
        ),
        ...(stats.backupDir ? [`backup=${stats.backupDir}`] : []),
    ];
    writeFileSync(logPath, lines.join('\n') + '\n', { encoding: 'utf-8' });
}

/**
 * Imports the old NeDB files into a fresh SQLite database.
 *
 * The target is written through a temporary sibling and only renamed after
 * `user_version` has been set, so a failed import never leaves a database that
 * looks migrated but is missing rows.
 */
export function migrateNedbToSqlite(options: MigrationOptions): MigrationStats {
    const legacyPaths = { ...dbPaths, ...options.legacyPaths };
    const temp = `${options.target}.tmp`;
    const stats: MigrationStats = { imported: {}, skipped: {} };

    if (options.backupDir) {
        copyLegacyFiles(legacyPaths, options.backupDir);
        stats.backupDir = options.backupDir;
    }

    rmSync(temp, { force: true });
    const db = openSqlite(temp);
    try {
        createSchema(db);
        importTable(db, sessionSpec, legacyPaths.sessionDB, stats, 'sessions');
        importTable(db, boardSpec, legacyPaths.kanbanDB, stats, 'boards');
        importTable(db, cardSpec, legacyPaths.cardsDB, stats, 'cards');
        importTable(db, listSpec, legacyPaths.listsDB, stats, 'lists');
        importTable(db, moveSpec, legacyPaths.moveDB, stats, 'moves');
        // projectDB deliberately does not exist: nothing ever read it.
        importSettings(db, legacyPaths.settingDB, stats);

        setUserVersion(db, SCHEMA_VERSION);
        db.pragma('wal_checkpoint(TRUNCATE)');
        db.close();

        mkdirSync(dirname(options.target), { recursive: true });
        rmSync(options.target, { force: true });
        renameSync(temp, options.target);
        writeMigrationLog(options.logPath, stats, options.target);
        return stats;
    } catch (error) {
        try {
            db.close();
        } catch {
            // The original import error is more useful than a close error.
        }
        rmSync(temp, { force: true });
        throw error;
    }
}
