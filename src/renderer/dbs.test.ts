/**
 * Renderer database handles.
 *
 * Production always talks to `window.api`; there is no renderer-side SQLite
 * connection or `require('../main/db')` fallback. The Jest setup
 * (`test/dbBridge.ts`) backs the same API with the real in-memory repositories
 * so the action tests keep exercising actual queries.
 */
describe('renderer database handles', () => {
    it('forwards repository calls through the preload bridge', async () => {
        const dbRequest = jest.fn().mockResolvedValue([{ _id: 'a' }]);
        const dbReady = jest.fn().mockResolvedValue(undefined);
        (window as any).api = { ...(window as any).api, dbRequest, dbReady };

        let exported: any;
        jest.isolateModules(() => {
            exported = require('./dbs');
        });

        await expect(exported.dbs.sessionDB.find({ _id: 'a' }, { _id: 1 })).resolves.toEqual([
            { _id: 'a' },
        ]);
        expect(dbRequest).toHaveBeenCalledWith('sessionDB', 'find', [{ _id: 'a' }, { _id: 1 }]);

        await exported.loadDBs();
        expect(dbReady).toHaveBeenCalledTimes(1);

        await exported.refreshDbs();
        expect(dbReady).toHaveBeenCalledTimes(2);
        expect(exported.default).toBe(exported.dbs);
    });
});
