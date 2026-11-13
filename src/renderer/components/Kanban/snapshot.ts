import { createAction } from '@reduxjs/toolkit';
import type { KanbanBoardState } from './Board/action';
import type { CardsState } from './Card/action';
import type { ListsState } from './type';

/**
 * A whole kanban tree read in one go.
 *
 * Boards, lists and cards reference each other by id, so replacing them with
 * three separate dispatches leaves the store in states that cannot exist on
 * disk: a new list map under the old boards, or an empty list map under boards
 * that still name those lists. Every subscriber re-runs on each of those, and a
 * chart that resolves `board.lists -> lists[id].cards` crashes on the gap --
 * which is what happened after "delete all data": boards were replaced only
 * after the lists had already been emptied.
 *
 * One action keeps the tree consistent for every subscriber, and notifies them
 * once instead of three times.
 */
export interface KanbanSnapshot {
    boards: KanbanBoardState;
    lists: ListsState;
    cards: CardsState;
}

export const applyKanbanSnapshot = createAction<KanbanSnapshot>('[Kanban]APPLY_SNAPSHOT');
