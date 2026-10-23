import { createAction, createReducer } from '@reduxjs/toolkit';
import { Dispatch } from 'redux';
import { actions as listActions } from '../List/action';
import { workers } from '../../../workers';
import { Card, CardLabel } from '../type';

const db = workers.dbWorkers.cardsDB;

export type CardsState = { [_id: string]: Card };

const addSession = createAction(
    '[Card]ADD_SESSION',
    (_id: string, sessionId: string, spentTime: number) => ({
        payload: { _id, sessionId, spentTime },
    })
);

const addCard = createAction(
    '[Card]ADD',
    (_id: string, title?: string, content?: string, createdTime?: number) => ({
        payload: { _id, title, content, createdTime },
    })
);

const renameCard = createAction('[Card]RENAME', (_id: string, title: string) => ({
    payload: { _id, title },
}));

const setContent = createAction('[Card]SET_CONTENT', (_id: string, content: string) => ({
    payload: { _id, content },
}));

const setEstimatedTime = createAction(
    '[Card]SET_ESTIMATED_TIME',
    (_id: string, estimatedTime: number) => ({ payload: { _id, estimatedTime } })
);

const setActualTime = createAction('[Card]SET_ACTUAL_TIME', (_id: string, actualTime: number) => ({
    payload: { _id, actualTime },
}));

const setLabels = createAction('[Card]SET_LABELS', (_id: string, labels: CardLabel[]) => ({
    payload: { _id, labels },
}));

const addActualTime = createAction('[Card]ADD_ACTUAL_TIME', (_id: string, plus: number) => ({
    payload: { _id, plus },
}));

const setCompletedTime = createAction(
    '[Card]SET_COMPLETED_TIME',
    (_id: string, completedTime?: number) => ({ payload: { _id, completedTime } })
);

const deleteCard = createAction('[Card]DELETE_CARD', (_id: string) => ({ payload: { _id } }));

const setCards = createAction('[Card]SET_CARDS', (cards: CardsState) => ({ payload: cards }));

export const actions = {
    fetchCards: () => async (dispatch: Dispatch) => {
        const cards: Card[] = await db.find({}, {});
        const cardMap: CardsState = {};
        for (const card of cards) {
            cardMap[card._id] = card;
        }

        dispatch(setCards(cardMap));
    },
    renameCard: (_id: string, title: string) => async (dispatch: Dispatch) => {
        dispatch(renameCard(_id, title));
        await db.update({ _id }, { $set: { title } });
    },
    setContent: (_id: string, content: string) => async (dispatch: Dispatch) => {
        dispatch(setContent(_id, content));
        await db.update({ _id }, { $set: { content } });
    },
    setEstimatedTime: (_id: string, estimatedTime: number) => async (dispatch: Dispatch) => {
        dispatch(setEstimatedTime(_id, estimatedTime));
        await db.update({ _id }, { $set: { 'spentTimeInHour.estimated': estimatedTime } });
    },
    setActualTime: (_id: string, actualTime: number) => async (dispatch: Dispatch) => {
        dispatch(setActualTime(_id, actualTime));
        await db.update({ _id }, { $set: { 'spentTimeInHour.actual': actualTime } });
    },
    setLabels: (_id: string, labels: CardLabel[]) => async (dispatch: Dispatch) => {
        dispatch(setLabels(_id, labels));
        await db.update({ _id }, { $set: { labels } });
    },
    // Called when a card is moved into the done list of its board, or when the
    // completion time is edited in the card editor. The value is kept when the
    // card leaves the done list again, so it can be shown as the last
    // completion time instead; passing `undefined` clears the stamp.
    setCompletedTime: (_id: string, completedTime?: number) => async (dispatch: Dispatch) => {
        dispatch(setCompletedTime(_id, completedTime));
        if (completedTime === undefined) {
            await db.update({ _id }, { $unset: { completedTime: true } });
            return;
        }

        await db.update({ _id }, { $set: { completedTime } });
    },
    addActualTime: (_id: string, plus: number) => async (dispatch: Dispatch) => {
        dispatch(addActualTime(_id, plus));
        await db.update({ _id }, { $inc: { 'spentTimeInHour.actual': plus } });
    },
    deleteCard: (_id: string, listId: string) => async (dispatch: Dispatch) => {
        await listActions.deleteCard(listId, _id)(dispatch);
        dispatch(deleteCard(_id));
        await db.remove({ _id });
    },
    onTimerFinished:
        (_id: string, sessionId: string, spentTimeInHour: number) => async (dispatch: Dispatch) => {
            dispatch(addSession(_id, sessionId, spentTimeInHour));
            await db.update(
                { _id },
                {
                    $push: { sessionIds: sessionId },
                    $inc: { 'spentTimeInHour.actual': spentTimeInHour },
                }
            );
        },
    addCard:
        (_id: string, listId: string, title: string, content: string = '') =>
        async (dispatch: Dispatch) => {
            const now = +new Date();
            dispatch(addCard(_id, title, content, now));
            await listActions.addCardById(listId, _id)(dispatch);
            await db.insert({
                _id,
                title,
                content,
                sessionIds: [],
                spentTimeInHour: {
                    estimated: 0,
                    actual: 0,
                },
                createdTime: now,
            } as Card);
        },
};

