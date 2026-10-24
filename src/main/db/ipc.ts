import { ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { DbEventName, WorkerMessageType } from '../ipc/type';
import { sendWorkerMessage } from '../worker/fork';
import { DBs, loadDBs } from './index';
import { dbNames, DbName } from './types';

type SenderGuard = (event: IpcMainInvokeEvent) => boolean;

/** The complete set of repository methods the renderer proxies. */
const allowedOperations = new Set([
    'find',
    'findOne',
    'insert',
    'update',
    'remove',
    'count',
    'aggHistory',
]);

/**
 * The renderer never opens a SQLite connection. It sends the same repository
 * calls it used to make through `@electron/remote` (plus the db worker), and
 * the main process performs them on the single writer connection.
 *
 * The channel names, repository names and operation names are all checked
 * here: a compromised renderer cannot reach arbitrary functions or even a
 * differently-cased method name through this generic-looking bridge.
 */
export function initializeDbIpc(isTrustedSender: SenderGuard = () => true) {
    const assertSender = (event: IpcMainInvokeEvent) => {
        if (!isTrustedSender(event)) {
            throw new Error('Blocked database IPC from an untrusted sender');
        }
    };

    ipcMain.handle(DbEventName.Ready, async (event) => {
        assertSender(event);
        await loadDBs();
    });

    ipcMain.handle(
        DbEventName.Request,
        async (event, name: DbName, operation: string, args: any[] = []) => {
            assertSender(event);

            if (typeof name !== 'string' || !dbNames.includes(name)) {
                throw new Error(`Unknown database: ${name}`);
            }
            if (
                typeof operation !== 'string' ||
                !/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(operation) ||
                !allowedOperations.has(operation)
            ) {
                throw new Error(`Invalid database operation: ${operation}`);
            }
            if (!Array.isArray(args) || args.length > 10) {
                throw new Error('Database arguments must be an array of at most 10 entries');
            }

            await loadDBs();
            const repository = DBs[name] as any;
            if (!repository) {
                throw new Error(`Unknown database: ${name}`);
            }
            if (name === 'sessionDB' && operation === 'aggHistory') {
                try {
                    // Tokenizing every title for the word cloud is CPU-heavy.
                    // The child process keeps Electron's main event loop free,
                    // so the renderer can paint its spinner immediately.
                    // Keep `apps` as JSON text in the main process. The child
                    // parses it once; previously main parsed it and then IPC
                    // serialized the whole object graph again.
                    const data = await repository.readHistory(args[0], false);
                    const request = sendWorkerMessage(
                        {
                            type: WorkerMessageType.AggregateHistory,
                            payload: data,
                        },
                        120000
                    );
                    // `sendWorkerMessage` serializes synchronously before
                    // returning; drop the main-process references so a large
                    // All-time payload is not kept alive while the child works.
                    data.yearRecords = [];
                    data.periodRecords = undefined;
                    data.recentRecords = undefined;
                    const response = await request;
                    return response.payload;
                } catch (error) {
                    // A worker/package problem must not take History down. The
                    // in-process path is slower but still correct.
                    console.error('[db] history aggregate worker failed, falling back', error);
                    return repository.aggHistory(...args);
                }
            }
            if (typeof repository[operation] !== 'function') {
                throw new Error(`Unknown database operation: ${name}.${operation}`);
            }
            return repository[operation](...args);
        }
    );
}
