import type { KanbanBoard, List } from '../renderer/components/Kanban/type';

/**
 * Payload of the cascade delete. Ids are the only thing the renderer sends;
 * the main process owns the expansion and the writes.
 */
export interface DeleteKanbanItemsPayload {
    cards?: string[];
    lists?: string[];
    boards?: string[];
}

/**
 * What the cascade actually removed, plus the still-existing lists and boards
 * whose derived fields changed. The renderer applies this in one dispatch so
 * cards, lists and boards cannot drift apart mid-update.
 */
export interface KanbanDeletionResult {
    cards: string[];
    lists: string[];
    boards: string[];
    updatedLists: { [id: string]: List };
    updatedBoards: { [id: string]: KanbanBoard };
}
