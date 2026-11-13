import type { ThunkAction } from 'redux-thunk';
import type { RootState } from './reducers';
import { actions as boardActions } from './components/Kanban/Board/action';
import { actions as listActions } from './components/Kanban/List/action';
import { actions as cardActions } from './components/Kanban/Card/action';
import { actions as kanbanActions } from './components/Kanban/action';
import { actions as historyActions } from './components/History/action';
import { bumpSessionReloadToken } from './components/Timer/action';

/**
 * Pulls the kanban tree and the session-derived views back into the store.
 *
 * Import and "delete all data" used to restart the app: the write goes
 * straight to the database, and the store would otherwise keep showing the
 * old boards, cards and today's sessions. Restarting is not necessary for
 * either -- nothing about the main process changed -- so the data is re-read
 * instead. Settings are not touched: neither operation modifies them.
 *
 * The order matters for `chosenBoardId`: it is validated after `boards` has
 * been replaced, so a selection that pointed at a board which no longer exists
 * is cleared instead of dangling.
 */
export const reloadDataStore =
    (): ThunkAction<Promise<void>, RootState, unknown, any> => async (dispatch, getState) => {
        await boardActions.fetchBoards()(dispatch);
        await listActions.fetchLists()(dispatch);
        await cardActions.fetchCards()(dispatch);

        const { boards } = getState().kanban;
        const { chosenBoardId } = getState().kanban.kanban;
        if (chosenBoardId !== undefined && boards[chosenBoardId] === undefined) {
            kanbanActions.setChosenBoardId(undefined)(dispatch);
        }

        // Timer's "today" list and any mounted History page read from the
        // database, not from the kanban slices.
        dispatch(bumpSessionReloadToken());
        dispatch(historyActions.setExpiringKey(new Date().toString()));
    };
