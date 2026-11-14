import type { ThunkAction } from 'redux-thunk';
import type { RootState } from './reducers';
import { applyKanbanSnapshot } from './components/Kanban/snapshot';
import { readKanbanSnapshot } from './components/Kanban/Board/action';
import { actions as kanbanActions } from './components/Kanban/action';
import { actions as historyActions } from './components/History/action';
import { bumpSessionReloadToken } from './components/Timer/action';
import { applySessionEditsResult } from './components/Kanban/sessionEdits';
import type { SessionEditsResult } from '../shared/sessionEdits';

/**
 * Invalidates the views that read sessions straight from the database.
 *
 * Timer's "today" list and History's aggregation are not derived from the
 * kanban slices: they query `sessionDB` themselves and watch a token. Writing
 * a session (deleting it, changing its project or card) therefore has to bump
 * those tokens too, or the numbers stay stale until something unrelated
 * happens to re-read -- the calendar keeps the deleted day, the pomodoro dots
 * keep the deleted session, and only a restart clears them.
 */
export const refreshSessionDerivedViews =
    (): ThunkAction<void, RootState, unknown, any> => (dispatch) => {
        dispatch(bumpSessionReloadToken());
        dispatch(historyActions.setExpiringKey(new Date().toString()));
    };

/**
 * Writes a session-edit transaction's rows into the store and invalidates the
 * views above. Both entry points (the History day editor and the board's
 * unassigned panel) go through this, so neither can forget one half.
 */
export const applySessionEditsAndRefresh =
    (result: SessionEditsResult): ThunkAction<void, RootState, unknown, any> =>
    (dispatch) => {
        dispatch(applySessionEditsResult(result));
        dispatch(refreshSessionDerivedViews());
    };

/**
 * Pulls the kanban tree and the session-derived views back into the store.
 *
 * Import and "delete all data" used to restart the app: the write goes
 * straight to the database, and the store would otherwise keep showing the
 * old boards, cards and today's sessions. Restarting is not necessary for
 * either -- nothing about the main process changed -- so the data is re-read
 * instead. Settings are not touched: neither operation modifies them.
 *
 * The tree is replaced with a single action. Reading boards, lists and cards
 * separately and dispatching one by one leaves the store inconsistent between
 * those dispatches -- after "delete all data" the lists were already empty
 * while the boards still named them, and every subscriber that walks
 * `board.lists -> lists[id].cards` crashed on the missing list.
 *
 * `chosenBoardId` is validated afterwards, so a selection pointing at a board
 * that no longer exists is cleared instead of dangling.
 */
export const reloadDataStore =
    (): ThunkAction<Promise<void>, RootState, unknown, any> => async (dispatch, getState) => {
        const snapshot = await readKanbanSnapshot();
        dispatch(applyKanbanSnapshot(snapshot));

        const { boards, kanban } = getState().kanban;
        const { chosenBoardId } = kanban;
        if (chosenBoardId !== undefined && boards[chosenBoardId] === undefined) {
            kanbanActions.setChosenBoardId(undefined)(dispatch);
        }

        // Timer's "today" list and any mounted History page read from the
        // database, not from the kanban slices.
        dispatch(refreshSessionDerivedViews());
    };
