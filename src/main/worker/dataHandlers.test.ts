import { WorkerMessageType } from '../ipc/type';
import { handleAggregateHistory } from './dataHandlers';

describe('history aggregation worker', () => {
    it('parses raw apps JSON and returns the same aggregate shape', async () => {
        const result = await handleAggregateHistory({
            type: WorkerMessageType.AggregateHistory,
            payload: {
                arg: { yearQuery: {} },
                boards: [{ _id: 'board-1', name: 'Board One' }],
                yearRecords: [
                    {
                        _id: 'session-1',
                        startTime: Date.now(),
                        spentTimeInHour: 2,
                        boardId: 'board-1',
                        apps: JSON.stringify({
                            Chrome: {
                                appName: 'Chrome',
                                spentTimeInHour: 2,
                                titleSpentTime: {
                                    Docs: { occurrence: 1, normalizedWeight: 1, index: 0 },
                                },
                            },
                        }),
                    },
                ],
            },
        });

        expect(result.total).toEqual({ count: 1, usedTime: 2 });
        expect(result.timeSpent?.projectData).toEqual([{ name: 'Board One', value: 2 }]);
        expect(result.wordWeights).toEqual([['Docs', 56]]);
    });

    it('uses a scalar year and a separate raw month payload', async () => {
        const march = new Date(2020, 2, 15, 10).getTime();
        const june = new Date(2020, 5, 15, 10).getTime();
        const result = await handleAggregateHistory({
            type: WorkerMessageType.AggregateHistory,
            payload: {
                arg: {
                    yearQuery: {},
                    periodRange: {
                        from: new Date(2020, 2, 1).getTime(),
                        to: new Date(2020, 3, 1).getTime(),
                    },
                },
                boards: [{ _id: 'board-1', name: 'Board One' }],
                yearRecords: [
                    { _id: 'march', startTime: march, spentTimeInHour: 1, boardId: 'board-1' },
                    { _id: 'june', startTime: june, spentTimeInHour: 2, boardId: 'board-1' },
                ],
                periodRecords: [
                    {
                        _id: 'march',
                        startTime: march,
                        spentTimeInHour: 1,
                        boardId: 'board-1',
                        apps: JSON.stringify({
                            Chrome: {
                                appName: 'Chrome',
                                spentTimeInHour: 1,
                                titleSpentTime: {
                                    Docs: { occurrence: 1, normalizedWeight: 1, index: 0 },
                                },
                            },
                        }),
                    },
                ],
            },
        });

        expect(result.total).toEqual({ count: 1, usedTime: 1 });
        expect(result.timeSpent?.projectData).toEqual([{ name: 'Board One', value: 1 }]);
        expect(Object.keys(result.calendarCount ?? {})).toHaveLength(2);
    });

    it('does not fail on malformed apps JSON', async () => {
        const result = await handleAggregateHistory({
            type: WorkerMessageType.AggregateHistory,
            payload: {
                arg: { yearQuery: {} },
                boards: [],
                yearRecords: [
                    {
                        _id: 'session-1',
                        startTime: Date.now(),
                        spentTimeInHour: 1,
                        apps: '{bad json',
                    },
                ],
            },
        });

        expect(result.total).toEqual({ count: 1, usedTime: 1 });
        expect(result.timeSpent?.appData).toEqual([]);
    });
});
