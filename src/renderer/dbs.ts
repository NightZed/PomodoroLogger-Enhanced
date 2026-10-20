/* istanbul ignore file */
/**
 * The databases live in the main process; the renderer only gets handles to
 * them through `@electron/remote`.
 *
 * Those handles have to be resolved SYNCHRONOUSLY while this module evaluates:
 *
 * - importers capture a database at module evaluation time -- `Timer/action.ts`
 *   and `Kanban/action.ts` wrap `dbs.settingDB` in an `AsyncDB` at the top
 *   level, so an assignment that happens later leaves them holding whatever
 *   `dbs` was at that moment;
 * - `export default dbs` exports the value once (it is not a live binding).
 *
 * Resolving the remote asynchronously therefore left the settings code with the
 * renderer's own `DBs` from `main/db` -- nedb instances that are never loaded
 * (only the main process's copies are). Their reads never call back and their
 * writes stay queued forever, while the UI still changes because the actions
 * update the store before touching the database. Session data kept working
 * because it goes through the web workers, which open the files themselves.
 *
 * `require` is used inside the branches so that jest (which has no
 * `@electron/remote`) never loads the remote module.
 */
type MainDbModule = typeof import('../main/db');

export let refreshDbs: MainDbModule['refreshDbs'];
export let loadDBs: MainDbModule['loadDBs'];
export let dbs: MainDbModule['DBs'];

if (process.env.NODE_ENV === 'test') {
    // Renderer and main share one process under jest: use the real instances.
    const mainDb: MainDbModule = require('../main/db');
    dbs = mainDb.DBs;
    refreshDbs = mainDb.refreshDbs;
    loadDBs = mainDb.loadDBs;
    loadDBs();
} else {
    const remote: typeof import('@electron/remote') = require('@electron/remote');
    dbs = remote.getGlobal('sharedDB');
    const utils: MainDbModule = remote.getGlobal('utils');
    refreshDbs = utils.refreshDbs;
    loadDBs = utils.loadDBs;
}

export default dbs;
