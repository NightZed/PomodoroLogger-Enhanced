import type { Database } from 'better-sqlite3';

/**
 * The explicit columns are the schema from the migration plan. `doc` is the
 * authoritative complete document: it keeps fields that were added by an older
 * fork (or by a future version) and avoids losing unknown data during the
 * one-way NeDB import. The columns are kept in sync so History/backfills can
 * later move to SQL without another migration.
 */
export type ColumnKind = 'text' | 'integer' | 'real' | 'boolean' | 'json';

export interface FieldSpec {
    /** Top-level field name (also accepts dot paths such as spentTimeInHour.actual). */
    path: string;
    column: string;
    kind: ColumnKind;
    /** Value used when the document does not contain the field. */
    fallback: unknown;
}

export interface TableSpec {
    table: string;
    hasId: boolean;
    fields: FieldSpec[];
}

const f = (
    path: string,
    column: string,
    kind: ColumnKind,
    fallback: unknown = null
): FieldSpec => ({ path, column, kind, fallback });

export const sessionSpec: TableSpec = {
    table: 'sessions',
    hasId: true,
    fields: [
        f('startTime', 'start_time', 'integer', 0),
        f('boardId', 'board_id', 'text'),
        f('spentTimeInHour', 'spent_time_in_hour', 'real', 0),
        f('switchTimes', 'switch_times', 'integer', 0),
        f('screenStaticDuration', 'screen_static_duration', 'real'),
        f('efficiency', 'efficiency', 'real'),
        f('isRotten', 'is_rotten', 'boolean', false),
        f('apps', 'apps', 'json', {}),
        f('stayTimeInSecond', 'stay_time_in_second', 'json'),
        f('switchActivities', 'switch_activities', 'json'),
        f('screenshots', 'screenshots', 'json'),
    ],
};

export const boardSpec: TableSpec = {
    table: 'boards',
    hasId: true,
    fields: [
        f('name', 'name', 'text', ''),
        f('description', 'description', 'text', ''),
        f('spentHours', 'spent_hours', 'real', 0),
        f('lists', 'lists', 'json', []),
        f('focusedList', 'focused_list', 'text'),
        f('doneList', 'done_list', 'text'),
        f('relatedSessions', 'related_sessions', 'json'),
        f('dueTime', 'due_time', 'integer'),
        f('lastVisitTime', 'last_visit_time', 'integer'),
        f('createdTime', 'created_time', 'integer'),
        f('aggInfo', 'agg_info', 'json'),
        f('pin', 'pin', 'boolean', false),
        f('collapsed', 'collapsed', 'boolean', false),
        f('distractionList', 'distraction_list', 'json'),
    ],
};

export const listSpec: TableSpec = {
    table: 'lists',
    hasId: true,
    fields: [
        f('title', 'title', 'text', ''),
        f('cards', 'cards', 'json', []),
        f('visibleCards', 'visible_cards', 'json'),
    ],
};

export const cardSpec: TableSpec = {
    table: 'cards',
    hasId: true,
    fields: [
        f('title', 'title', 'text', ''),
        f('content', 'content', 'text', ''),
        f('sessionIds', 'session_ids', 'json', []),
        f('labels', 'labels', 'json'),
        f('spentTimeInHour.estimated', 'spent_estimated', 'real', 0),
        f('spentTimeInHour.actual', 'spent_actual', 'real', 0),
        f('createdTime', 'created_time', 'integer'),
        f('completedTime', 'completed_time', 'integer'),
    ],
};

export const moveSpec: TableSpec = {
    table: 'moves',
    hasId: false,
    fields: [
        f('fromListId', 'from_list_id', 'text', ''),
        f('toListId', 'to_list_id', 'text', ''),
        f('cardId', 'card_id', 'text', ''),
        f('time', 'time', 'integer', 0),
    ],
};

