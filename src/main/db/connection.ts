import Database from 'better-sqlite3';
import { dirname } from 'path';
import { mkdirSync } from 'fs';

export function openSqlite(filename: string): Database.Database {
    if (filename !== ':memory:') {
        mkdirSync(dirname(filename), { recursive: true });
    }
    const db = new Database(filename);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    return db;
}
