import { createAction, createReducer } from '@reduxjs/toolkit';
import { Dispatch } from 'redux';
import { actions as cardAction } from '../Card/action';
import { actions as boardActions } from '../Board/action';
import { uid } from '../../../../utils/uid';
import { workers } from '../../../workers';
import { List, ListsState } from '../type';

const db = workers.dbWorkers.listsDB;
const moveDB = workers.dbWorkers.moveDB;

const addList = createAction('[List]ADD', (_id: string, title: string) => ({
    payload: { _id, title },
}));

const setLists = createAction('[List]SET_Lists', (lists: ListsState) => ({ payload: lists }));

const moveCard = createAction(
    '[List]MOVE_CARD',
    (
        fromListId: string,
        toListId: string,
        fromIndex: number,
        toIndex: number,
        done: (movedCardId: string) => void
    ) => ({ payload: { fromListId, toListId, fromIndex, toIndex, done } })
);

const renameList = createAction('[List]RENAME', (_id, title) => ({ payload: { _id, title } }));

const addCard = createAction('[List]ADD_CARD', (_id, cardId) => ({ payload: { _id, cardId } }));

const deleteList = createAction('[List]DEL_LIST', (_id) => ({ payload: { _id } }));

const deleteCard = createAction('[List]DEL_CARD', (_id, cardId) => ({ payload: { _id, cardId } }));

const setVisibleCards = createAction(
    '[List]SET_VISIBLE_CARDS',
    (listId: string, cards?: string[]) => ({ payload: { listId, cards } })
);

export const listReducer = createReducer<ListsState>({}, (builder) => {
    builder
        .addCase(addList, (state, { payload: { _id, title } }) => ({
            ...state,
            [_id]: {
                _id,
                title,
                cards: [],
            },
        }))
        .addCase(setLists, (state, { payload }) => payload)
        .addCase(
            moveCard,
            (state, { payload: { fromListId, toListId, fromIndex, toIndex, done } }) => {
                const fromList = state[fromListId];
                const fromCards = Array.from(fromList.cards);
                if (fromList.visibleCards) {
                    // user is actually moving one of the visible cards
                    fromIndex = fromCards.indexOf(fromList.visibleCards[fromIndex]);
                    if (fromListId === toListId) {
                        if (toIndex < fromList.visibleCards.length) {
                            toIndex = fromCards.indexOf(fromList.visibleCards[toIndex]);
                        } else {
                            const lastVisible =
                                fromList.visibleCards[fromList.visibleCards.length - 1];
                            const lastVisibleIndex = fromCards.indexOf(lastVisible);
                            toIndex = lastVisibleIndex + 1;
                        }
                    }
                }

                (async () => {
                    // I hate to write effect in reducer. But I did not find a clean way to get the correct fromIndex
                    const from: List = await db.findOne({ _id: fromListId });
                    const fromCards = from.cards;
                    const [rm] = fromCards.splice(fromIndex, 1);
                    if (fromListId === toListId) {
                        fromCards.splice(toIndex, 0, rm);
                        await db.update({ _id: fromListId }, { $set: { cards: fromCards } }, {});
                        return rm;
                    }

                    const dest: List = await db.findOne({ _id: toListId });
                    const destCards = dest.cards;
                    destCards.splice(toIndex, 0, rm);
                    await db.update({ _id: fromListId }, { $set: { cards: fromCards } }, {});
                    await db.update({ _id: toListId }, { $set: { cards: destCards } }, {});
                    await moveDB.insert({
                        fromListId,
                        toListId,
                        cardId: rm,
                        time: new Date().getTime(),
                    });
                    return rm;
                })().then(done);

                if (fromListId === toListId) {
                    const [del] = fromCards.splice(fromIndex, 1);
                    fromCards.splice(toIndex, 0, del);
                    return {
                        ...state,
                        [fromListId]: {
                            ...state[fromListId],
                            cards: fromCards,
                        },
                    };
                }

                const toCards = Array.from(state[toListId].cards);
                const [del] = fromCards.splice(fromIndex, 1);
                toCards.splice(toIndex, 0, del);
                return {
                    ...state,
                    [fromListId]: {
                        ...state[fromListId],
                        cards: fromCards,
                    },
                    [toListId]: {
                        ...state[toListId],
                        cards: toCards,
                    },
                };
            }
        )
        .addCase(renameList, (state, { payload: { _id, title } }) => {
            return {
                ...state,
                [_id]: {
                    ...state[_id],
                    title,
                },
            };
        })
        .addCase(addCard, (state, { payload: { _id, cardId } }) => ({
            ...state,
            [_id]: {
                ...state[_id],
                cards: [...state[_id].cards, cardId],
            },
        }))
        .addCase(deleteList, (state, { payload: { _id } }) => {
            const { [_id]: _del, ...rest } = state;
            return rest;
        })
        .addCase(deleteCard, (state, { payload: { _id, cardId } }) => ({
            ...state,
            [_id]: {
                ...state[_id],
                cards: state[_id].cards.filter((v) => v !== cardId),
            },
        }))
        .addCase(setVisibleCards, (state, { payload: { listId, cards } }) => ({
            ...state,
            [listId]: {
                ...state[listId],
                visibleCards: cards,
            },
        }));
});

export const actions = {
    setVisibleCards: (listId: string, cards?: string[]) => (dispatch: Dispatch) => {
        dispatch(setVisibleCards(listId, cards));
    },
    fetchLists: () => async (dispatch: Dispatch) => {
        const all: List[] = await db.find({}, {});
        const listMap: ListsState = {};
        for (const list of all) {
            listMap[list._id] = list;
        }

        dispatch(setLists(listMap));
    },

    moveCard:
        (fromListId: string, toListId: string, fromIndex: number, toIndex: number) =>
        async (dispatch: Dispatch) => {
            const movedCardId = await new Promise<string>((resolve) => {
                dispatch(moveCard(fromListId, toListId, fromIndex, toIndex, resolve));
            });
            if (movedCardId == null || fromListId === toListId) {
                return;
            }

            // The board that owns the destination list decides whether the move
            // completes the card (moving inside one list never recompletes it)
            await boardActions.onCardMovedInto(toListId, movedCardId)(dispatch);
        },
    renameList: (_id: string, title: string) => async (dispatch: Dispatch) => {
        dispatch(renameList(_id, title));
        await db.update({ _id }, { $set: { title } });
    },
    addCard:
        (_id: string, cardTitle: string, cardContent?: string) => async (dispatch: Dispatch) => {
            const cardId = uid();
            dispatch(addCard(_id, cardId));
            await cardAction.addCard(cardId, _id, cardTitle, cardContent)(dispatch);
        },
    addCardById: (_id: string, cardId: string) => async (dispatch: Dispatch) => {
        dispatch(addCard(_id, cardId));
        await db.update({ _id }, { $push: { cards: cardId } }, {});
    },
    deleteList: (_id: string, boardId?: string) => async (dispatch: Dispatch) => {
        if (boardId !== undefined) {
            await boardActions.deleteList(boardId, _id)(dispatch);
            return;
        }

        dispatch(deleteList(_id));
        await db.remove({ _id });
    },
    deleteCard: (_id: string, cardId: string) => async (dispatch: Dispatch) => {
        dispatch(deleteCard(_id, cardId));
        await db.update({ _id }, { $pull: { cards: cardId } }, {});
    },
    addList: (_id: string, title: string) => async (dispatch: Dispatch) => {
        dispatch(addList(_id, title));
        await db.insert({
            _id,
            title,
            cards: [],
        });
    },
};

export type ListActionTypes = { [key in keyof typeof actions]: typeof actions[key] };
