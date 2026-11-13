import { createAction, createReducer } from '@reduxjs/toolkit';
import { Dispatch } from 'redux';
import { actions as cardAction } from '../Card/action';
import { applyKanbanDeletion, deleteKanbanItems } from '../deletion';
import { applyCardMove } from '../cardMove';
import { applyDataRepair } from '../dataRepair';
import { applyKanbanSnapshot } from '../snapshot';
import { uid } from '../../../../utils/uid';
import { workers } from '../../../workers';
import { feedback } from '../../feedback';
import { t } from '../../../i18n';
import type { RootState } from '../../../reducers';
import { List, ListsState } from '../type';

const db = workers.dbWorkers.listsDB;

/**
 * Resolves the indexes the drag library reported into real indexes in
 * `list.cards`.
 *
 * A filtered column (board search) reports positions inside `visibleCards`, so
 * both the card being dragged and the drop position have to be translated. The
 * reducer and the thunk share this: resolving twice risks picking different
 * cards and leaving the screen and the database disagreeing.
 */
const resolveDragIndexes = (
    lists: ListsState,
    fromListId: string,
    toListId: string,
    fromIndex: number,
    toIndex: number
): { cardId: string; fromIndex: number; toIndex: number } | null => {
    const fromList = lists[fromListId];
    if (fromList === undefined) {
        return null;
    }

    let realFrom = fromIndex;
    let realTo = toIndex;
    if (fromList.visibleCards) {
        realFrom = fromList.cards.indexOf(fromList.visibleCards[fromIndex]);
        if (realFrom < 0) {
            return null;
        }
        if (fromListId === toListId) {
            if (toIndex < fromList.visibleCards.length) {
                realTo = fromList.cards.indexOf(fromList.visibleCards[toIndex]);
            } else {
                const lastVisible = fromList.visibleCards[fromList.visibleCards.length - 1];
                realTo = fromList.cards.indexOf(lastVisible) + 1;
            }
        }
    }

    const cardId = fromList.cards[realFrom];
    if (cardId === undefined) {
        return null;
    }
    return { cardId, fromIndex: realFrom, toIndex: realTo };
};

const addList = createAction('[List]ADD', (_id: string, title: string) => ({
    payload: { _id, title },
}));

const setLists = createAction('[List]SET_Lists', (lists: ListsState) => ({ payload: lists }));

const moveCard = createAction(
    '[List]MOVE_CARD',
    (fromListId: string, toListId: string, fromIndex: number, toIndex: number) => ({
        payload: { fromListId, toListId, fromIndex, toIndex },
    })
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
        .addCase(applyKanbanSnapshot, (_state, { payload }) => payload.lists)
        .addCase(moveCard, (state, { payload: { fromListId, toListId, fromIndex, toIndex } }) => {
            const resolved = resolveDragIndexes(state, fromListId, toListId, fromIndex, toIndex);
            if (resolved === null) {
                return state;
            }

            const fromCards = Array.from(state[fromListId].cards);
            const [moved] = fromCards.splice(resolved.fromIndex, 1);
            if (moved === undefined) {
                return state;
            }

            if (fromListId === toListId) {
                fromCards.splice(resolved.toIndex, 0, moved);
                return {
                    ...state,
                    [fromListId]: {
                        ...state[fromListId],
                        cards: fromCards,
                    },
                };
            }

            const toList = state[toListId];
            if (toList === undefined) {
                return state;
            }
            const toCards = Array.from(toList.cards);
            toCards.splice(resolved.toIndex, 0, moved);
            return {
                ...state,
                [fromListId]: {
                    ...state[fromListId],
                    cards: fromCards,
                },
                [toListId]: {
                    ...toList,
                    cards: toCards,
                },
            };
        })
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
        .addCase(applyKanbanDeletion, (state, { payload }) => {
            const next = { ...state };
            for (const _id of payload.lists) {
                delete next[_id];
            }
            for (const [id, list] of Object.entries(payload.updatedLists)) {
                next[id] = { ...list, visibleCards: state[id]?.visibleCards };
            }
            return next;
        })
        .addCase(applyCardMove, (state, { payload }) => {
            const ids = Object.keys(payload.updatedLists);
            if (ids.length === 0) {
                return state;
            }
            const next = { ...state };
            for (const id of ids) {
                // `visibleCards` is renderer state (the board search filter);
                // the transaction returns the row as stored, which may carry a
                // stale copy. Keep whatever the current view is filtering by.
                next[id] = { ...payload.updatedLists[id], visibleCards: state[id]?.visibleCards };
            }
            return next;
        })
        .addCase(applyDataRepair, (state, { payload }) => {
            if (
                payload.removedLists.length === 0 &&
                Object.keys(payload.updatedLists).length === 0
            ) {
                return state;
            }
            const next = { ...state };
            for (const _id of payload.removedLists) {
                delete next[_id];
            }
            for (const [id, list] of Object.entries(payload.updatedLists)) {
                next[id] = { ...list, visibleCards: state[id]?.visibleCards };
            }
            return next;
        })
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
        async (dispatch: Dispatch, getState: () => RootState) => {
            // The indexes the drag library reports are positions in the
            // *filtered* column while a search is active. Resolve them against
            // the real arrays once, and use the same result for the optimistic
            // update and for the write -- two separate resolutions could pick
            // different cards and leave the screen and the database disagreeing.
            const resolved = resolveDragIndexes(
                getState().kanban.lists,
                fromListId,
                toListId,
                fromIndex,
                toIndex
            );
            if (resolved === null) {
                return;
            }

            dispatch(moveCard(fromListId, toListId, fromIndex, toIndex));

            try {
                const result = await window.api.moveCardInBoard({
                    cardId: resolved.cardId,
                    fromListId,
                    toListId,
                    toIndex: resolved.toIndex,
                });
                // The optimistic update guessed the same indexes, but the
                // transaction is the authority: replace both lists (and the
                // card when landing in the done list stamped `completedTime`).
                dispatch(applyCardMove(result));
            } catch (error) {
                // Reload rather than try to invert the optimistic splice: the
                // write may have failed for a reason that also changed other
                // rows, and the list is the source of truth.
                await (dispatch as any)(actions.fetchLists());
                feedback.toast({
                    kind: 'error',
                    content: t('kanban.dragFailed'),
                });
                console.error(error);
            }
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
    deleteList: (_id: string, _boardId?: string) => async (dispatch: Dispatch) => {
        await deleteKanbanItems({ lists: [_id] })(dispatch);
    },
    deleteCard: (_id: string, cardId: string) => async (dispatch: Dispatch) => {
        await deleteKanbanItems({ cards: [cardId] })(dispatch);
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

export type ListActionTypes = { [key in keyof typeof actions]: (typeof actions)[key] };
