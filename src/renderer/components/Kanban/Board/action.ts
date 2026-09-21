import { createActionCreator, createReducer } from 'deox';
import { Dispatch } from 'redux';
import { actions as listActions } from '../List/action';
import { actions as cardActions } from '../Card/action';
import { actions as kanbanActions } from '../action';
import { actions as historyActions } from '../../History/action';
import shortid from 'shortid';
import { lang } from '../../../../lang/en';
import { actions as timerActions, DistractingRow } from '../../Timer/action';
import { RootState } from '../../../reducers';
import { workers } from '../../../workers';
import { PomodoroRecord } from '../../../monitor/type';
import { AggInfo, Card, KanbanBoard, List, MoveInfo } from '../type';

const db = workers.dbWorkers.kanbanDB;
const listsDB = workers.dbWorkers.listsDB;
const cardsDB = workers.dbWorkers.cardsDB;
const sessionDB = workers.dbWorkers.sessionDB;
const moveDB = workers.dbWorkers.moveDB;

export const defaultBoard: KanbanBoard = {
    _id: '',
    lists: [],
    name: '',
    focusedList: '',
    doneList: '',
    description: '',
    collapsed: false,
    relatedSessions: [],
    spentHours: 0,
    createdTime: 0,
};

export type KanbanBoardState = { [_id: string]: KanbanBoard };

const addBoard = createActionCreator(
    '[Board]ADD',
    (resolve) =>
        (
            _id: string,
            name: string,
            description: string,
            lists: string[],
            focusedList: string,
            doneList: string,
            createdTime: number
        ) =>
            resolve({ _id, name, description, lists, focusedList, doneList, createdTime })
);

const setBoardMap = createActionCreator(
    '[Board]SET_BOARD_MAP',
    (resolve) => (boards: KanbanBoardState) => resolve(boards)
);

const moveList = createActionCreator(
    '[Board]MOVE_LIST',
    (resolve) => (_id: string, fromIndex: number, toIndex: number) =>
        resolve({ _id, fromIndex, toIndex })
);

const renameBoard = createActionCreator(
    '[Board]RENAME',
    (resolve) => (_id, name) => resolve({ _id, name })
);

const addList = createActionCreator(
    '[Board]ADD_LIST',
    (resolve) => (_id, listId) => resolve({ _id, cardId: listId })
);

const deleteBoard = createActionCreator('[Board]DEL_BOARD', (resolve) => (_id) => resolve({ _id }));

const deleteList = createActionCreator(
    '[Board]DEL_LIST',
    (resolve) => (_id, listId) => resolve({ _id, listId })
);

const setLastVisitTime = createActionCreator(
    '[Board]SET_LAST_VISIT_TIME',
    (resolve) => (_id, time) => resolve({ _id, time })
);

const onTimerFinished = createActionCreator(
    '[Board]ON_TIMER_FINISHED',
    (resolve) => (_id: string, sessionId: string, spentTime: number) =>
        resolve({ _id, sessionId, spentTime })
);

const editBoard = createActionCreator(
    '[Board]EDIT',
    (resolve) => (_id: string, name: string, description: string) =>
        resolve({ _id, name, description })
);

const setPin = createActionCreator(
    '[Board]SET_PIN',
    (resolve) => (_id: string, pin: boolean) => resolve({ _id, pin })
);

const updateAggInfo = createActionCreator(
    '[Board]UPDATE_AGG_INFO',
    (resolve) => (_id: string, aggInfo: AggInfo) => resolve({ _id, aggInfo })
);

const setDistractionList = createActionCreator(
    '[Board]SET_DISTRACTION_LIST',
    (resolve) => (_id: string, distractionList?: DistractingRow[]) =>
        resolve({ _id, distractionList })
);

const setCollapsed = createActionCreator(
    '[Board]SET_COLLAPSED',
    (resolve) => (_id: string, collapsed: boolean) => resolve({ _id, collapsed })
);

