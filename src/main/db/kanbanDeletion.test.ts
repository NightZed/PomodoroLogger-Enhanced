import { DBs, loadDBs, runInTransaction } from './index';
import { deleteKanbanItems } from './kanbanDeletion';
import type { Card, KanbanBoard, List, MoveInfo } from '../../renderer/components/Kanban/type';

const repo = (name: 'cardsDB' | 'listsDB' | 'kanbanDB' | 'moveDB' | 'sessionDB') =>
    (DBs as any)[name] as {
        insert: (doc: any) => Promise<unknown>;
        find: (query?: any) => Promise<any[]>;
        update: (query: any, update: any) => Promise<number>;
        clearSync: () => void;
        removeSync: (query?: any, options?: any) => number;
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
    relatedSessions: ['s1', 's2', 's3', 'unassigned'],
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

const move = (cardId: string, fromListId: string, toListId: string, time: number): MoveInfo => ({
    cardId,
    fromListId,
    toListId,
    time,
});

/** One board with two lists, three cards and three moves, plus one session. */
const seed = async () => {
    await repo('kanbanDB').insert(board());
    await repo('listsDB').insert([list('l1', ['c1', 'c2']), list('l2', ['c3'])]);
    await repo('cardsDB').insert([
        card('c1', ['s1'], 1),
        card('c2', ['s2'], 1),
        card('c3', ['s3'], 1),
    ]);
    await repo('moveDB').insert([
        move('c1', 'l1', 'l1', 1),
        move('c2', 'l1', 'l1', 2),
        move('c3', 'l1', 'l2', 3),
    ]);
    await repo('sessionDB').insert([
        { _id: 's1', startTime: 1, spentTimeInHour: 1 },
        { _id: 's2', startTime: 2, spentTimeInHour: 1 },
        { _id: 's3', startTime: 3, spentTimeInHour: 1 },
    ]);
};

const ids = (rows: any[]) => rows.map((row) => row._id).sort();
/** Move rows have no `_id`; assert them by the card they belong to. */
const moveCardIds = async () => (await repo('moveDB').find()).map((row) => row.cardId).sort();

describe('deleteKanbanItems', () => {
    beforeEach(async () => {
        await loadDBs(['cardsDB', 'listsDB', 'kanbanDB', 'moveDB', 'sessionDB']);
        clearAll();
    });

    it('deletes a card and its move rows without shrinking the board totals', async () => {
        await seed();

        const result = await deleteKanbanItems({ cards: ['c1'] });

        expect(result.cards).toEqual(['c1']);
        expect(ids(await repo('cardsDB').find())).toEqual(['c2', 'c3']);
        expect(await moveCardIds()).toEqual(['c2', 'c3']);
        expect(result.updatedLists.l1.cards).toEqual(['c2']);

        // The board's totals count its sessions, not its cards: s1 is still a
        // pomodoro of this project, it just has no card any more.
        expect(result.updatedBoards.b1).toBeUndefined();
        const stored = (await repo('kanbanDB').find())[0];
        expect(stored.spentHours).toBe(3);
        expect(stored.relatedSessions).toEqual(['s1', 's2', 's3', 'unassigned']);

        // Sessions are history, not card data.
        expect(ids(await repo('sessionDB').find())).toEqual(['s1', 's2', 's3']);
    });

    it('deletes a list together with its cards and their moves', async () => {
        await seed();

        const result = await deleteKanbanItems({ lists: ['l2'] });

        expect(result.lists).toEqual(['l2']);
        expect(result.cards).toEqual(['c3']);
        expect(ids(await repo('listsDB').find())).toEqual(['l1']);
        expect(ids(await repo('cardsDB').find())).toEqual(['c1', 'c2']);
        // c3's own move and the move whose endpoint was l2 are both gone.
        expect(await moveCardIds()).toEqual(['c1', 'c2']);

        const updated = result.updatedBoards.b1;
        expect(updated.lists).toEqual(['l1']);
        // Deleting cards never touches the board's session totals.
        expect(updated.spentHours).toBe(3);
        expect(updated.relatedSessions).toEqual(['s1', 's2', 's3', 'unassigned']);
    });

    it('deletes a board with its whole list/card subtree', async () => {
        await seed();

        const result = await deleteKanbanItems({ boards: ['b1'] });

        expect(result.boards).toEqual(['b1']);
        expect(result.lists.sort()).toEqual(['l1', 'l2']);
        expect(result.cards.sort()).toEqual(['c1', 'c2', 'c3']);
        expect(await repo('kanbanDB').find()).toEqual([]);
        expect(await repo('listsDB').find()).toEqual([]);
        expect(await repo('cardsDB').find()).toEqual([]);
        expect(await repo('moveDB').find()).toEqual([]);
        // History is untouched even when its project disappears.
        expect(ids(await repo('sessionDB').find())).toEqual(['s1', 's2', 's3']);
    });

    // Regression: this used to drop `s1` from `relatedSessions` because its
    // only card was deleted, so the project's pomodoro count fell even though
    // the session (and its time) was still in History under the same board.
    it('keeps a session whose only card was deleted', async () => {
        await seed();

        await deleteKanbanItems({ cards: ['c1'] });

        const stored = (await repo('kanbanDB').find())[0];
        expect(stored.relatedSessions).toContain('s1');
        expect(stored.spentHours).toBe(3);
        expect(ids(await repo('sessionDB').find())).toEqual(['s1', 's2', 's3']);
    });

    it('ignores ids that no longer exist', async () => {
        await seed();

        const result = await deleteKanbanItems({ cards: ['missing'], boards: ['nope'] });

        expect(result).toEqual({
            cards: [],
            lists: [],
            boards: [],
            updatedLists: {},
            updatedBoards: {},
        });
        expect(ids(await repo('cardsDB').find())).toEqual(['c1', 'c2', 'c3']);
    });
});
