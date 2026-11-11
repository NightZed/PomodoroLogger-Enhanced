import { createAction } from '@reduxjs/toolkit';
import type { SessionEditsResult } from '../../../shared/sessionEdits';

/**
 * Sessions and the cards that count them were edited in the main process.
 *
 * The payload carries the full post-edit state of every card and board the
 * transaction touched, so the reducers replace those rows instead of
 * re-deriving the hours here. Without this, a card's `sessionIds` only caught
 * up after an app restart: the database changed but the store did not, and the
 * History editor reads the store.
 */
export const applySessionEditsResult = createAction(
    '[Kanban]APPLY_SESSION_EDITS',
    (result: SessionEditsResult) => ({ payload: result })
);
