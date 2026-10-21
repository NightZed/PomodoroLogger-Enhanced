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

export interface SessionRepository extends DbRepository {
    aggHistory(arg: HistoryArg): Promise<any>;
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
