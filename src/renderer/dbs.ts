import type { DbName, DbRepositories } from '../main/db/types';

/**
 * Renderer-side database handles.
 *
 * The main process owns the only SQLite connection. In the app these handles
 * are small IPC proxies; under Jest they point directly at the in-memory
 * repositories, so action tests keep using the same module-level captures they
 * used before (`Timer/action.ts` and `Kanban/action.ts` wrap a handle in an
 * `AsyncDB` while the module graph evaluates).
 */

type MainDbModule = typeof import('../main/db');

const dbNames: DbName[] = ['sessionDB', 'settingDB', 'kanbanDB', 'cardsDB', 'listsDB', 'moveDB'];

export let refreshDbs: () => Promise<unknown>;
export let loadDBs: (names?: DbName[]) => Promise<void>;
export let dbs: DbRepositories;

function createRemoteRepository(name: DbName, invoke: (...args: any[]) => Promise<any>) {
    const call =
        (operation: string) =>
        (...args: any[]) =>
            invoke('db:request', name, operation, args);
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

if (process.env.NODE_ENV === 'test') {
    const mainDb: MainDbModule = require('../main/db');
    dbs = mainDb.DBs;
    refreshDbs = mainDb.refreshDbs;
    loadDBs = mainDb.loadDBs;
    void loadDBs();
} else {
    const { ipcRenderer } = require('electron');
    const invoke = (...args: any[]) => ipcRenderer.invoke(...args);
    dbs = Object.fromEntries(
        dbNames.map((name) => [name, createRemoteRepository(name, invoke)])
    ) as unknown as DbRepositories;
    loadDBs = async () => {
        await ipcRenderer.invoke('db:ready');
    };
    refreshDbs = async () => {
        await ipcRenderer.invoke('db:ready');
        return dbs;
    };
}

export default dbs;