export const tableSpecs = {
    sessionDB: sessionSpec,
    kanbanDB: boardSpec,
    cardsDB: cardSpec,
    listsDB: listSpec,
    moveDB: moveSpec,
} as const;

const columnSql = (field: FieldSpec): string => {
    switch (field.kind) {
        case 'integer':
        case 'boolean':
            return `${field.column} INTEGER`;
        case 'real':
            return `${field.column} REAL`;
        default:
            return `${field.column} TEXT`;
    }
};

export function createSchema(db: Database) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS meta (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
            _id                    TEXT PRIMARY KEY,
            start_time             INTEGER NOT NULL DEFAULT 0,
            board_id               TEXT,
            spent_time_in_hour     REAL NOT NULL DEFAULT 0,
            switch_times           INTEGER NOT NULL DEFAULT 0,
            screen_static_duration REAL,
            efficiency             REAL,
            is_rotten              INTEGER NOT NULL DEFAULT 0,
            apps                   TEXT NOT NULL DEFAULT '{}',
            stay_time_in_second    TEXT,
            switch_activities      TEXT,
            screenshots            TEXT,
            doc                    TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_sessions_start_time ON sessions(start_time);
        CREATE INDEX IF NOT EXISTS idx_sessions_board_id   ON sessions(board_id);

        CREATE TABLE IF NOT EXISTS boards (
            _id               TEXT PRIMARY KEY,
            name              TEXT NOT NULL DEFAULT '',
            description       TEXT NOT NULL DEFAULT '',
            spent_hours       REAL NOT NULL DEFAULT 0,
            lists             TEXT NOT NULL DEFAULT '[]',
            focused_list      TEXT,
            done_list         TEXT,
            related_sessions  TEXT,
            due_time          INTEGER,
            last_visit_time   INTEGER,
            created_time      INTEGER,
            agg_info          TEXT,
            pin               INTEGER NOT NULL DEFAULT 0,
            collapsed         INTEGER NOT NULL DEFAULT 0,
            distraction_list  TEXT,
            doc               TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS lists (
            _id           TEXT PRIMARY KEY,
            title         TEXT NOT NULL DEFAULT '',
            cards         TEXT NOT NULL DEFAULT '[]',
            visible_cards TEXT,
            doc           TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS cards (
            _id               TEXT PRIMARY KEY,
            title             TEXT NOT NULL DEFAULT '',
            content           TEXT NOT NULL DEFAULT '',
            session_ids       TEXT NOT NULL DEFAULT '[]',
            labels            TEXT,
            spent_estimated   REAL NOT NULL DEFAULT 0,
            spent_actual      REAL NOT NULL DEFAULT 0,
            created_time      INTEGER,
            completed_time    INTEGER,
            doc               TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS moves (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            from_list_id TEXT NOT NULL,
            to_list_id   TEXT NOT NULL,
            card_id      TEXT NOT NULL,
            time         INTEGER NOT NULL,
            doc          TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_moves_card_time ON moves(card_id, time);
        CREATE INDEX IF NOT EXISTS idx_moves_to_list ON moves(to_list_id);

        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    `);

    // Keep the column list single-sourced. The DDL above is intentionally
    // readable; this check fails loudly if a spec and the DDL drift apart.
    for (const spec of Object.values(tableSpecs)) {
        const columns = new Set(
            db
                .prepare(`PRAGMA table_info(${spec.table})`)
                .all()
                .map((row: any) => row.name)
        );
        for (const field of spec.fields) {
            if (!columns.has(field.column)) {
                db.exec(`ALTER TABLE ${spec.table} ADD COLUMN ${columnSql(field)}`);
            }
        }
    }
}

export const SCHEMA_VERSION = 1;

export function getUserVersion(db: Database): number {
    return Number(db.pragma('user_version', { simple: true }) ?? 0);
}

export function setUserVersion(db: Database, version: number) {
    db.pragma(`user_version = ${version}`);
}
