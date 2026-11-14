import { DBs, loadDBs, runInTransaction } from './index';
import { moveCardInBoard } from './cardDrag';
import type { Card, KanbanBoard, List } from '../../renderer/components/Kanban/type';

const repo = (name: 'cardsDB' | 'listsDB' | 'kanbanDB' | 'moveDB') =>
    (DBs as any)[name] as {
        insert: (doc: any) => Promise<unknown>;
        find: (query?: any) => Promise<any[]>;
        clearSync: () => void;
    };

const clearAll = () => {
    runInTransaction(() => {
        for (const name of ['cardsDB', 'listsDB', 'kanbanDB', 'moveDB'] as const) {
            repo(name).clearSync();
        }
    });
};

const board = (id: string, lists: string[]): KanbanBoard => ({
    _id: id,
    name: id,
    description: '',
    lists,
    focusedList: lists[0],
    doneList: lists[lists.length - 1],
    relatedSessions: [],
    spentHours: 0,
});

const list = (id: string, cards: string[]): List => ({ _id: id, title: id, cards });

const card = (id: string, completedTime?: number): Card => ({
    _id: id,
    title: id,
    content: '',
    sessionIds: [],
    spentTimeInHour: { estimated: 0, actual: 0 },
    completedTime,
});

/** b1 owns l1/l2 (l2 is its done list); b2 owns l3, for the cross-board case. */
const seed = async () => {
    await repo('kanbanDB').insert([board('b1', ['l1', 'l2']), board('b2', ['l3'])]);
    await repo('listsDB').insert([
        list('l1', ['c1', 'c2', 'c3']),
        list('l2', ['c4']),
        list('l3', []),
    ]);
    await repo('cardsDB').insert([card('c1'), card('c2'), card('c3'), card('c4')]);
};

const findList = async (id: string) => (await repo('listsDB').find({ _id: id }))[0];
const findCard = async (id: string) => (await repo('cardsDB').find({ _id: id }))[0];
const allMoves = () => repo('moveDB').find({});

// Regression: a cross-list drag was three separate writes (source list, target
// list, move row); a crash in between left the card in neither list, which is
// the "not in any list" row of the data check.
describe('moveCardInBoard', () => {
    beforeEach(async () => {
        await loadDBs(['cardsDB', 'listsDB', 'kanbanDB', 'moveDB']);
        clearAll();
        await seed();
    });

    it('moves a card into another list and records the move', async () => {
        await moveCardInBoard({
            cardId: 'c1',
            fromListId: 'l1',
            toListId: 'l2',
            toIndex: 1,
        });

        expect((await findList('l1')).cards).toStrictEqual(['c2', 'c3']);
        expect((await findList('l2')).cards).toStrictEqual(['c4', 'c1']);

        const moves = await allMoves();
        expect(moves).toHaveLength(1);
        expect(moves[0]).toMatchObject({
            fromListId: 'l1',
            toListId: 'l2',
            cardId: 'c1',
        });
    });

    it('stamps completedTime when the destination is the done list', async () => {
        await moveCardInBoard({
            cardId: 'c1',
            fromListId: 'l1',
            toListId: 'l2',
            toIndex: 0,
        });

        expect(typeof (await findCard('c1')).completedTime).toBe('number');
    });

    it('keeps the completion stamp when a card leaves the done list', async () => {
        await moveCardInBoard({
            cardId: 'c1',
            fromListId: 'l1',
            toListId: 'l2',
            toIndex: 0,
        });
        const stamped = (await findCard('c1')).completedTime;

        await moveCardInBoard({
            cardId: 'c1',
            fromListId: 'l2',
            toListId: 'l1',
            toIndex: 0,
        });

        expect((await findCard('c1')).completedTime).toBe(stamped);
    });

    it('reorders inside one list without writing a move', async () => {
        await moveCardInBoard({
            cardId: 'c1',
            fromListId: 'l1',
            toListId: 'l1',
            toIndex: 2,
        });

        expect((await findList('l1')).cards).toStrictEqual(['c2', 'c3', 'c1']);
        expect(await allMoves()).toHaveLength(0);
        // Same-list reordering is not a completion, even in the done list.
        await moveCardInBoard({
            cardId: 'c4',
            fromListId: 'l2',
            toListId: 'l2',
            toIndex: 0,
        });
        expect((await findCard('c4')).completedTime).toBeUndefined();
    });

    it('clamps an out-of-range index instead of throwing', async () => {
        await moveCardInBoard({
            cardId: 'c1',
            fromListId: 'l1',
            toListId: 'l2',
            toIndex: 99,
        });

        expect((await findList('l2')).cards).toStrictEqual(['c4', 'c1']);
    });

    it('refuses a destination in another board', async () => {
        await expect(
            moveCardInBoard({ cardId: 'c1', fromListId: 'l1', toListId: 'l3', toIndex: 0 })
        ).rejects.toThrow(/inside one board/);
        expect((await findList('l1')).cards).toStrictEqual(['c1', 'c2', 'c3']);
    });

    it('refuses a card that is not in the source list', async () => {
        await expect(
            moveCardInBoard({ cardId: 'c4', fromListId: 'l1', toListId: 'l2', toIndex: 0 })
        ).rejects.toThrow(/is not in list/);
    });
});
