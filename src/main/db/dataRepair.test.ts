import { DBs, loadDBs, runInTransaction } from './index';
import { repairData, scanDataIssues } from './dataRepair';
import type { Card, KanbanBoard, List } from '../../renderer/components/Kanban/type';

const repo = (name: 'cardsDB' | 'listsDB' | 'kanbanDB' | 'moveDB' | 'sessionDB') =>
    (DBs as any)[name] as {
        insert: (doc: any) => Promise<unknown>;
        find: (query?: any) => Promise<any[]>;
        clearSync: () => void;
    };

const clearAll = () => {
    runInTransaction(() => {
        for (const name of ['cardsDB', 'listsDB', 'kanbanDB', 'moveDB', 'sessionDB'] as const) {
            repo(name).clearSync();
        }
    });
};

const board = (id: string, lists: string[]): KanbanBoard => ({
    _id: id,
    name: id,
    description: '',
    lists,
    focusedList: lists[0] ?? '',
    doneList: lists[lists.length - 1] ?? '',
    relatedSessions: [],
    spentHours: 0,
});

const list = (id: string, cards: string[]): List => ({ _id: id, title: id, cards });

const card = (id: string, sessionIds: string[], actual = 0): Card => ({
    _id: id,
    title: id,
    content: '',
    sessionIds,
    spentTimeInHour: { estimated: 0, actual },
});

/**
 * b1/l1 is the healthy path, with three kinds of dangling entries seeded in.
 * l2 is an orphan list (no board names it) holding c2 and c3; c4 is named by
 * nothing at all. Moves: m1 is fine, m2 points at a missing card, m3 starts at
 * a missing list.
 */
const seed = async () => {
    await repo('kanbanDB').insert([board('b1', ['l1', 'goneList'])]);
    await repo('listsDB').insert([list('l1', ['c1', 'goneCard', 'c1']), list('l2', ['c2', 'c3'])]);
    await repo('cardsDB').insert([
        card('c1', ['s1', 'goneSession', 's1'], 2),
        card('c2', ['s1'], 1),
        card('c3', [], 0),
        card('c4', [], 0.5),
    ]);
    await repo('sessionDB').insert([
        { _id: 's1', startTime: 1, spentTimeInHour: 1, boardId: 'b1' },
    ]);
    await repo('moveDB').insert([
        { cardId: 'c1', fromListId: 'l1', toListId: 'l1', time: 1 },
        { cardId: 'goneCard', fromListId: 'l1', toListId: 'l1', time: 2 },
        { cardId: 'c1', fromListId: 'goneList', toListId: 'l1', time: 3 },
    ]);
};

const allCards = () => repo('cardsDB').find({});
const allLists = () => repo('listsDB').find({});
const allMoves = () => repo('moveDB').find({});

describe('data check', () => {
    beforeEach(async () => {
        await loadDBs(['cardsDB', 'listsDB', 'kanbanDB', 'moveDB', 'sessionDB']);
        clearAll();
        await seed();
    });

    it('separates cards left behind by a dead list from cards no list names', async () => {
        const report = await scanDataIssues();

        expect(report.detachedCards.map((card) => card._id).sort()).toStrictEqual(['c2', 'c3']);
        expect(report.detachedCards.every((card) => card.listTitle === 'l2')).toBe(true);
        expect(report.orphanCards.map((card) => card._id)).toStrictEqual(['c4']);
        expect(report.lists.map((entry) => entry._id)).toStrictEqual(['l2']);
        // c2 is worth 1h, so it sorts before c3 (no time recorded).
        expect(report.detachedCards[0]._id).toBe('c2');
    });

    it('counts dead move rows and every kind of dangling reference', async () => {
        const report = await scanDataIssues();

        expect(report.moves).toStrictEqual({ total: 2, cardCount: 2 });

        const byKind = new Map(report.dangling.map((issue) => [issue.kind, issue]));
        // b1 names `goneList`.
        expect(byKind.get('boardLists')).toMatchObject({ ownerId: 'b1', count: 1 });
        // l1 names `goneCard` and c1 twice.
        expect(byKind.get('listCards')).toMatchObject({ ownerId: 'l1', count: 2 });
        // c1 names `goneSession` and s1 twice.
        expect(byKind.get('cardSessions')).toMatchObject({ ownerId: 'c1', count: 2 });
    });

    it('deletes the chosen rows and repairs the chosen arrays', async () => {
        const result = await repairData({
            cardIds: ['c2', 'c3', 'c4'],
            listIds: ['l2'],
            removeOrphanMoves: true,
            listCardRefIds: ['l1'],
            boardListRefIds: ['b1'],
            cardSessionRefIds: ['c1'],
        });

        expect(result.removedCards.sort()).toStrictEqual(['c2', 'c3', 'c4']);
        expect(result.removedLists).toStrictEqual(['l2']);
        expect(result.removedMoves).toBe(2);
        // l1: goneCard + duplicate c1; b1: goneList; c1: goneSession + duplicate s1.
        expect(result.repairedRefs).toBe(5);

        expect((await allCards()).map((row) => row._id)).toStrictEqual(['c1']);
        expect((await allLists()).map((row) => row._id)).toStrictEqual(['l1']);
        expect((await allLists())[0].cards).toStrictEqual(['c1']);
        expect((await repo('kanbanDB').find({ _id: 'b1' }))[0].lists).toStrictEqual(['l1']);
        expect((await repo('cardsDB').find({ _id: 'c1' }))[0].sessionIds).toStrictEqual(['s1']);
        expect((await allMoves()).map((row) => row.time)).toStrictEqual([1]);
    });

    it('leaves nothing for a second check to find', async () => {
        await repairData({
            cardIds: ['c2', 'c3', 'c4'],
            listIds: ['l2'],
            removeOrphanMoves: true,
            listCardRefIds: ['l1'],
            boardListRefIds: ['b1'],
            cardSessionRefIds: ['c1'],
        });

        await expect(scanDataIssues()).resolves.toStrictEqual({
            detachedCards: [],
            orphanCards: [],
            lists: [],
            moves: { total: 0, cardCount: 0 },
            dangling: [],
        });
    });

    it('only touches what was selected', async () => {
        // Keep everything but the dead move rows.
        await repairData({
            cardIds: [],
            listIds: [],
            removeOrphanMoves: true,
            listCardRefIds: [],
            boardListRefIds: [],
            cardSessionRefIds: [],
        });

        expect(await allCards()).toHaveLength(4);
        expect(await allLists()).toHaveLength(2);
        // The dead reference is still there: the user did not tick that repair.
        expect((await allLists())[0].cards).toStrictEqual(['c1', 'goneCard', 'c1']);
        expect(await allMoves()).toHaveLength(1);
    });

    it('removes a deleted card from the lists that still name it', async () => {
        // Removing c1 while l1 keeps its `cards` array drops the id with it, so
        // the operation cannot create the dangling reference it just cleaned.
        await repairData({
            cardIds: ['c1'],
            listIds: [],
            removeOrphanMoves: false,
            listCardRefIds: [],
            boardListRefIds: [],
            cardSessionRefIds: [],
        });

        expect((await allLists()).find((row) => row._id === 'l1').cards).toStrictEqual([
            'goneCard',
        ]);
    });
});
