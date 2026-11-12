import { actions, boardReducer, KanbanBoardState, defaultBoard, getCardView } from './action';
import { applyMiddleware, createStore, Dispatch } from 'redux';
import { thunk } from 'redux-thunk';
import { reducer as kanbanReducer } from '../reducer';
import { uid } from '../../../../utils/uid';
import dbs from '../../../dbs';
import { AsyncDB } from '../../../../utils/dbHelper';
import { KanbanBoard } from '../type';

const db = new AsyncDB(dbs.kanbanDB);
const listsDB = new AsyncDB(dbs.listsDB);
const cardsDB = new AsyncDB(dbs.cardsDB);
const sessionDB = new AsyncDB(dbs.sessionDB);

describe('boardReducer', () => {
    it('applies MOVE_LIST to the board state', async () => {
        let state: KanbanBoardState = {};
        // @ts-ignore
        const dispatch: Dispatch = (action: any) => {
            try {
                state = boardReducer(state, action);
            } catch (e) {
                console.warn(e);
            }
        };

        await actions.addBoard('B0', 'B0')(dispatch);
        expect(state['B0'].lists.length).toBe(4);
        const lists = state['B0'].lists.concat();
        await actions.moveList('B0', 0, 2)(dispatch);
        expect(state['B0'].lists).toStrictEqual([lists[1], lists[2], lists[0], lists[3]]);
    });
});