export const boardReducer = createReducer<KanbanBoardState, any>({}, (handle) => [
    handle(
        addBoard,
        (
            state,
            { payload: { _id, name, description, lists, focusedList, doneList, createdTime } }
        ) => ({
            ...state,
            [_id]: {
                ...defaultBoard,
                _id,
                description,
                name,
                lists,
                focusedList,
                doneList,
                createdTime,
            },
        })
    ),

    handle(setBoardMap, (state, { payload }) => payload),
    handle(setPin, (state, { payload: { _id, pin } }) => ({
        ...state,
        [_id]: {
            ...state[_id],
            pin,
        },
    })),
    handle(moveList, (state, { payload: { _id, fromIndex, toIndex } }) => {
        const newState = { ...state };
        const lists = newState[_id].lists.concat();
        const [rm] = lists.splice(fromIndex, 1);
        lists.splice(toIndex, 0, rm);
        newState[_id].lists = lists;
        return newState;
    }),

    handle(renameBoard, (state, { payload: { _id, name } }) => {
        return {
            ...state,
            [_id]: {
                ...state[_id],
                name,
            },
        };
    }),

    handle(addList, (state, { payload: { _id, cardId } }) => ({
        ...state,
        [_id]: {
            ...state[_id],
            lists: [...state[_id].lists, cardId],
        },
    })),

    handle(deleteBoard, (state, { payload: { _id } }) => {
        const { [_id]: del, ...rest } = state;
        return rest;
    }),

    handle(deleteList, (state, { payload: { _id, listId } }) => {
        const newState = { ...state };
        newState[_id].lists = newState[_id].lists.filter((v) => v !== listId);
        return newState;
    }),

    handle(onTimerFinished, (state, { payload: { _id, sessionId, spentTime } }) => {
        return {
            ...state,
            [_id]: {
                ...state[_id],
                relatedSessions: state[_id].relatedSessions.concat([sessionId]),
                spentHours: state[_id].spentHours + spentTime,
            },
        };
    }),

    handle(setLastVisitTime, (state, { payload: { _id, time } }) => {
        return {
            ...state,
            [_id]: {
                ...state[_id],
                lastVisitTime: time,
            },
        };
    }),

    handle(editBoard, (state, { payload: { _id, name, description } }) => ({
        ...state,
        [_id]: {
            ...state[_id],
            name,
            description,
        },
    })),

    handle(setDistractionList, (state, { payload: { _id, distractionList } }) => ({
        ...state,
        [_id]: {
            ...state[_id],
            distractionList,
        },
    })),

    handle(setCollapsed, (state, { payload: { _id, collapsed } }) => ({
        ...state,
        [_id]: {
            ...state[_id],
            collapsed,
        },
    })),
]);

/**
 * Backfill createdTime for legacy boards (created before the field existed):
 * 1. use the earliest createdTime among the board's cards (a card must be created
 *    after its board, so this is a lower bound of the board's creation time);
 * 2. fall back to the earliest startTime of the board's related sessions;
 * 3. keep the field missing when no signal is available.
 * The estimation is persisted once, so following runs skip the backfill.
 */
async function backfillCreatedTimes(boardMap: KanbanBoardState) {
    const legacyBoardIds = Object.keys(boardMap).filter(
        (boardId) => !boardMap[boardId].createdTime
    );
    // nothing to migrate, skip querying the other collections
    if (legacyBoardIds.length === 0) {
        return;
    }

    const lists: List[] = await listsDB.find({}, {});
    const listMap: { [_id: string]: List } = {};
    for (const list of lists) {
        listMap[list._id] = list;
    }

    const cards: Card[] = await cardsDB.find({}, {});
    const cardCreatedTime: { [_id: string]: number } = {};
    for (const card of cards) {
        if (typeof card.createdTime === 'number') {
            cardCreatedTime[card._id] = card.createdTime;
        }
    }

    const noCardSignal: string[] = [];
    for (const boardId of legacyBoardIds) {
        const board = boardMap[boardId];
        let createdTime: number | undefined;
        for (const listId of board.lists) {
            const list = listMap[listId];
            if (list == null) {
                continue;
            }

            for (const cardId of list.cards) {
                const time = cardCreatedTime[cardId];
                if (time != null && (createdTime === undefined || time < createdTime)) {
                    createdTime = time;
                }
            }
        }

        if (createdTime === undefined) {
            noCardSignal.push(boardId);
        } else {
            boardMap[boardId].createdTime = createdTime;
            await db.update({ _id: boardId }, { $set: { createdTime } });
        }
    }

    if (noCardSignal.length === 0) {
        return;
    }

    const records: PomodoroRecord[] = await sessionDB.find({ boardId: { $in: noCardSignal } }, {});
    const earliestStartTime: { [boardId: string]: number } = {};
    for (const record of records) {
        if (record.boardId == null) {
            continue;
        }

        const known = earliestStartTime[record.boardId];
        if (known === undefined || record.startTime < known) {
            earliestStartTime[record.boardId] = record.startTime;
        }
    }

    for (const boardId of noCardSignal) {
        const createdTime = earliestStartTime[boardId];
        if (createdTime != null) {
            boardMap[boardId].createdTime = createdTime;
            await db.update({ _id: boardId }, { $set: { createdTime } });
        }
    }
}

