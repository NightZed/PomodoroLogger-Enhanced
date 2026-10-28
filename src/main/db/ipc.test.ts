import { ipcMain } from 'electron';
import { WorkerMessageType } from '../ipc/type';
import { DBs, loadDBs } from './index';
import { sendWorkerMessage } from '../worker/fork';
import { initializeDbIpc } from './ipc';

jest.mock('electron', () => ({
    ipcMain: { handle: jest.fn() },
}));

jest.mock('./index', () => {
    const repository = () => ({
        find: jest.fn(),
        findOne: jest.fn(),
        insert: jest.fn(),
        update: jest.fn(),
        remove: jest.fn(),
        count: jest.fn(),
        aggHistory: jest.fn(),
        readHistory: jest.fn(),
    });

    return {
        DBs: {
            sessionDB: repository(),
            settingDB: repository(),
            kanbanDB: repository(),
            cardsDB: repository(),
            listsDB: repository(),
            moveDB: repository(),
        },
        loadDBs: jest.fn().mockResolvedValue(undefined),
    };
});

jest.mock('../worker/fork', () => ({
    sendWorkerMessage: jest.fn(),
}));

const handle = ipcMain.handle as jest.Mock;
const loadDBsMock = loadDBs as jest.Mock;
const sendWorkerMessageMock = sendWorkerMessage as jest.Mock;
const repositories = DBs as unknown as Record<string, Record<string, jest.Mock>>;

let handlers: Record<string, (...args: any[]) => any> = {};
const event = {} as any;

function register(trusted = true) {
    handle.mockClear();
    handlers = {};
    initializeDbIpc(() => trusted);
    for (const [name, callback] of handle.mock.calls) {
        handlers[name] = callback;
    }
}

describe('main/db/ipc', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        register();
    });

    it('waits for the database and rejects untrusted senders', async () => {
        await handlers['db:ready'](event);
        expect(loadDBsMock).toHaveBeenCalledTimes(1);

        register(false);
        await expect(handlers['db:ready'](event)).rejects.toThrow(
            'Blocked database IPC from an untrusted sender'
        );
        await expect(handlers['db:request'](event, 'cardsDB', 'find', [])).rejects.toThrow(
            'Blocked database IPC from an untrusted sender'
        );
    });

    it('rejects unknown databases, operations and oversized argument lists', async () => {
        const request = handlers['db:request'];

        await expect(request(event, 'nope', 'find', [])).rejects.toThrow('Unknown database: nope');
        await expect(request(event, 'cardsDB', 'drop', [])).rejects.toThrow(
            'Invalid database operation: drop'
        );
        await expect(request(event, 'cardsDB', 'find ', [])).rejects.toThrow(
            'Invalid database operation: find '
        );
        await expect(request(event, 'cardsDB', 'find', Array(11).fill(0))).rejects.toThrow(
            'Database arguments must be an array of at most 10 entries'
        );

        // The mock repository factory gives every name the same shape; real
        // cards repositories have no history method.
        (repositories.cardsDB as any).aggHistory = undefined;
        await expect(request(event, 'cardsDB', 'aggHistory', [])).rejects.toThrow(
            'Unknown database operation: cardsDB.aggHistory'
        );
    });

    it('forwards an allowed repository call with its arguments', async () => {
        const result = [{ _id: 'card' }];
        repositories.cardsDB.find.mockResolvedValue(result);

        await expect(
            handlers['db:request'](event, 'cardsDB', 'find', [{ _id: 'card' }, { _id: 1 }])
        ).resolves.toBe(result);
        expect(repositories.cardsDB.find).toHaveBeenCalledWith({ _id: 'card' }, { _id: 1 });
    });

    it('aggregates history through the worker and releases the large payload', async () => {
        const data = {
            arg: { yearQuery: {} },
            recentRecords: [1],
            yearRecords: [2],
            periodRecords: [3],
            boards: [],
        };
        repositories.sessionDB.readHistory.mockResolvedValue(data);
        sendWorkerMessageMock.mockResolvedValue({ payload: { total: 3 } });

        await expect(
            handlers['db:request'](event, 'sessionDB', 'aggHistory', [{ yearQuery: {} }])
        ).resolves.toEqual({ total: 3 });

        expect(repositories.sessionDB.readHistory).toHaveBeenCalledWith({ yearQuery: {} }, false);
        expect(sendWorkerMessageMock).toHaveBeenCalledWith(
            { type: WorkerMessageType.AggregateHistory, payload: data },
            120000
        );
        // The main-process copy is cleared after the child received it.
        expect(data.yearRecords).toEqual([]);
        expect(data.periodRecords).toBeUndefined();
        expect(data.recentRecords).toBeUndefined();
    });

    it('falls back to in-process aggregation when the worker fails', async () => {
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
        const historyArg = { yearQuery: {} };
        repositories.sessionDB.readHistory.mockRejectedValue(new Error('worker down'));
        repositories.sessionDB.aggHistory.mockResolvedValue('fallback');

        await expect(
            handlers['db:request'](event, 'sessionDB', 'aggHistory', [historyArg])
        ).resolves.toBe('fallback');

        expect(repositories.sessionDB.aggHistory).toHaveBeenCalledWith(historyArg);
        expect(consoleError).toHaveBeenCalled();
        consoleError.mockRestore();
    });
});
