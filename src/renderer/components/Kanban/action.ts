/* istanbul ignore file */
import { createAction, createReducer } from '@reduxjs/toolkit';
import { actions as boardActions } from './Board/action';
import { actions as timerActions } from '../Timer/action';
import { Dispatch } from 'redux';
import dbs from '../../dbs';
import { AsyncDB } from '../../../utils/dbHelper';

export type SortType = 'recent' | 'alpha' | 'due' | 'spent' | 'remaining' | 'created';
export type SortDirection = 'asc' | 'desc';
const settingDB = new AsyncDB(dbs.settingDB);
const validSortTypes: SortType[] = ['recent', 'alpha', 'due', 'spent', 'remaining', 'created'];
const validSortDirections: SortDirection[] = ['asc', 'desc'];
export interface KanbanState {
    sortedBy: SortType;
    sortDirection: SortDirection;
    chosenBoardId?: string;
    editCard: {
        isEditing: boolean;
        _id?: string;
        listId: string;
    };
    isSearching: boolean;
    searchReg?: string;
    configuringBoardId?: string;
}

const defaultState: KanbanState = {
    isSearching: false,
    sortedBy: 'recent',
    sortDirection: 'asc',
    editCard: {
        isEditing: false,
        listId: '',
    },
};

const setIsSearching = createAction('[KANBAN]SET_IS_SEARCHING', (isSearching: boolean) => ({
    payload: isSearching,
}));

const setConfiguringBoardId = createAction('[KANBAN]CONFIGURING_BOARD_ID', (_id?: string) => ({
    payload: { _id },
}));

const setChosenBoardId = createAction('[KANBAN]SET_CHOSEN_BOARD_ID', (_id?: string) => ({
    payload: { _id },
}));

const setSortedBy = createAction('[KANBAN]SET_SORTED_BY', (sortedBy: SortType) => ({
    payload: { sortedBy },
}));

const setSortDirection = createAction(
    '[KANBAN]SET_SORT_DIRECTION',
    (sortDirection: SortDirection) => ({ payload: { sortDirection } })
);

const setEditCard = createAction(
    '[KANBAN]EDIT_CARD',
    (isEditing: boolean, listId: string, _id?: string) => ({ payload: { isEditing, _id, listId } })
);

const setSearchReg = createAction('[KANBAN]SET_SEARCH_REG', (reg?: string) => ({
    payload: { reg },
}));

export const actions = {
    setEditCard,
    setSearchReg,
    setIsSearching,
    setConfiguringBoardId,
    setSortedBy: (sortedBy: SortType) => async (dispatch: Dispatch) => {
        dispatch(setSortedBy(sortedBy));
        await settingDB.update({ name: 'setting' }, { $set: { sortedBy } }, { upsert: true });
    },
    setSortDirection: (sortDirection: SortDirection) => async (dispatch: Dispatch) => {
        dispatch(setSortDirection(sortDirection));
        await settingDB.update({ name: 'setting' }, { $set: { sortDirection } }, { upsert: true });
    },
    fetchSortState: () => async (dispatch: Dispatch) => {
        const settings = await settingDB.findOne({ name: 'setting' });
        if (settings != null) {
            if (validSortTypes.includes(settings.sortedBy)) {
                dispatch(setSortedBy(settings.sortedBy));
            }
            if (validSortDirections.includes(settings.sortDirection)) {
                dispatch(setSortDirection(settings.sortDirection));
            }
        }
    },
    setChosenBoardId: (_id: string | undefined) => async (dispatch: Dispatch) => {
        dispatch(setChosenBoardId(_id));
        if (_id) {
            await boardActions.setLastVisitTime(_id, new Date().getTime())(dispatch);
        }
    },
    focusOn: (_id: string) => (dispatch: Dispatch) => {
        dispatch(timerActions.setBoardId(_id));
    },
};

export type KanbanActionTypes = { [key in keyof typeof actions]: (typeof actions)[key] };
export const reducer = createReducer<KanbanState>(defaultState, (builder) => {
    builder
        .addCase(setChosenBoardId, (state, { payload: { _id } }) => {
            return {
                ...state,
                chosenBoardId: _id,
                searchReg: undefined,
            };
        })
        .addCase(setEditCard, (state, { payload: { _id, isEditing, listId } }) => {
            return {
                ...state,
                editCard: {
                    _id,
                    isEditing,
                    listId,
                },
            };
        })
        .addCase(setSortedBy, (state, { payload: { sortedBy } }) => ({
            ...state,
            sortedBy,
        }))
        .addCase(setSortDirection, (state, { payload: { sortDirection } }) => ({
            ...state,
            sortDirection,
        }))
        .addCase(setSearchReg, (state, { payload: { reg } }) => ({
            ...state,
            searchReg: reg || undefined,
        }))
        .addCase(setConfiguringBoardId, (state, { payload: { _id } }) => ({
            ...state,
            configuringBoardId: _id,
        }))
        .addCase(setIsSearching, (state, { payload }) => ({
            ...state,
            isSearching: payload,
        }));
});
