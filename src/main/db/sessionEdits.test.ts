import { DBs, loadDBs, runInTransaction } from './index';
import { applySessionEdits, listUnassignedSessions } from './sessionEdits';
import type { Card, KanbanBoard, List } from '../../renderer/components/Kanban/type';

const repo = (name: 'cardsDB' | 'listsDB' | 'kanbanDB' | 'moveDB' | 'sessionDB') =>
    (DBs as any)[name] as {
        insert: (doc: any) => Promise<unknown>;
        find: (query?: any) => Promise<any[]>;
        update: (query: any, update: any) => Promise<number>;
        clearSync: () => void;
    };

const clearAll = () => {
    runInTransaction(() => {
        for (const name of ['cardsDB', 'listsDB', 'kanbanDB', 'moveDB', 'sessionDB'] as const) {
            repo(name).clearSync();
        }
    });
};

const board = (over: Partial<KanbanBoard> = {}): KanbanBoard => ({
    _id: 'b1',
    name: 'B1',
    description: '',
    lists: ['l1', 'l2'],
    focusedList: 'l1',
    doneList: 'l2',
    relatedSessions: ['s1', 's2', 's3'],
    spentHours: 3,
    ...over,
});

const list = (id: string, cards: string[]): List => ({ _id: id, title: id, cards });

const card = (id: string, sessionIds: string[], actual: number): Card => ({
    _id: id,
    title: id,
    content: '',
    sessionIds,
    spentTimeInHour: { estimated: 0, actual },
});

/**
 * Two boards. b1 has s1 on c1 and s2/s3 unattached; b2 has an empty card.
 * Every session is worth one hour, so any wrong arithmetic shows up as a
 * whole number difference.
 */
const seed = async () => {
    await repo('kanbanDB').insert([
        board(),
        board({
            _id: 'b2',
            name: 'B2',
            lists: ['l3'],
            focusedList: 'l3',
            doneList: 'l3',
            relatedSessions: [],
            spentHours: 0,
        }),
    ]);
    await repo('listsDB').insert([list('l1', ['c1']), list('l2', ['c2']), list('l3', ['c3'])]);
    await repo('cardsDB').insert([card('c1', ['s1'], 1), card('c2', [], 0), card('c3', [], 0)]);
    await repo('sessionDB').insert([
        { _id: 's1', startTime: 1, spentTimeInHour: 1, boardId: 'b1' },
        { _id: 's2', startTime: 2, spentTimeInHour: 1, boardId: 'b1' },
        { _id: 's3', startTime: 3, spentTimeInHour: 1, boardId: 'b1' },
    ]);
};

const findBoard = async (id: string) => (await repo('kanbanDB').find({ _id: id }))[0];
const findCard = async (id: string) => (await repo('cardsDB').find({ _id: id }))[0];
const findSession = async (id: string) => (await repo('sessionDB').find({ _id: id }))[0];

