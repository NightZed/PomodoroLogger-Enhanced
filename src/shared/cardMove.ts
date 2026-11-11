import type { Card, KanbanBoard, List } from '../renderer/components/Kanban/type';

/**
 * One card moving to another list. The renderer names the card and the
 * destination; the main process owns the list edits, the `move` row and the
 * session migration.
 */
export interface MoveCardPayload {
    cardId: string;
    targetListId: string;
}

/**
 * The post-move state of everything the transaction touched. The renderer
 * replaces these rows wholesale instead of patching its own copy: a card that
 * changes board rewrites two lists, its own `completedTime`, every card it was
 * shared with and two board summaries, and applying them separately would let
 * the store show a half-moved card.
 */
export interface CardMoveResult {
    /** The moved card plus any card that lost a shared session. */
    updatedCards: { [id: string]: Card };
    /** Source and target lists; both had their `cards` rewritten. */
    updatedLists: { [id: string]: List };
    /** Source and target boards, whose `spentHours` / `relatedSessions` moved. */
    updatedBoards: { [id: string]: KanbanBoard };
}