export const cardReducer = createReducer<CardsState>({}, (builder) => {
    builder
        .addCase(
            addCard,
            (state, { payload: { _id, title = '', content = '', createdTime = +new Date() } }) => {
                return {
                    ...state,
                    [_id]: {
                        _id,
                        title,
                        content,
                        createdTime,
                        sessionIds: [],
                        spentTimeInHour: {
                            actual: 0,
                            estimated: 0,
                        },
                    },
                };
            }
        )
        .addCase(renameCard, (state, { payload: { _id, title } }) => {
            return {
                ...state,
                [_id]: {
                    ...state[_id],
                    title,
                },
            };
        })
        .addCase(setContent, (state, { payload: { _id, content } }) => {
            return {
                ...state,
                [_id]: {
                    ...state[_id],
                    content,
                },
            };
        })
        .addCase(setEstimatedTime, (state, { payload: { _id, estimatedTime } }) => {
            return {
                ...state,
                [_id]: {
                    ...state[_id],
                    spentTimeInHour: {
                        actual: state[_id].spentTimeInHour.actual,
                        estimated: estimatedTime,
                    },
                },
            };
        })
        .addCase(setActualTime, (state, { payload: { _id, actualTime } }) => {
            return {
                ...state,
                [_id]: {
                    ...state[_id],
                    spentTimeInHour: {
                        actual: actualTime,
                        estimated: state[_id].spentTimeInHour.estimated,
                    },
                },
            };
        })
        .addCase(setLabels, (state, { payload: { _id, labels } }) => {
            return {
                ...state,
                [_id]: {
                    ...state[_id],
                    labels,
                },
            };
        })
        .addCase(setCompletedTime, (state, { payload: { _id, completedTime } }) => {
            const card = { ...state[_id] };
            if (completedTime === undefined) {
                // drop the key entirely so `completedTime` stays absent, not undefined
                delete card.completedTime;
            } else {
                card.completedTime = completedTime;
            }

            return {
                ...state,
                [_id]: card,
            };
        })
        .addCase(deleteCard, (state, { payload: { _id } }) => {
            const { [_id]: _deleted, ...rest } = state;
            return rest;
        })
        .addCase(setCards, (state, { payload }) => payload)
        .addCase(addActualTime, (state, { payload: { _id, plus } }) => {
            return {
                ...state,
                [_id]: {
                    ...state[_id],
                    spentTimeInHour: {
                        ...state[_id].spentTimeInHour,
                        actual: state[_id].spentTimeInHour.actual + plus,
                    },
                },
            };
        })
        .addCase(addSession, (state, { payload: { _id, sessionId, spentTime } }) => {
            const card = state[_id];
            return {
                ...state,
                [_id]: {
                    ...card,
                    sessionIds: [...card.sessionIds, sessionId],
                    spentTimeInHour: {
                        actual: card.spentTimeInHour.actual + spentTime,
                        estimated: card.spentTimeInHour.estimated,
                    },
                },
            };
        });
});

export type CardActionTypes = { [key in keyof typeof actions]: typeof actions[key] };
