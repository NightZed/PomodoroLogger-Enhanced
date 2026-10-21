import { ipcMain } from 'electron';
import { DBs, loadDBs } from './index';
import { DbName } from './types';

export const DB_REQUEST_CHANNEL = 'db:request';
export const DB_READY_CHANNEL = 'db:ready';

/**
 * The renderer never opens a SQLite connection. It sends the same repository
 * calls it used to make through `@electron/remote` (plus the db worker), and
 * the main process performs them on the single writer connection.
 */
export function initializeDbIpc() {
    ipcMain.handle(DB_READY_CHANNEL, async () => {
        await loadDBs();
    });

    ipcMain.handle(
        DB_REQUEST_CHANNEL,
        async (_event, name: DbName, operation: string, args: any[] = []) => {
            await loadDBs();
            const repository = DBs[name] as any;
            if (!repository) {
                throw new Error(`Unknown database: ${name}`);
            }
            if (operation === 'aggHistory') {
                return repository.aggHistory(...args);
            }
            if (typeof repository[operation] !== 'function') {
                throw new Error(`Unknown database operation: ${name}.${operation}`);
            }
            return repository[operation](...args);
        }
    );
}
