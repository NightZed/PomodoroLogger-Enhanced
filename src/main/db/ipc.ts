import { ipcMain } from 'electron';
import { DbEventName, WorkerMessageType } from '../ipc/type';
import { sendWorkerMessage } from '../worker/fork';
import { DBs, loadDBs } from './index';
import { DbName } from './types';

/**
 * The renderer never opens a SQLite connection. It sends the same repository
 * calls it used to make through `@electron/remote` (plus the db worker), and
 * the main process performs them on the single writer connection.
 */
export function initializeDbIpc() {
    ipcMain.handle(DbEventName.Ready, async () => {
        await loadDBs();
    });

    ipcMain.handle(
        DbEventName.Request,
        async (_event, name: DbName, operation: string, args: any[] = []) => {
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
