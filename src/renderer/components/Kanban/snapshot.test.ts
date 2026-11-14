import { applyKanbanSnapshot } from './snapshot';
import { boardReducer } from './Board/action';
import { listReducer } from './List/action';
import { cardReducer } from './Card/action';
import type { KanbanBoard, List } from './type';
import type { Card } from './type';

const board = (id: string, lists: string[]): KanbanBoard => ({
    _id: id,
    name: id,
    description: '',
    lists,
    focusedList: lists[0] ?? '',
    doneList: '',
    relatedSessions: [],
    spentHours: 0,
});

const list = (id: string, cards: string[]): List => ({ _id: id, title: id, cards });

const card = (id: string, title: string): Card => ({
    _id: id,
    title,
    content: '',
    sessionIds: [],
    spentTimeInHour: { estimated: 0, actual: 0 },
});

describe('applyKanbanSnapshot', () => {
    // Regression: the three kanban maps were dispatched one after another.
    // Clearing them could leave `board.lists` pointing at lists that were
    // already gone, and any subscriber walking that path read `undefined`.
    it('replaces all three slices from the same action', () => {
        const snapshot = {
            boards: { b1: board('b1', ['l1']) },
            lists: { l1: list('l1', ['c1']) },
            cards: { c1: card('c1', 'Card') },
        };

        const action = applyKanbanSnapshot(snapshot);

        // Every slice reads its own part; a single dispatch updates the tree,
        // so no subscriber can observe boards that name lists which are gone.
        expect(boardReducer({ stale: board('stale', ['gone']) }, action)).toEqual(snapshot.boards);
        expect(listReducer({}, action)).toEqual(snapshot.lists);
        expect(cardReducer({}, action)).toEqual(snapshot.cards);
    });

    it('empties every slice when the data is deleted', () => {
        const action = applyKanbanSnapshot({ boards: {}, lists: {}, cards: {} });

        expect(boardReducer({ b1: board('b1', ['l1']) }, action)).toEqual({});
        expect(listReducer({ l1: list('l1', ['c1']) }, action)).toEqual({});
        expect(cardReducer({ c1: card('c1', 'Card') }, action)).toEqual({});
    });
});
