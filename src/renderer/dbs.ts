import type { DbName, DbRepositories } from '../main/db/types';

/**
 * Renderer-side database handles.
 *
 * The main process owns the only SQLite connection. These handles are small
 * IPC proxies through the preload bridge; Jest installs a DB-backed bridge in
 * `test/dbBridge.ts`, so the action tests keep using the same module-level
 * captures they used before (`Timer/action.ts` and `Kanban/action.ts` wrap a
 * handle in an `AsyncDB` while the module graph evaluates).
 */

const dbNames: DbName[] = ['sessionDB', 'settingDB', 'kanbanDB', 'cardsDB', 'listsDB', 'moveDB'];

function createRemoteRepository(name: DbName) {
    const call =
        (operation: string) =>
        (...args: unknown[]) =>
            window.api.dbRequest(name, operation, args);
    return {
        find: call('find'),
        findOne: call('findOne'),
        insert: call('insert'),
        update: call('update'),
        remove: call('remove'),
        count: call('count'),
        aggHistory: call('aggHistory'),
    };
}

export const dbs = Object.fromEntries(
    dbNames.map((name) => [name, createRemoteRepository(name)])
) as unknown as DbRepositories;

export const loadDBs = async (_names?: DbName[]): Promise<void> => {
    await window.api.dbReady();
};

export const refreshDbs = async (): Promise<unknown> => {
    await window.api.dbReady();
    return dbs;
};

export default dbs;
