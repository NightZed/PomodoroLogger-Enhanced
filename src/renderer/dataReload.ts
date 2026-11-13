import type { ThunkAction } from 'redux-thunk';
import type { RootState } from './reducers';
import { applyKanbanSnapshot } from './components/Kanban/snapshot';
import { readKanbanSnapshot } from './components/Kanban/Board/action';
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
        dispatch(bumpSessionReloadToken());
        dispatch(historyActions.setExpiringKey(new Date().toString()));
    };
