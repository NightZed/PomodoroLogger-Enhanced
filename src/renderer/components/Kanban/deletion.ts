import { createAction } from '@reduxjs/toolkit';
import type { Dispatch } from 'redux';
import type {
    DeleteKanbanItemsPayload,
    KanbanDeletionResult,
} from '../../../shared/kanbanDeletion';

/**
 * One action carries the whole cascade result. Applying it through three
 * separate reducers (cards, lists, boards) keeps the stores consistent: a list
 * that lost cards and a board whose `lists` lost a column arrive together.
 */
export const applyKanbanDeletion = createAction(
    '[Kanban]APPLY_DELETION',
    (result: KanbanDeletionResult) => ({ payload: result })
);

/**
 * Deletes cards/lists/boards through the main process, where the cascade and
 * the transaction live. A single request replaces the old sequence of
 * independent writes, which could stop halfway and leave orphan rows.
 */
export const deleteKanbanItems =
    (payload: DeleteKanbanItemsPayload) => async (dispatch: Dispatch) => {
        const result = await window.api.deleteKanbanItems(payload);
        dispatch(applyKanbanDeletion(result));
        return result;
    };
