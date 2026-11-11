import { DBs, loadDBs, runInTransaction } from './index';
import { moveCardToBoard } from './cardMove';
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

const board = (over: Partial<KanbanBoard>): KanbanBoard => ({
    _id: 'b1',
    name: 'B1',
    description: '',
    lists: ['l1', 'l2'],
    focusedList: 'l1',
    doneList: 'l2',
    relatedSessions: [],
    spentHours: 0,
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
 * b1 owns c1 (one session) and cs (the same session plus another), so every
 * move exercises the "a session is only counted by one card" rule. b2 starts
 * empty, and both boards have a second list so the done-list stamp is testable.
 */
const seed = async () => {
    await repo('kanbanDB').insert([
        board({
            _id: 'b1',
            lists: ['l1', 'l2'],
            focusedList: 'l1',
            doneList: 'l2',
            relatedSessions: ['s1', 's2'],
            spentHours: 2,
        }),
        board({
            _id: 'b2',
            name: 'B2',
            lists: ['l3', 'l4'],
            focusedList: 'l3',
            doneList: 'l4',
            relatedSessions: [],
            spentHours: 0,
        }),
    ]);
    await repo('listsDB').insert([
        list('l1', ['c1', 'cs']),
        list('l2', []),
        list('l3', ['c3']),
        list('l4', []),
    ]);
    await repo('cardsDB').insert([
        card('c1', ['s1'], 1),
        card('cs', ['s1', 's2'], 2),
        card('c3', [], 0),
    ]);
    await repo('sessionDB').insert([
        { _id: 's1', startTime: 1, spentTimeInHour: 1, boardId: 'b1' },
        { _id: 's2', startTime: 2, spentTimeInHour: 1, boardId: 'b1' },
    ]);
};

const findBoard = async (id: string) => (await repo('kanbanDB').find({ _id: id }))[0];
const findList = async (id: string) => (await repo('listsDB').find({ _id: id }))[0];
const findCard = async (id: string) => (await repo('cardsDB').find({ _id: id }))[0];
const findSession = async (id: string) => (await repo('sessionDB').find({ _id: id }))[0];
const allMoves = () => repo('moveDB').find({});

describe('moveCardToBoard', () => {
    beforeEach(async () => {
        await loadDBs(['cardsDB', 'listsDB', 'kanbanDB', 'moveDB', 'sessionDB']);
        clearAll();
        await seed();
    });

    it('moves the card, its sessions and the board totals to another board', async () => {
        await moveCardToBoard({ cardId: 'c1', targetListId: 'l3' });

        expect((await findList('l1')).cards).toStrictEqual(['cs']);
        expect((await findList('l3')).cards).toStrictEqual(['c3', 'c1']);
        expect((await findSession('s1')).boardId).toBe('b2');

        const from = await findBoard('b1');
        expect(from.relatedSessions).toStrictEqual(['s2']);
        expect(from.spentHours).toBe(1);

        const to = await findBoard('b2');
        expect(to.relatedSessions).toStrictEqual(['s1']);
        expect(to.spentHours).toBe(1);
    });

    it('records the move so an import cannot put the card back', async () => {
        await moveCardToBoard({ cardId: 'c1', targetListId: 'l3' });

        const moves = await allMoves();
        expect(moves).toHaveLength(1);
        expect(moves[0]).toMatchObject({
            fromListId: 'l1',
            toListId: 'l3',
            cardId: 'c1',
        });
    });

    it('takes a shared session away from the other card that counted it', async () => {
        await moveCardToBoard({ cardId: 'c1', targetListId: 'l3' });

        const other = await findCard('cs');
        expect(other.sessionIds).toStrictEqual(['s2']);
        expect(other.spentTimeInHour.actual).toBe(1);
        // The moved card keeps the session it still owns.
        expect((await findCard('c1')).sessionIds).toStrictEqual(['s1']);
        expect((await findCard('c1')).spentTimeInHour.actual).toBe(1);
    });

    it('stamps completedTime when the destination is the done list', async () => {
        await moveCardToBoard({ cardId: 'c1', targetListId: 'l2' });

        expect(typeof (await findCard('c1')).completedTime).toBe('number');
        // Same board: the session and the board totals stay where they were.
        expect((await findSession('s1')).boardId).toBe('b1');
        expect((await findBoard('b1')).spentHours).toBe(2);
    });

    it('keeps the completion date when the card leaves a done list', async () => {
        await moveCardToBoard({ cardId: 'c1', targetListId: 'l2' });
        const completed = (await findCard('c1')).completedTime;

        await moveCardToBoard({ cardId: 'c1', targetListId: 'l3' });

        expect((await findCard('c1')).completedTime).toBe(completed);
    });

    it('refuses to move a card into the list it is already in', async () => {
        await expect(moveCardToBoard({ cardId: 'c1', targetListId: 'l1' })).rejects.toThrow(
            /already in list/
        );
        expect((await findList('l1')).cards).toStrictEqual(['c1', 'cs']);
    });

    it('refuses an unknown destination list', async () => {
        await expect(moveCardToBoard({ cardId: 'c1', targetListId: 'nope' })).rejects.toThrow(
            /does not exist/
        );
    });

    it('refuses an unknown card', async () => {
        await expect(moveCardToBoard({ cardId: 'nope', targetListId: 'l3' })).rejects.toThrow(
            /does not exist/
        );
    });
});
