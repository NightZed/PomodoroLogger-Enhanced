import { actions, boardReducer, KanbanBoardState, defaultBoard } from './action';
import { applyMiddleware, createStore, Dispatch } from 'redux';
import reduxThunk from 'redux-thunk';
import { reducer as kanbanReducer } from '../reducer';
import { dbBaseDir, dbPaths } from '../../../../config';
import { existsSync, unlink, mkdir } from 'fs';
import { promisify } from 'util';
import shortid from 'shortid';
import dbs from '../../../dbs';
import { AsyncDB } from '../../../../utils/dbHelper';
import { KanbanBoard } from '../type';

const db = new AsyncDB(dbs.kanbanDB);
const listsDB = new AsyncDB(dbs.listsDB);
const cardsDB = new AsyncDB(dbs.cardsDB);
const sessionDB = new AsyncDB(dbs.sessionDB);
beforeEach(async () => {
    if (existsSync(dbPaths.kanbanDB)) {
        await promisify(unlink)(dbPaths.kanbanDB).catch(() => {});
    }

    if (!existsSync(dbBaseDir)) {
        await promisify(mkdir)(dbBaseDir).catch(() => {});
    }
});

describe('boardReducer', () => {
    it('reduce MOVE_LIST', async () => {
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
    it('move list', async () => {
        const _id = shortid.generate();
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

    it('should update after editing, setLastVisit, onTimerFinished, remove', async () => {
        const _id = shortid.generate();
        let state: KanbanBoardState = {};
        // @ts-ignore
        const dispatch: Dispatch = (action: any) => {
            try {
                state = boardReducer(state, action);
            } catch (e) {
                console.warn(e);
            }
        };
        await actions.addBoard(_id, _id)(dispatch);
        actions.editBoard(_id, 'new_name', 'new_name')(dispatch);
        actions.setLastVisitTime(_id, 1000)(dispatch);
        expect(state[_id].lastVisitTime).toBe(1000);
        await actions.onTimerFinished(_id, '111', 123, [])(dispatch);
        expect(state[_id].name).toBe('new_name');
        expect(state[_id].description).toBe('new_name');
        expect(state[_id].relatedSessions).toStrictEqual(['111']);
        expect(state[_id].spentHours).toStrictEqual(123);
        await new Promise((r) => setTimeout(r, 500));
        const board = await db.findOne({ _id });
        expect(board).toStrictEqual(state[_id]);
        actions.deleteBoard(_id)(dispatch);
        expect(state[_id]).toBeUndefined();
    });

    it('creates a board with 4 default lists (Backlog on the left) and keeps the welcome card in TODO', async () => {
        const _id = shortid.generate();
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
        const _id = shortid.generate();
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
        const boardId = shortid.generate();
        const listId = shortid.generate();
        const cardId0 = shortid.generate();
        const cardId1 = shortid.generate();
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
        const boardId = shortid.generate();
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
            _id: shortid.generate(),
            apps: {},
            spentTimeInHour: 1,
            switchTimes: 0,
            startTime: 9000,
        });
        await sessionDB.insert({
            boardId,
            _id: shortid.generate(),
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
        const boardId = shortid.generate();
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

    it('should add list directly', async () => {
        const _id = shortid.generate();
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
        const oldState = Object.assign(state, {});
        state = {};
        await actions.fetchBoards()(dispatch);
        // TODO
        // expect(state).toStrictEqual(oldState);
    });

    it('stamps completedTime when a card lands in the done list', async () => {
        const boardId = shortid.generate();
        const listId = shortid.generate();
        const doneListId = shortid.generate();
        const cardId = shortid.generate();
        await listsDB.insert({ _id: listId, title: 'TODO', cards: [cardId] });
        await listsDB.insert({ _id: doneListId, title: 'Done', cards: [] });
        await cardsDB.insert({
            _id: cardId,
            title: 'card',
            content: '',
            sessionIds: [],
            spentTimeInHour: { estimated: 0, actual: 0 },
        });
        await db.insert({
            ...defaultBoard,
            _id: boardId,
            name: 'board',
            description: '',
            lists: [listId, doneListId],
            focusedList: listId,
            doneList: doneListId,
        } as KanbanBoard);

        const dispatch = jest.fn();
        await actions.onCardMovedInto(doneListId, cardId)(dispatch);
        expect(dispatch.mock.calls[0][0].type).toBe('[Card]SET_COMPLETED_TIME');
        const stamped = await cardsDB.findOne({ _id: cardId });
        expect(typeof stamped.completedTime).toBe('number');

        // moving into a list that is not a done list never clears the stamp:
        // it just becomes the last completion time
        await actions.onCardMovedInto(listId, cardId)(dispatch);
        const kept = await cardsDB.findOne({ _id: cardId });
        expect(kept.completedTime).toBe(stamped.completedTime);
    });

    it('does not stamp completedTime for lists outside any done list', async () => {
        const listId = shortid.generate();
        const cardId = shortid.generate();
        await listsDB.insert({ _id: listId, title: 'TODO', cards: [cardId] });
        await cardsDB.insert({
            _id: cardId,
            title: 'card',
            content: '',
            sessionIds: [],
            spentTimeInHour: { estimated: 0, actual: 0 },
        });

        const dispatch = jest.fn();
        await actions.onCardMovedInto(listId, cardId)(dispatch);
        expect(dispatch).not.toHaveBeenCalled();
        const card = await cardsDB.findOne({ _id: cardId });
        expect(card.completedTime).toBeUndefined();
    });

    it('stamps completedTime through the full board moveCard flow like the app does', async () => {
        // simulate the app wiring: a real store (thunk middleware) with the
        // combined kanban reducers, dispatching through Board.moveCard exactly
        // like Board.tsx's onDragEnd does
        const store = createStore(kanbanReducer, applyMiddleware(reduxThunk));
        const dispatch = store.dispatch as any;

        await actions.addBoard('b-full', 'board')(dispatch);
        const state: any = store.getState();
        const [, todoId, , doneListId] = state.boards['b-full'].lists;
        const cardId = state.lists[todoId].cards[0];
        expect(cardId).toBeDefined();

        // drag the welcome card from TODO into the done list
        await actions.moveCard(todoId, doneListId, 0, 0)(dispatch);
        const stamped = await cardsDB.findOne({ _id: cardId });
        expect(typeof stamped.completedTime).toBe('number');
        // the redux state must be updated too, otherwise the card UI would not
        // show the timestamp until a refetch
        expect((store.getState() as any).cards[cardId].completedTime).toBe(stamped.completedTime);

        // dragging it back out keeps the last completion time
        await actions.moveCard(doneListId, todoId, 0, 0)(dispatch);
        const kept = await cardsDB.findOne({ _id: cardId });
        expect(kept.completedTime).toBe(stamped.completedTime);
        expect((store.getState() as any).cards[cardId].completedTime).toBe(stamped.completedTime);
    });

    it('backfills completedTime from the latest move into the done list', async () => {
        const moveDB = new AsyncDB(dbs.moveDB);
        const boardId = shortid.generate();
        const todoId = shortid.generate();
        const doneListId = shortid.generate();
        const cardId = shortid.generate();
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

        const store = createStore(kanbanReducer, applyMiddleware(reduxThunk));
        const dispatch = store.dispatch as any;
        await actions.fetchBoards()(dispatch);

        const card = await cardsDB.findOne({ _id: cardId });
        expect(card.completedTime).toBe(5000);
        // fetchCards runs after the backfill inside fetchBoards, so the redux
        // state already carries the stamp without an extra refetch
        expect((store.getState() as any).cards[cardId].completedTime).toBe(5000);
    });

    it('backfills completedTime with createdTime for cards born in the done list', async () => {
        const boardId = shortid.generate();
        const doneListId = shortid.generate();
        const cardId = shortid.generate();
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
        const boardId = shortid.generate();
        const doneListId = shortid.generate();
        const cardId = shortid.generate();
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
            fromListId: shortid.generate(),
            toListId: doneListId,
            time: 9999,
        });

        const dispatch = jest.fn();
        await actions.fetchBoards()(dispatch);

        const card = await cardsDB.findOne({ _id: cardId });
        expect(card.completedTime).toBe(1111);
    });
});
