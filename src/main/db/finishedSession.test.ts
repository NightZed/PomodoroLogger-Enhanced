import { DBs, runInTransaction } from './index';
import { recordFinishedSession } from './finishedSession';
import type { Card, KanbanBoard } from '../../renderer/components/Kanban/type';
import type { PomodoroRecord } from '../../renderer/monitor/type';

const repo = (name: 'cardsDB' | 'kanbanDB' | 'sessionDB') =>
    (DBs as any)[name] as {
        insert: (doc: any) => Promise<unknown>;
        find: (query?: any) => Promise<any[]>;
        findOne: (query?: any) => Promise<any>;
        update: (query: any, update: any) => Promise<number>;
        clearSync: () => void;
    };

const clearAll = () => {
    runInTransaction(() => {
        for (const name of ['cardsDB', 'kanbanDB', 'sessionDB'] as const) {
            repo(name).clearSync();
        }
    });
};

const session = (over: Partial<PomodoroRecord> = {}): PomodoroRecord =>
    ({
        _id: 's-new',
        startTime: 1000,
        boardId: 'b1',
        spentTimeInHour: 0.5,
        switchActivities: [],
        apps: {
            Chrome: {
                spentTimeInHour: 0.5,
                appName: 'Chrome',
                screenStaticDuration: 0,
                titleSpentTime: {},
            },
        },
        screenStaticDuration: 0,
        switchTimes: 1,
        ...over,
    }) as PomodoroRecord;

const board = (over: Partial<KanbanBoard> = {}): KanbanBoard =>
    ({
        _id: 'b1',
        name: 'B1',
        description: '',
        lists: ['l1'],
        focusedList: 'l1',
        doneList: 'l2',
        relatedSessions: ['s-old'],
        spentHours: 2,
        lastVisitTime: 1,
        ...over,
    }) as KanbanBoard;

const card = (over: Partial<Card> = {}): Card =>
    ({
        _id: 'c1',
        title: 'C1',
        content: '',
        sessionIds: ['s-old'],
        spentTimeInHour: { estimated: 3, actual: 2 },
        ...over,
    }) as Card;

beforeEach(async () => {
    clearAll();
    await repo('kanbanDB').insert(board());
    await repo('cardsDB').insert(card());
});

describe('recordFinishedSession', () => {
    it('writes the session and credits the board and the card', async () => {
        const before = Date.now();
        const result = await recordFinishedSession({ session: session(), cardId: 'c1' });

        const stored = await repo('sessionDB').findOne({ _id: 's-new' });
        expect(stored).toMatchObject({ _id: 's-new', boardId: 'b1' });

        const storedBoard = await repo('kanbanDB').findOne({ _id: 'b1' });
        expect(storedBoard.relatedSessions).toEqual(['s-old', 's-new']);
        expect(storedBoard.spentHours).toBe(2.5);
        expect(storedBoard.lastVisitTime).toBeGreaterThanOrEqual(before);
        expect(result.board).toEqual(storedBoard);

        const storedCard = await repo('cardsDB').findOne({ _id: 'c1' });
        expect(storedCard.sessionIds).toEqual(['s-old', 's-new']);
        expect(storedCard.spentTimeInHour).toEqual({ estimated: 3, actual: 2.5 });
        expect(result.card).toEqual(storedCard);
    });

    it('leaves the card alone when the pomodoro had no card', async () => {
        const result = await recordFinishedSession({ session: session() });

        expect(result.card).toBeUndefined();
        const storedCard = await repo('cardsDB').findOne({ _id: 'c1' });
        expect(storedCard).toEqual(card());
    });

    it('writes an unattributed session without touching any board', async () => {
        const result = await recordFinishedSession({
            session: session({ boardId: undefined }),
        });

        expect(result.board).toBeUndefined();
        const stored = await repo('sessionDB').findOne({ _id: 's-new' });
        expect(stored.boardId).toBeUndefined();
        expect(await repo('kanbanDB').findOne({ _id: 'b1' })).toEqual(board());
    });

    it('keeps the session when its board was deleted while it ran', async () => {
        runInTransaction(() => {
            const boards = DBs.kanbanDB as any;
            boards.clearSync();
        });

        const result = await recordFinishedSession({ session: session() });

        expect(result.board).toBeUndefined();
        // The session keeps the dead board id, which is exactly what History
        // shows as `Unknown` and what the session editor can reassign.
        const stored = await repo('sessionDB').findOne({ _id: 's-new' });
        expect(stored).toMatchObject({ _id: 's-new', boardId: 'b1' });
    });

    it('keeps the board credit when the picked card was deleted', async () => {
        const result = await recordFinishedSession({
            session: session(),
            cardId: 'missing',
        });

        expect(result.card).toBeUndefined();
        const storedBoard = await repo('kanbanDB').findOne({ _id: 'b1' });
        expect(storedBoard.spentHours).toBe(2.5);
        expect(storedBoard.relatedSessions).toEqual(['s-old', 's-new']);
    });

    it('does not credit the same session twice', async () => {
        await recordFinishedSession({ session: session(), cardId: 'c1' });

        await expect(recordFinishedSession({ session: session(), cardId: 'c1' })).rejects.toThrow(
            /already exists/
        );

        const storedBoard = await repo('kanbanDB').findOne({ _id: 'b1' });
        expect(storedBoard.spentHours).toBe(2.5);
        const storedCard = await repo('cardsDB').findOne({ _id: 'c1' });
        expect(storedCard.sessionIds).toEqual(['s-old', 's-new']);
    });

    it('rolls the board and card back when the session cannot be written', async () => {
        // The session row is written first, and the board/card credits only
        // happen after it exists. A value that cannot be serialized fails the
        // insert for real, so the rollback is not simulated by a stub.
        const circular: any = {};
        circular.self = circular;
        const broken = session({ apps: { Chrome: circular } as any });

        await expect(recordFinishedSession({ session: broken, cardId: 'c1' })).rejects.toThrow();

        expect(await repo('kanbanDB').findOne({ _id: 'b1' })).toEqual(board());
        expect(await repo('cardsDB').findOne({ _id: 'c1' })).toEqual(card());
        expect(await repo('sessionDB').findOne({ _id: 's-new' })).toBeNull();
    });

    it('rounds the accumulated hours instead of drifting', async () => {
        await repo('kanbanDB').update({ _id: 'b1' }, { $set: { spentHours: 0.30000000000000004 } });
        await recordFinishedSession({ session: session({ spentTimeInHour: 0.1 }) });

        const storedBoard = await repo('kanbanDB').findOne({ _id: 'b1' });
        expect(storedBoard.spentHours).toBe(0.4);
    });
});
