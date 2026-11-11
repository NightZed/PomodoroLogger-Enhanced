import { createAction } from '@reduxjs/toolkit';
import type { Dispatch } from 'redux';
import type { CardMoveResult } from '../../../shared/cardMove';

/**
 * A card changed lists in the main process. The payload carries the final
 * state of both lists, the moved card (and any card that gave up a shared
 * session) and both boards, so three reducers can replace those rows instead
 * of re-deriving which list now holds the card.
 */
export const applyCardMove = createAction('[Kanban]APPLY_CARD_MOVE', (result: CardMoveResult) => ({
    payload: result,
}));

/**
 * Moves a card to another list through the main process, where the list
 * rewrite, the `move` row and the session migration share one transaction.
 * Moving between boards also moves the card's sessions' project, which is why
 * the renderer cannot do this with plain list updates.
 */
export const moveCardToBoard =
    (cardId: string, targetListId: string) => async (dispatch: Dispatch) => {
        const result = await window.api.moveCardToBoard({ cardId, targetListId });
        dispatch(applyCardMove(result));
        return result;
    };
