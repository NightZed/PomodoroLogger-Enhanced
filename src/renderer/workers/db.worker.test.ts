import nedb from 'nedb';
import { dbPaths } from '../../config';
// Registers the worker's message handler on `self` (jsdom's window).
import './db.worker';

type Pending = { resolve: (v: any) => void; reject: (e: Error) => void };
const pending = new Map<number, Pending>();

const rpc = (type: string, payload: any, code: number): Promise<any> =>
    new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            pending.delete(code);
            reject(new Error(`no answer for ${type} (${code})`));
        }, 20000);
        pending.set(code, {
            resolve: (v) => {
                clearTimeout(timer);
                resolve(v);
            },
            reject: (e) => {
                clearTimeout(timer);
                reject(e);
            },
        });
        window.dispatchEvent(new MessageEvent('message', { data: { type, payload, code } }));
    });

const withPath = (path: string, args: any[]) => ({ args, path });

describe('db worker', () => {
    beforeAll(() => {
        (window as any).postMessage = (msg: any) => {
            const waiter = pending.get(msg.code);
            if (!waiter) {
                return;
            }

            pending.delete(msg.code);
            if (msg.type === 'error') {
                waiter.reject(new Error(String(msg.payload)));
                return;
            }

            waiter.resolve(msg.payload);
        };
    });

    it('loads a file once even when several requests need it at the same time', async () => {
        const loadSpy = jest.spyOn(nedb.prototype, 'loadDatabase');

        // Fired back to back, i.e. while the first load is still running. Each
        // one used to start its own loadDatabase() on the same file, and each
        // load rewrote the whole file (see deferCompaction).
        const [first, second, third] = await Promise.all([
            rpc('count', withPath(dbPaths.sessionDB, [{}]), 1),
            rpc('count', withPath(dbPaths.sessionDB, [{}]), 2),
            rpc('count', withPath(dbPaths.sessionDB, [{ startTime: { $gt: 0 } }]), 3),
        ]);

        expect([first, second, third]).toEqual([0, 0, 0]);
        expect(loadSpy).toHaveBeenCalledTimes(1);
        loadSpy.mockRestore();
    });

    it('resolves project names itself, so the caller needs no board list', async () => {
        await rpc(
            'insert',
            withPath(dbPaths.kanbanDB, [{ _id: 'board-1', name: 'Board One', lists: [] }]),
            11
        );
        const startTime = new Date(new Date().getFullYear(), 0, 2).getTime();
        await rpc(
            'insert',
            withPath(dbPaths.sessionDB, [
                {
                    _id: 'session-1',
                    startTime,
                    spentTimeInHour: 1.5,
                    boardId: 'board-1',
                    apps: {},
                },
            ]),
            12
        );

        const ans = await rpc(
            'aggHistory',
            {
                path: dbPaths.sessionDB,
                kanbanPath: dbPaths.kanbanDB,
                yearQuery: { startTime: { $gte: startTime, $lt: startTime + 1000 } },
            },
            13
        );

        expect(ans.total).toEqual({ count: 1, usedTime: 1.5 });
        expect(ans.pieChart.projectData).toEqual([{ name: 'Board One', value: 1.5 }]);
    });

    it('slices the month for the badge while the calendar keeps the whole year', async () => {
        const year = new Date().getFullYear();
        const march = new Date(year, 2, 15, 10).getTime();
        const june = new Date(year, 5, 15, 10).getTime();
        await rpc(
            'insert',
            withPath(dbPaths.sessionDB, [
                [
                    {
                        _id: 'session-march',
                        startTime: march,
                        spentTimeInHour: 1,
                        boardId: 'board-1',
                        apps: {},
                    },
                    {
                        _id: 'session-june',
                        startTime: june,
                        spentTimeInHour: 2,
                        boardId: 'board-1',
                        apps: {},
                    },
                ],
            ]),
            14
        );

        const ans = await rpc(
            'aggHistory',
            {
                path: dbPaths.sessionDB,
                kanbanPath: dbPaths.kanbanDB,
                yearQuery: {
                    startTime: {
                        $gte: new Date(year, 0, 1).getTime(),
                        $lt: new Date(year + 1, 0, 1).getTime(),
                    },
                },
                periodRange: {
                    from: new Date(year, 2, 1).getTime(),
                    to: new Date(year, 3, 1).getTime(),
                },
            },
            15
        );

        // March only for the badge...
        expect(ans.total).toEqual({ count: 1, usedTime: 1 });
        // ...but both days stay on the heat map.
        expect(Object.keys(ans.calendarCount).map(Number)).toEqual(
            expect.arrayContaining([
                new Date(year, 2, 15).getTime(),
                new Date(year, 5, 15).getTime(),
            ])
        );
    });
});
