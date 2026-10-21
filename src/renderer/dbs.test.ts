/**
 * Renderer database handles.
 *
 * In Jest they point at the main process's in-memory repositories, so the
 * module-level `AsyncDB` captures in Timer/Kanban actions keep working. In the
 * packaged app they are IPC proxies to the single main-process connection.
 */
describe('renderer database handles', () => {
    const originalNodeEnv = process.env.NODE_ENV;

    afterEach(() => {
        process.env.NODE_ENV = originalNodeEnv;
        jest.dontMock('electron');
        jest.resetModules();
    });

    it('uses the main process repositories synchronously under jest', () => {
        const exported = require('./dbs');
        const mainDb = require('../main/db');
        expect(exported.dbs).toBe(mainDb.DBs);
        expect(exported.default).toBe(mainDb.DBs);
    });

    it('forwards repository calls over IPC outside jest', async () => {
        const invoke = jest.fn().mockResolvedValue([{ _id: 'a' }]);
        jest.doMock('electron', () => ({ ipcRenderer: { invoke } }));
        process.env.NODE_ENV = 'development';

        let exported: any;
        jest.isolateModules(() => {
            exported = require('./dbs');
        });

        await expect(exported.dbs.sessionDB.find({ _id: 'a' }, { _id: 1 })).resolves.toEqual([
            { _id: 'a' },
        ]);
        expect(invoke).toHaveBeenCalledWith('db:request', 'sessionDB', 'find', [
            { _id: 'a' },
            { _id: 1 },
        ]);
    });
});