describe('board actions', () => {
    it('persists a list move', async () => {
        const _id = uid();
        let state: KanbanBoardState = {};
        // @ts-ignore
        const dispatch: Dispatch = (action: any) => {
            try {
                state = boardReducer(state, action);
            } catch (e) {
                console.warn(e);
            }
        };
        await actions.addBoard(_id, 'B0')(dispatch);
        const doc: KanbanBoard = await db.findOne({ _id });
        expect(doc.lists.length).toBe(4);
        delete doc.lastVisitTime;
        expect(doc).toStrictEqual(state[_id]);
        await actions.moveList(_id, 0, 2)(dispatch);
        const newDoc: KanbanBoard = await db.findOne({ _id });
        expect(newDoc.lists[0]).toBe(doc.lists[1]);
        expect(newDoc.lists[1]).toBe(doc.lists[2]);
        expect(newDoc.lists[2]).toBe(doc.lists[0]);
        expect(newDoc.lists[3]).toBe(doc.lists[3]);
        delete newDoc.lastVisitTime;
        expect(newDoc).toStrictEqual(state[_id]);

        await actions.addListById(_id, 'list')(dispatch);
        const list = state[_id].lists;
        expect(list[list.length - 1]).toBe('list');
    });

    it('persists edits and the last visit time', async () => {
        const _id = uid();
        let state: KanbanBoardState = {};
        // @ts-ignore
        const dispatch: Dispatch = (action: any) => {
            state = boardReducer(state, action);
        };

        await actions.addBoard(_id, _id)(dispatch);
        await actions.editBoard(_id, 'new_name', 'new_name', true)(dispatch);
        await actions.setLastVisitTime(_id, 1000)(dispatch);

        expect(state[_id].name).toBe('new_name');
        expect(state[_id].description).toBe('new_name');
        expect(state[_id].hidden).toBe(true);
        expect(state[_id].lastVisitTime).toBe(1000);
        expect(await db.findOne({ _id })).toStrictEqual(state[_id]);
    });

    it('records a finished session on the board', async () => {
        const _id = uid();
        let state: KanbanBoardState = {};
        // @ts-ignore
        const dispatch: Dispatch = (action: any) => {
            state = boardReducer(state, action);
        };

        await actions.addBoard(_id, _id)(dispatch);
        await actions.onTimerFinished(_id, '111', 123, undefined)(dispatch);

        expect(state[_id].relatedSessions).toStrictEqual(['111']);
        expect(state[_id].spentHours).toStrictEqual(123);
        expect(await db.findOne({ _id })).toStrictEqual(state[_id]);
    });

    it('credits a finished session to exactly one card', async () => {
        const _id = uid();
        let state: KanbanBoardState = {};
        // @ts-ignore
        const dispatch: Dispatch = (action: any) => {
            state = boardReducer(state, action);
        };

        await actions.addBoard(_id, _id)(dispatch);
        const first = uid();
        const second = uid();
        for (const cardId of [first, second]) {
            await cardsDB.insert({
                _id: cardId,
                title: cardId,
                content: '',
                sessionIds: [],
                spentTimeInHour: { estimated: 0, actual: 0 },
            });
        }

        await actions.onTimerFinished(_id, 's1', 0.5, first)(dispatch);

        const credited = await cardsDB.findOne({ _id: first });
        const untouched = await cardsDB.findOne({ _id: second });
        expect(credited.sessionIds).toStrictEqual(['s1']);
        expect(credited.spentTimeInHour.actual).toBeCloseTo(0.5);
        // The list usually holds more than one card; only the picked one counts
        // the session, so the board total does not get multiplied on import.
        expect(untouched.sessionIds).toStrictEqual([]);
        expect(untouched.spentTimeInHour.actual).toBe(0);
    });

    it('removes the board from the state', async () => {
        const _id = uid();
        let state: KanbanBoardState = {};
        // @ts-ignore
        const dispatch: Dispatch = (action: any) => {
            state = boardReducer(state, action);
        };

        await actions.addBoard(_id, _id)(dispatch);
        await actions.deleteBoard(_id)(dispatch);

        expect(state[_id]).toBeUndefined();
    });

    it('creates a board with 4 default lists (Backlog on the left) and keeps the welcome card in TODO', async () => {
        const _id = uid();
        // @ts-ignore
        const dispatch: Dispatch = jest.fn();
        await actions.addBoard(_id, 'B0')(dispatch);
        const board: KanbanBoard = await db.findOne({ _id });
        expect(board.lists.length).toBe(4);
        expect(board.focusedList).toBe(board.lists[2]);
        expect(board.doneList).toBe(board.lists[3]);

        const titles: string[] = [];
        for (const listId of board.lists) {
            const list = await listsDB.findOne({ _id: listId });
            titles.push(list.title);
        }
        expect(titles).toStrictEqual(['Backlog', 'TODO', 'In Progress', 'Done']);

        // Backlog 列不自动放置卡片
        const backlogList = await listsDB.findOne({ _id: board.lists[0] });
        expect(backlogList.cards).toStrictEqual([]);

        // Welcome 演示卡片保留在 TODO 列
        const todoList = await listsDB.findOne({ _id: board.lists[1] });
        expect(todoList.cards).toHaveLength(1);
    });

    it('stores createdTime on the board so it can be sorted by creation time', async () => {
        const _id = uid();
        let state: KanbanBoardState = {};
        // @ts-ignore
        const dispatch: Dispatch = (action: any) => {
            try {
                state = boardReducer(state, action);
            } catch (e) {
                console.warn(e);
            }
        };
        await actions.addBoard(_id, 'B0')(dispatch);
        const board: KanbanBoard = await db.findOne({ _id });
        expect(board.createdTime).toBeDefined();
        expect(state[_id].createdTime).toBe(board.createdTime);
    });

    it('backfills createdTime for legacy boards from the earliest card createdTime', async () => {
        const boardId = uid();
        const listId = uid();
        const cardId0 = uid();
        const cardId1 = uid();
        await listsDB.insert({ _id: listId, title: 'list', cards: [cardId0, cardId1] });
        const cards: [string, number][] = [
            [cardId0, 6000],
            [cardId1, 5000],
        ];
        for (const [cardId, createdTime] of cards) {
            await cardsDB.insert({
                createdTime,
                _id: cardId,
                title: 'card',
                content: '',
                sessionIds: [],
                spentTimeInHour: { estimated: 0, actual: 0 },
            });
        }

        const legacyBoard: KanbanBoard = {
            ...defaultBoard,
            _id: boardId,
            name: 'legacy',
            description: '',
            lists: [listId],
            focusedList: '',
            doneList: '',
        };
        delete legacyBoard.createdTime;
        await db.insert(legacyBoard);

        let state: KanbanBoardState = {};
        // @ts-ignore
        const dispatch: Dispatch = (action: any) => {
            try {
                state = boardReducer(state, action);
            } catch (e) {
                console.warn(e);
            }
        };
        await actions.fetchBoards()(dispatch);

        const board: KanbanBoard = await db.findOne({ _id: boardId });
        expect(board.createdTime).toBe(5000);
        expect(state[boardId].createdTime).toBe(5000);
    });

    it('backfills createdTime for legacy boards without card signals using the earliest session', async () => {
        const boardId = uid();
        const legacyBoard: KanbanBoard = {
            ...defaultBoard,
            _id: boardId,
            name: 'legacy',
            description: '',
            lists: [],
            focusedList: '',
            doneList: '',
        };
        delete legacyBoard.createdTime;
        await db.insert(legacyBoard);
        await sessionDB.insert({
            boardId,
            _id: uid(),
            apps: {},
            spentTimeInHour: 1,
            switchTimes: 0,
            startTime: 9000,
        });
        await sessionDB.insert({
            boardId,
            _id: uid(),
            apps: {},
            spentTimeInHour: 1,
            switchTimes: 0,
            startTime: 7000,
        });

        let state: KanbanBoardState = {};
        // @ts-ignore
        const dispatch: Dispatch = (action: any) => {
            try {
                state = boardReducer(state, action);
            } catch (e) {
                console.warn(e);
            }
        };
        await actions.fetchBoards()(dispatch);

        const board: KanbanBoard = await db.findOne({ _id: boardId });
        expect(board.createdTime).toBe(7000);
    });

    it('keeps createdTime missing when no signal is available', async () => {
        const boardId = uid();
        const legacyBoard: KanbanBoard = {
            ...defaultBoard,
            _id: boardId,
            name: 'legacy',
            description: '',
            lists: [],
            focusedList: '',
            doneList: '',
        };
        delete legacyBoard.createdTime;
        await db.insert(legacyBoard);

        let state: KanbanBoardState = {};
        // @ts-ignore
        const dispatch: Dispatch = (action: any) => {
            try {
                state = boardReducer(state, action);
            } catch (e) {
                console.warn(e);
            }
        };
        await actions.fetchBoards()(dispatch);

        const board: KanbanBoard = await db.findOne({ _id: boardId });
        expect(board.createdTime).toBeUndefined();
        expect(state[boardId].createdTime).toBeUndefined();
    });

    it('adds a list without reloading the board', async () => {
        const _id = uid();
        let state: KanbanBoardState = {};
        let added = false;
        // @ts-ignore
        const dispatch: Dispatch = (action: any) => {
            if (action.type.startsWith('[List]')) {
                if (action.payload.title === 'title') {
                    added = true;
                    return;
                }
            }
            try {
                state = boardReducer(state, action);
            } catch (e) {
                console.warn(e);
            }
        };
        await actions.addBoard(_id, _id)(dispatch);
        await actions.addList(_id, 'title')(dispatch);
        expect(added).toBeTruthy();

        await actions.renameBoard(_id, 'lalala')(dispatch);
        expect(state[_id].name).toBe('lalala');
        const lists = state[_id].lists.concat();
        await actions.deleteList(_id, state[_id].lists[0])(dispatch);
        expect(state[_id].lists).toStrictEqual(lists.slice(1));
        state = {};
        await actions.fetchBoards()(dispatch);
        // TODO
        // expect(state).toStrictEqual(oldState);
    });

    it('stamps completedTime through the full board moveCard flow like the app does', async () => {
        // Simulate the app wiring: the store root carries the kanban slice
        // under `kanban` (that is what the thunk reads), with thunk middleware
        // so `dispatch(actions.moveCard(...))` runs the whole flow.
        const store = createStore(
            (state: any = {}, action: any) => ({ kanban: kanbanReducer(state.kanban, action) }),
            applyMiddleware(thunk)
        );
        const dispatch = store.dispatch as any;

        await dispatch(actions.addBoard('b-full', 'board'));
        const state: any = store.getState().kanban;
        const [, todoId, , doneListId] = state.boards['b-full'].lists;
        const cardId = state.lists[todoId].cards[0];
        expect(cardId).toBeDefined();

        // drag the welcome card from TODO into the done list
        await dispatch(actions.moveCard(todoId, doneListId, 0, 0));
        const stamped = await cardsDB.findOne({ _id: cardId });
        expect(typeof stamped.completedTime).toBe('number');
        // the redux state must be updated too, otherwise the card UI would not
        // show the timestamp until a refetch
        expect((store.getState() as any).kanban.cards[cardId].completedTime).toBe(
            stamped.completedTime
        );

        // dragging it back out keeps the last completion time
        await dispatch(actions.moveCard(doneListId, todoId, 0, 0));
        const kept = await cardsDB.findOne({ _id: cardId });
        expect(kept.completedTime).toBe(stamped.completedTime);
        expect((store.getState() as any).kanban.cards[cardId].completedTime).toBe(
            stamped.completedTime
        );
    });

    it('backfills completedTime from the latest move into the done list', async () => {
        const moveDB = new AsyncDB(dbs.moveDB);
        const boardId = uid();
        const todoId = uid();
        const doneListId = uid();
        const cardId = uid();
        await listsDB.insert({ _id: todoId, title: 'TODO', cards: [] });
        await listsDB.insert({ _id: doneListId, title: 'Done', cards: [] });
        await cardsDB.insert({
            _id: cardId,
            title: 'card',
            content: '',
            sessionIds: [],
            spentTimeInHour: { estimated: 0, actual: 0 },
            createdTime: 1000,
        });
        await db.insert({
            ...defaultBoard,
            _id: boardId,
            name: 'board',
            description: '',
            lists: [todoId, doneListId],
            focusedList: todoId,
            doneList: doneListId,
        } as KanbanBoard);
        // the card visited the done list twice: the latest entry wins
        await moveDB.insert({ cardId, fromListId: todoId, toListId: doneListId, time: 3000 });
        await moveDB.insert({ cardId, fromListId: doneListId, toListId: todoId, time: 4000 });
        await moveDB.insert({ cardId, fromListId: todoId, toListId: doneListId, time: 5000 });

        const store = createStore(kanbanReducer, applyMiddleware(thunk));
        const dispatch = store.dispatch as any;
        await actions.fetchBoards()(dispatch);

        const card = await cardsDB.findOne({ _id: cardId });
        expect(card.completedTime).toBe(5000);
        // fetchCards runs after the backfill inside fetchBoards, so the redux
        // state already carries the stamp without an extra refetch
        expect((store.getState() as any).cards[cardId].completedTime).toBe(5000);
    });

    it('backfills completedTime with createdTime for cards born in the done list', async () => {
        const boardId = uid();
        const doneListId = uid();
        const cardId = uid();
        await listsDB.insert({ _id: doneListId, title: 'Done', cards: [cardId] });
        await cardsDB.insert({
            _id: cardId,
            title: 'card',
            content: '',
            sessionIds: [],
            spentTimeInHour: { estimated: 0, actual: 0 },
            createdTime: 7000,
        });
        await db.insert({
            ...defaultBoard,
            _id: boardId,
            name: 'board',
            description: '',
            lists: [doneListId],
            focusedList: '',
            doneList: doneListId,
        } as KanbanBoard);

        const dispatch = jest.fn();
        await actions.fetchBoards()(dispatch);

        // never moved into the done list, so creation time is the only signal
        const card = await cardsDB.findOne({ _id: cardId });
        expect(card.completedTime).toBe(7000);
    });

    it('keeps an existing completedTime when backfilling', async () => {
        const moveDB = new AsyncDB(dbs.moveDB);
        const boardId = uid();
        const doneListId = uid();
        const cardId = uid();
        await listsDB.insert({ _id: doneListId, title: 'Done', cards: [] });
        await cardsDB.insert({
            _id: cardId,
            title: 'card',
            content: '',
            sessionIds: [],
            spentTimeInHour: { estimated: 0, actual: 0 },
            completedTime: 1111,
        });
        await db.insert({
            ...defaultBoard,
            _id: boardId,
            name: 'board',
            description: '',
            lists: [doneListId],
            focusedList: '',
            doneList: doneListId,
        } as KanbanBoard);
        // a later move into the done list must not overwrite an existing stamp
        await moveDB.insert({
            cardId,
            fromListId: uid(),
            toListId: doneListId,
            time: 9999,
        });

        const dispatch = jest.fn();
        await actions.fetchBoards()(dispatch);

        const card = await cardsDB.findOne({ _id: cardId });
        expect(card.completedTime).toBe(1111);
    });

    it('stores cardView and drops the retired collapsed flag', async () => {
        const _id = uid();
        let state: KanbanBoardState = {};
        // @ts-ignore
        const dispatch: Dispatch = (action: any) => {
            try {
                state = boardReducer(state, action);
            } catch (e) {
                console.warn(e);
            }
        };
        await actions.addBoard(_id, 'B0')(dispatch);
        expect(state[_id].cardView).toBe('full');

        await actions.setCardView(_id, 'title')(dispatch);
        expect(state[_id].cardView).toBe('title');
        const stored: KanbanBoard = await db.findOne({ _id });
        expect(stored.cardView).toBe('title');

        // A board written by the previous version still carries `collapsed`
        // and has no `cardView`. The fetch removes the retired key and the
        // selector falls back to the default (`full`).
        const legacyId = uid();
        const legacyBoard: any = {
            ...defaultBoard,
            _id: legacyId,
            name: 'legacy',
            collapsed: true,
        };
        delete legacyBoard.cardView;
        await db.insert(legacyBoard);
        await actions.fetchBoards()(dispatch);

        const legacy = await db.findOne({ _id: legacyId });
        expect((legacy as any).collapsed).toBeUndefined();
        expect(getCardView(legacy)).toBe('full');
    });
});
