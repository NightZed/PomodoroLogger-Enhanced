import { applyMiddleware, createStore } from 'redux';
import { thunk } from 'redux-thunk';
import {
    applySessionEditsAndRefresh,
    moveCardToBoardAndRefresh,
    reloadDataStore,
} from './dataReload';
import { rootReducer } from './reducers';
import { actions as kanbanActions } from './components/Kanban/action';
import { DBs, runInTransaction } from '../main/db';
import dbs from './dbs';
import type { Card, KanbanBoard, List } from './components/Kanban/type';

const board: KanbanBoard = {
    _id: 'b1',
    name: 'Board',
    description: '',
    lists: ['l1'],
    focusedList: 'l1',
    doneList: '',
    relatedSessions: [],
    spentHours: 0,
};

const list: List = { _id: 'l1', title: 'Todo', cards: ['c1'] };

const card: Card = {
    _id: 'c1',
    title: 'Card',
    content: '',
    sessionIds: [],
    spentTimeInHour: { estimated: 0, actual: 0 },
};

const makeStore = () => createStore(rootReducer, applyMiddleware(thunk));

describe('reloadDataStore', () => {
    beforeEach(async () => {
        runInTransaction(() => {
            for (const name of ['kanbanDB', 'listsDB', 'cardsDB'] as const) {
                (DBs as any)[name].clearSync();
            }
        });
        await dbs.kanbanDB.insert(board);
        await dbs.listsDB.insert(list);
        await dbs.cardsDB.insert(card);
    });

    it('re-reads boards, lists and cards into the store', async () => {
        const store = makeStore();
        expect(Object.keys(store.getState().kanban.boards)).toHaveLength(0);

        await store.dispatch(reloadDataStore() as any);

        const state = store.getState();
        expect(state.kanban.boards.b1.name).toBe('Board');
        expect(state.kanban.lists.l1.title).toBe('Todo');
        expect(state.kanban.cards.c1.title).toBe('Card');
    });

    it('bumps the timer token and the history key so both reload', async () => {
        const store = makeStore();
        const before = store.getState();

        await store.dispatch(reloadDataStore() as any);

        expect(store.getState().timer.sessionReloadToken).toBe(before.timer.sessionReloadToken + 1);
        expect(store.getState().history.expiringKey).not.toBe(before.history.expiringKey);
    });

    it('clears a chosen board that no longer exists', async () => {
        const store = makeStore();
        await store.dispatch(kanbanActions.setChosenBoardId('gone') as any);

        await store.dispatch(reloadDataStore() as any);

        expect(store.getState().kanban.kanban.chosenBoardId).toBeUndefined();
    });
});

// Regression: deleting a session from either dialog only wrote the card rows
// back. History's calendar and the Timer's "today" dots read sessions from the
// database and watch these two tokens, so the deleted record stayed on screen
// until an unrelated reload.
describe('applySessionEditsAndRefresh', () => {
    it('writes the edited rows back and invalidates the session views', () => {
        const store = makeStore();
        const before = store.getState();

        store.dispatch(
            applySessionEditsAndRefresh({
                deleted: [],
                sessions: [],
                updatedCards: { c1: { ...card, sessionIds: ['s1'] } },
                updatedBoards: {},
            }) as any
        );

        expect(store.getState().kanban.cards.c1.sessionIds).toEqual(['s1']);
        expect(store.getState().timer.sessionReloadToken).toBe(before.timer.sessionReloadToken + 1);
        expect(store.getState().history.expiringKey).not.toBe(before.history.expiringKey);
    });
});

// Regression: a cross-board move rewrites the `boardId` of every session the
// card counts, so History and the Timer kept showing those sessions on the old
// project until a restart.
describe('moveCardToBoardAndRefresh', () => {
    const originalApi = (window as any).api;

    afterEach(() => {
        (window as any).api = originalApi;
    });

    it('moves the card and invalidates the session views', async () => {
        const store = makeStore();
        const before = store.getState();
        const moveCardToBoard = jest.fn().mockResolvedValue({
            updatedCards: { c1: { ...card, sessionIds: ['s1'] } },
            updatedLists: {},
            updatedBoards: {},
        });
        (window as any).api = { ...originalApi, moveCardToBoard };

        await store.dispatch(moveCardToBoardAndRefresh('c1', 'l2') as any);

        expect(moveCardToBoard).toHaveBeenCalledWith({ cardId: 'c1', targetListId: 'l2' });
        expect(store.getState().kanban.cards.c1.sessionIds).toEqual(['s1']);
        expect(store.getState().timer.sessionReloadToken).toBe(before.timer.sessionReloadToken + 1);
        expect(store.getState().history.expiringKey).not.toBe(before.history.expiringKey);
    });
});
