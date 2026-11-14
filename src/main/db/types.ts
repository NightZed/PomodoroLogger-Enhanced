/**
 * The data-access contract shared by the main process, the renderer's IPC
 * proxy and the tests.
 *
 * It deliberately mirrors the subset of the NeDB API the application used:
 * callers keep their queries and update documents, so the migration is about
 * storage, not about rewriting every action.
 */

export type DbName = 'sessionDB' | 'settingDB' | 'kanbanDB' | 'cardsDB' | 'listsDB' | 'moveDB';

export interface UpdateOptions {
    upsert?: boolean;
    multi?: boolean;
}

export interface RemoveOptions {
    multi?: boolean;
}

export interface HistoryArg {
    recentQuery?: any;
    yearQuery: any;
    periodRange?: { from: number; to: number };
}

export interface DbRepository<T = any> {
    find<R = T>(query?: any, projection?: any): Promise<R[]>;
    findOne<R = T>(query?: any, projection?: any): Promise<R | null>;
    insert<R = T>(docs: R | R[]): Promise<R | R[]>;
    update(query: any, update: any, options?: UpdateOptions): Promise<number>;
    remove(query?: any, options?: RemoveOptions): Promise<number>;
    count(query?: any): Promise<number>;
}

export interface HistoryData {
    arg: HistoryArg;
    recentRecords?: any[];
    yearRecords: any[];
    /**
     * When a month is selected this is a separate query with `apps`, so the
     * full-year scan can stay scalar-only (calendar/total do not need apps).
     */
    periodRecords?: any[];
    boards: { _id: string; name: string }[];
}

export interface SessionRepository extends DbRepository {
    aggHistory(arg: HistoryArg): Promise<any>;
    /**
     * Read the lightweight History input without aggregating it.
     * `parseApps = false` leaves the `apps` column as a JSON string, so the
     * main process can forward it to the aggregation child without building the
     * full object graph twice.
     */
    readHistory(arg: HistoryArg, parseApps?: boolean): Promise<HistoryData>;
    /**
     * One row per session with the app breakdown summed inside SQLite.
     *
     * `json_each` keeps the per-app JSON in the engine; reading the same rows
     * through `findFieldsSync` would parse every app/title breakdown on the
     * main thread, which is the cost the History projections exist to avoid.
     */
    appHoursSync(): AppHoursRow[];
    /**
     * Rewrites `apps` / `stayTimeInSecond` for the given documents, in the
     * caller's transaction. The documents must be complete (read with
     * `findSync`), because the authoritative `doc` column is replaced too.
     */
    applyAppHoursSync(records: any[]): number;
}

/** A session total and the sum of its per-app hours, both in hours. */
export interface AppHoursRow {
    _id: string;
    startTime: number;
    spentTimeInHour: number;
    appHours: number;
}

export interface DbRepositories {
    sessionDB: SessionRepository;
    settingDB: DbRepository;
    kanbanDB: DbRepository;
    cardsDB: DbRepository;
    listsDB: DbRepository;
    moveDB: DbRepository;
}

export const dbNames: DbName[] = [
    'sessionDB',
    'settingDB',
    'kanbanDB',
    'cardsDB',
    'listsDB',
    'moveDB',
];