/**
 * Backfill completedTime for legacy cards (completed before the field
 * existed):
 * 1. for cards that were moved into a board's done list, use the latest such
 *    move recorded in moveDB;
 * 2. fall back to createdTime for cards that were created directly inside a
 *    done list and never moved into it;
 * 3. keep the field missing when no signal is available.
 * Cards already carrying a completedTime (auto stamps and manual values) are
 * left untouched, so every card is backfilled at most once.
 */
async function backfillCompletedTimes(boardMap: KanbanBoardState) {
    const doneListIds = Object.values(boardMap)
        .map((board) => board.doneList)
        .filter((listId) => listId !== '');
    if (doneListIds.length === 0) {
        return;
    }

    const cards: Card[] = await cardsDB.find({}, {});
    const cardById: { [_id: string]: Card } = {};
    const unstampedCardIds: string[] = [];
    for (const card of cards) {
        cardById[card._id] = card;
        if (card.completedTime === undefined) {
            unstampedCardIds.push(card._id);
        }
    }

    if (unstampedCardIds.length === 0) {
        return;
    }

    const completedTimeByCard: { [cardId: string]: number } = {};
    const moves: MoveInfo[] = await moveDB.find(
        { toListId: { $in: doneListIds }, cardId: { $in: unstampedCardIds } },
        {}
    );
    for (const move of moves) {
        const known = completedTimeByCard[move.cardId];
        if (known === undefined || move.time > known) {
            completedTimeByCard[move.cardId] = move.time;
        }
    }

    // Cards created directly inside a done list were never moved into it:
    // fall back to their creation time.
    const doneLists: List[] = await listsDB.find({ _id: { $in: doneListIds } }, {});
    for (const list of doneLists) {
        for (const cardId of list.cards) {
            if (completedTimeByCard[cardId] !== undefined) {
                continue;
            }

            const createdTime = cardById[cardId]?.createdTime;
            if (typeof createdTime === 'number') {
                completedTimeByCard[cardId] = createdTime;
            }
        }
    }

    for (const cardId of unstampedCardIds) {
        const completedTime = completedTimeByCard[cardId];
        if (completedTime === undefined) {
            continue;
        }

        await cardsDB.update({ _id: cardId }, { $set: { completedTime } });
    }
}

