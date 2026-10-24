import { createAction, createReducer } from '@reduxjs/toolkit';

export interface HistoryState {
    chosenProjectId?: string;
    expiringKey: string;
}

export const defaultState: HistoryState = {
    expiringKey: '',
};

const setChosenProjectId = createAction('[History]setChosenProjectId', (project?: string) => ({
    payload: project,
}));

const setExpiringKey = createAction('[History]setExpiringKey', (expiringKey: string) => ({
    payload: { expiringKey },
}));

export const actions = {
    setChosenProjectId,
    setExpiringKey,
};

export type HistoryActionCreatorTypes = { [key in keyof typeof actions]: (typeof actions)[key] };
export const reducer = createReducer(defaultState, (builder) => {
    builder
        .addCase(setChosenProjectId, (state, { payload }) => ({
            ...state,
            chosenProjectId: payload,
        }))
        .addCase(setExpiringKey, (state, { payload: { expiringKey } }) => ({
            ...state,
            expiringKey,
        }));
});
