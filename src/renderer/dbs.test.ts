/**
 * Regression test for settings not being read from / written to the database.
 *
 * `dbs` must already point at the main process's handles while the module
 * graph evaluates, because `Timer/action.ts` and `Kanban/action.ts` capture
 * `dbs.settingDB` in a module-level `AsyncDB`. When the remote was resolved
 * with a dynamic `import()`, `export default dbs` kept the renderer's own
 * `DBs` instead: those nedb instances are never loaded, so settings reads
 * never called back and writes stayed queued, while the UI still updated.
 */
describe('renderer database handles', () => {
    const originalNodeEnv = process.env.NODE_ENV;

    afterEach(() => {
        process.env.NODE_ENV = originalNodeEnv;
        jest.dontMock('@electron/remote');
        jest.resetModules();
    });

    it('resolves the main process databases synchronously outside jest', () => {
        const sharedDB = { settingDB: {} };
        const utils = {
            refreshDbs: jest.fn(),
            loadDBs: jest.fn(),
        };
        jest.doMock('@electron/remote', () => ({
            __esModule: true,
            getGlobal: (name: string) => (name === 'sharedDB' ? sharedDB : utils),
        }));

        process.env.NODE_ENV = 'development';

        let exported: any;
        jest.isolateModules(() => {
            exported = require('./dbs');
        });

        expect(exported.default).toBe(sharedDB);
        expect(exported.dbs).toBe(sharedDB);
        expect(exported.loadDBs).toBe(utils.loadDBs);
        expect(exported.refreshDbs).toBe(utils.refreshDbs);
    });
});