describe('applySessionEdits', () => {
    beforeEach(async () => {
        await loadDBs(['cardsDB', 'listsDB', 'kanbanDB', 'moveDB', 'sessionDB']);
        clearAll();
        await seed();
    });

    it('moves an unattached session to another project', async () => {
        await applySessionEdits([{ _id: 's2', boardId: 'b2' }]);

        const from = await findBoard('b1');
        const to = await findBoard('b2');
        expect(from.relatedSessions).toStrictEqual(['s1', 's3']);
        expect(from.spentHours).toBe(2);
        expect(to.relatedSessions).toStrictEqual(['s2']);
        expect(to.spentHours).toBe(1);
        expect((await findSession('s2')).boardId).toBe('b2');
    });

    it('moves the session off its old card when the project changes', async () => {
        await applySessionEdits([{ _id: 's1', boardId: 'b2', cardId: 'c3' }]);

        const oldCard = await findCard('c1');
        const newCard = await findCard('c3');
        expect(oldCard.sessionIds).toStrictEqual([]);
        expect(oldCard.spentTimeInHour.actual).toBe(0);
        expect(newCard.sessionIds).toStrictEqual(['s1']);
        expect(newCard.spentTimeInHour.actual).toBe(1);
        expect((await findBoard('b1')).spentHours).toBe(2);
        expect((await findBoard('b2')).relatedSessions).toStrictEqual(['s1']);
    });

    it('moves a session between cards of the same board', async () => {
        await applySessionEdits([{ _id: 's1', cardId: 'c2' }]);

        expect((await findCard('c1')).sessionIds).toStrictEqual([]);
        expect((await findCard('c1')).spentTimeInHour.actual).toBe(0);
        expect((await findCard('c2')).sessionIds).toStrictEqual(['s1']);
        expect((await findCard('c2')).spentTimeInHour.actual).toBe(1);
        // A card change never touches the board totals.
        expect((await findBoard('b1')).spentHours).toBe(3);
        expect((await findBoard('b1')).relatedSessions).toStrictEqual(['s1', 's2', 's3']);
    });

    it('detaches a session from its card with cardId: null', async () => {
        await applySessionEdits([{ _id: 's1', cardId: null }]);

        const target = await findCard('c1');
        expect(target.sessionIds).toStrictEqual([]);
        expect(target.spentTimeInHour.actual).toBe(0);
        expect((await findBoard('b1')).spentHours).toBe(3);
        expect((await findSession('s1')).boardId).toBe('b1');
    });

    it('detaches a session from its project with boardId: null', async () => {
        await applySessionEdits([{ _id: 's1', boardId: null }]);

        const session = await findSession('s1');
        expect(session.boardId).toBeUndefined();
        expect((await findCard('c1')).sessionIds).toStrictEqual([]);
        expect((await findBoard('b1')).relatedSessions).toStrictEqual(['s2', 's3']);
        expect((await findBoard('b1')).spentHours).toBe(2);
    });

    it('deletes a session and releases everything that counted it', async () => {
        await applySessionEdits([{ _id: 's1', delete: true }]);

        expect(await findSession('s1')).toBeUndefined();
        expect((await findCard('c1')).sessionIds).toStrictEqual([]);
        expect((await findCard('c1')).spentTimeInHour.actual).toBe(0);
        expect((await findBoard('b1')).relatedSessions).toStrictEqual(['s2', 's3']);
        expect((await findBoard('b1')).spentHours).toBe(2);
    });

    it('rejects a card from another board and leaves the data untouched', async () => {
        await expect(applySessionEdits([{ _id: 's1', cardId: 'c3' }])).rejects.toThrow(
            /another board/
        );

        expect((await findCard('c1')).sessionIds).toStrictEqual(['s1']);
        expect((await findCard('c3')).sessionIds).toStrictEqual([]);
        expect((await findBoard('b2')).spentHours).toBe(0);
    });

    it('rejects a card when the session has no project', async () => {
        await repo('sessionDB').insert({ _id: 's4', startTime: 4, spentTimeInHour: 0.5 });

        await expect(applySessionEdits([{ _id: 's4', cardId: 'c1' }])).rejects.toThrow(
            /needs a project/
        );
    });

    it('subtracts one hour per duplicate reference on a card', async () => {
        // A legacy row can list the same session twice; the total has to match.
        await repo('cardsDB').update(
            { _id: 'c2' },
            { $set: { sessionIds: ['s2', 's2'], 'spentTimeInHour.actual': 2 } }
        );

        await applySessionEdits([{ _id: 's2', cardId: null }]);

        expect((await findCard('c2')).sessionIds).toStrictEqual([]);
        expect((await findCard('c2')).spentTimeInHour.actual).toBe(0);
    });

    it('ignores edits for sessions that are already gone', async () => {
        const result = await applySessionEdits([{ _id: 'missing', boardId: 'b2' }]);

        expect(result.deleted).toStrictEqual([]);
        expect(result.sessions).toStrictEqual([]);
        expect(result.updatedBoards).toStrictEqual({});
    });
});

describe('listUnassignedSessions', () => {
    beforeEach(async () => {
        await loadDBs(['cardsDB', 'listsDB', 'kanbanDB', 'moveDB', 'sessionDB']);
        clearAll();
        await seed();
    });

    it('lists only the sessions no card counts, newest first', async () => {
        const result = await listUnassignedSessions();

        // s1 is on c1; s2 and s3 never were.
        expect(result.total).toBe(2);
        expect(result.sessions.map((session) => session._id)).toStrictEqual(['s3', 's2']);
    });

    it('filters by board', async () => {
        expect((await listUnassignedSessions({ boardId: 'b2' })).total).toBe(0);
        expect((await listUnassignedSessions({ boardId: 'b1' })).total).toBe(2);
    });

    it('returns the total separately from the page', async () => {
        const result = await listUnassignedSessions({ limit: 1 });

        expect(result.total).toBe(2);
        expect(result.sessions).toHaveLength(1);
        expect(result.sessions[0]._id).toBe('s3');
    });

    it('counts the applications of each session', async () => {
        await repo('sessionDB').insert({
            _id: 's4',
            startTime: 4,
            spentTimeInHour: 0.5,
            boardId: 'b1',
            apps: { Chrome: { appName: 'Chrome' }, Code: { appName: 'Code' } },
        });

        const result = await listUnassignedSessions({ boardId: 'b1' });
        expect(result.sessions[0]).toMatchObject({ _id: 's4', appCount: 2 });
    });
});
