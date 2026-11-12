import { applyCardMove } from './cardMove';
import { cardReducer } from './Card/action';
import { listReducer } from './List/action';
import { boardReducer } from './Board/action';
import type { Card, KanbanBoard, List } from './type';

const card = (id: string, title = id): Card => ({
    _id: id,
    title,
    content: '',
    sessionIds: [],
    spentTimeInHour: { estimated: 0, actual: 0 },
});

const list = (id: string, cards: string[]): List => ({ _id: id, title: id, cards });

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

/**
 * The transaction returns the final rows; the store must take them as-is.
 * Writing only the database was the bug that made a re-assigned card look
 * unchanged until the next app start, so this pins the reducer half of the
 * contract rather than the arithmetic (that lives in the main-process test).
 */
describe('applyCardMove', () => {
    it('replaces cards, lists and boards with the transaction result', () => {
        const movedCard = { ...card('c1', 'renamed'), completedTime: 123 };
        const source = list('l1', []);
        const target = list('l2', ['c1']);
        const sourceBoard = board('b1', ['l1']);
        const targetBoard = board('b2', ['l2']);

        const result = {
            updatedCards: { c1: movedCard },
            updatedLists: { l1: source, l2: target },
            updatedBoards: { b1: sourceBoard, b2: targetBoard },
        };

        const cards = cardReducer({ c1: card('c1'), c2: card('c2') }, applyCardMove(result));
        expect(cards.c1).toBe(movedCard);
        // Rows the transaction did not touch survive.
        expect(cards.c2).toBeDefined();

        const lists = listReducer(
            { l1: list('l1', ['c1']), l2: list('l2', []) },
            applyCardMove(result)
        );
        expect(lists.l1.cards).toStrictEqual([]);
        expect(lists.l2.cards).toStrictEqual(['c1']);

        const boards = boardReducer({ b1: board('b1', ['l1', 'l2']) }, applyCardMove(result));
        expect(boards.b2).toBe(targetBoard);
    });

    it('keeps the same state when nothing changed', () => {
        const state = { c1: card('c1') };
        const next = cardReducer(
            state,
            applyCardMove({ updatedCards: {}, updatedLists: {}, updatedBoards: {} })
        );
        expect(next).toBe(state);
    });

    it('keeps the board search filter when a transaction replaces a list', () => {
        const withFilter = { ...list('l1', ['c1']), visibleCards: ['c1'] };
        const next = listReducer(
            { l1: withFilter },
            applyCardMove({
                updatedCards: {},
                updatedLists: { l1: list('l1', ['c2', 'c1']) },
                updatedBoards: {},
            })
        );

        expect(next.l1.cards).toStrictEqual(['c2', 'c1']);
        // The transaction returns the stored row; the filter lives only in the
        // renderer and must survive the replacement.
        expect(next.l1.visibleCards).toStrictEqual(['c1']);
    });
});
