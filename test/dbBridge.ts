/**
 * Jest stand-in for the preload database bridge.
 *
 * Production `renderer/dbs.ts` always talks to `window.api`; there is no
 * renderer-side `require('../main/db')` branch left. Tests still want the real
 * in-memory repositories, so this setup installs a small bridge backed by the
 * same main-process module. Individual tests may replace `window.api` with
 * their own mock after this file has run.
 */
import { DBs, loadDBs } from '../src/main/db';
import type { DbName } from '../src/main/db/types';

const api = (window as any).api ?? {};

api.dbReady = async () => {
    await loadDBs();
};

api.dbRequest = async (name: DbName, operation: string, args: unknown[] = []) => {
    await loadDBs();
    const repository = (DBs as any)[name];
    if (!repository) {
        throw new Error(`Unknown database: ${name}`);
    }
    if (typeof repository[operation] !== 'function') {
        throw new Error(`Unknown database operation: ${name}.${operation}`);
    }
    return repository[operation](...args);
};

(window as any).api = api;