export const actions = {
    fetchBoards: () => async (dispatch: Dispatch) => {
        const boards: KanbanBoard[] = await db.find({}, {});
        const boardMap: KanbanBoardState = {};
        for (const board of boards) {
            boardMap[board._id] = board;
        }

        await backfillCreatedTimes(boardMap);
        await backfillCompletedTimes(boardMap);
        await listActions.fetchLists()(dispatch);
        await cardActions.fetchCards()(dispatch);
        dispatch(setBoardMap(boardMap));
        await kanbanActions.fetchSortState()(dispatch);
    },
    moveList: (_id: string, fromIndex: number, toIndex: number) => async (dispatch: Dispatch) => {
        dispatch(moveList(_id, fromIndex, toIndex));
        const board: KanbanBoard = await db.findOne({ _id });
        const lists = board.lists;
        const [del] = lists.splice(fromIndex, 1);
        lists.splice(toIndex, 0, del);
        await db.update({ _id }, { $set: { lists } });
    },
    renameBoard: (_id: string, name: string) => async (dispatch: Dispatch) => {
        dispatch(renameBoard(_id, name));
        await db.update({ _id }, { $set: { name } });
    },
    addList: (_id: string, listTitle: string) => async (dispatch: Dispatch) => {
        const listId = shortid.generate();
        dispatch(addList(_id, listId));
        await listActions.addList(listId, listTitle)(dispatch);
        await db.update({ _id }, { $push: { lists: listId } });
    },
    addListById: (_id: string, listId: string) => async (dispatch: Dispatch) => {
        dispatch(addList(_id, listId));
        await db.update({ _id }, { $push: { lists: listId } });
    },
    deleteBoard: (_id: string) => async (dispatch: Dispatch, getState?: () => RootState) => {
        dispatch(deleteBoard(_id));
        // `timer.boardId` (the focusing project on the Timer page) may
        // point at the board being deleted. Leaving it dangling makes the
        // Timer's sider keep rendering the lists/cards of a nonexistent
        // board, which crashes the renderer as soon as the board state is
        // removed. Clear the selection in the same update batch.
        if (getState !== undefined && getState().timer.boardId === _id) {
            dispatch(timerActions.setBoardId(undefined));
        }
        await kanbanActions.setChosenBoardId(undefined)(dispatch);
        await db.remove({ _id });
    },
    deleteList: (_id: string, listId: string) => async (dispatch: Dispatch) => {
        dispatch(deleteList(_id, listId));
        await listActions.deleteList(listId)(dispatch);
        await db.update({ _id }, { $pull: { lists: listId } });
    },

    addBoard:
        (_id: string, name: string, description: string = '') =>
        async (dispatch: Dispatch) => {
            const createdTime = new Date().getTime();
            const lists = [];
            for (const name of ['Backlog', 'TODO', 'In Progress', 'Done']) {
                const listId = shortid.generate();
                await listActions.addList(listId, name)(dispatch);
                lists.push(listId);
            }
            dispatch(addBoard(_id, name, description, lists, lists[2], lists[3], createdTime));

            const cardId = shortid.generate();
            await cardActions.addCard(
                cardId,
                lists[1],
                lang.welcome,
                lang.demoCardContent
            )(dispatch);
            await db.insert({
                ...defaultBoard,
                _id,
                description,
                name,
                lists,
                createdTime,
                lastVisitTime: new Date().getTime(),
                focusedList: lists[2],
                doneList: lists[3],
            } as KanbanBoard);
        },

    setLastVisitTime: (_id: string, time: number) => async (dispatch: Dispatch) => {
        dispatch(setLastVisitTime(_id, time));
        await db.update({ _id }, { $set: { lastVisitTime: time } });
    },

    moveCard:
        (fromListId: string, toListId: string, fromIndex: number, toIndex: number) =>
        async (dispatch: Dispatch) => {
            await listActions.moveCard(fromListId, toListId, fromIndex, toIndex)(dispatch);
        },

    /**
     * Called by the list actions after a card landed in `toListId`. When that
     * list is the done list of a board, the card is stamped with the completion
     * time. Cards moved out of the done list keep the stamp (it becomes the
     * "last completed" time).
     */
    onCardMovedInto: (toListId: string, cardId: string) => async (dispatch: Dispatch) => {
        const board: KanbanBoard = await db.findOne({ doneList: toListId });
        if (!board) {
            return;
        }

        await cardActions.setCompletedTime(cardId, new Date().getTime())(dispatch);
    },

    onTimerFinished:
        (_id: string, sessionId: string, timeSpent: number, cardIds: string[]) =>
        async (dispatch: Dispatch) => {
            dispatch(onTimerFinished(_id, sessionId, timeSpent));
            dispatch(historyActions.setExpiringKey(_id));
            await db.update(
                { _id },
                { $push: { relatedSessions: sessionId }, $inc: { spentHours: timeSpent } }
            );
            for (const cardId of cardIds) {
                await cardActions.onTimerFinished(cardId, sessionId, timeSpent)(dispatch);
            }

            await actions.setLastVisitTime(_id, new Date().getTime())(dispatch);
        },

    editBoard: (_id: string, name: string, description: string) => async (dispatch: Dispatch) => {
        dispatch(editBoard(_id, name, description));
        await db.update({ _id }, { $set: { name, description } });
    },

    setPin: (_id: string, pin: boolean) => async (dispatch: Dispatch) => {
        dispatch(setPin(_id, pin));
        await db.update({ _id }, { $set: { pin } });
    },

    setDistractionList:
        (_id: string, distractionList?: DistractingRow[]) => async (dispatch: Dispatch) => {
            dispatch(setDistractionList(_id, distractionList));
            await db.update({ _id }, { $set: { distractionList } });
        },

    setCollapsed: (_id: string, collapsed: boolean) => async (dispatch: Dispatch) => {
        dispatch(setCollapsed(_id, collapsed));
        await db.update({ _id }, { $set: { collapsed } });
    },
};

export type BoardActionTypes = { [key in keyof typeof actions]: typeof actions[key] };
