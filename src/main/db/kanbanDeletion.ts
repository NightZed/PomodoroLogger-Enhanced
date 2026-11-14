import { DBs, loadDBs, runInTransaction } from './index';
import type { SqliteRepository } from './repository';
import type { Card, KanbanBoard, List } from '../../renderer/components/Kanban/type';
import type { DeleteKanbanItemsPayload, KanbanDeletionResult } from '../../shared/kanbanDeletion';

/**
 * Cascade delete for the kanban tree, in one SQLite transaction.
 *
 * Expanding the request is the whole point: a board owns lists, a list owns
 * cards, and a card owns move rows. Deleting only the requested row is what
 * used to leave orphan cards and permanently dangle `move` rows that replayed
 * an import warning on every export.
 *
 * `sessions` is never touched, and neither are the board totals: `spentHours`
 * and `relatedSessions` count sessions of the project, not cards. A session
 * whose card was deleted is still on the board -- it just stops being
 * attributed to a card -- so the project's total time and pomodoro count do
 * not shrink. Subtracting the deleted cards' `actual` here (which this used to
 * do) made the overview disagree with History for every unassigned session.
 *
 * Deleting a board makes its sessions' `boardId` dangle, which History renders
 * as `Unknown`; that is the documented trade-off (hide the board instead when
 * the history matters).
 */
export async function deleteKanbanItems(
    payload: DeleteKanbanItemsPayload
): Promise<KanbanDeletionResult> {
    await loadDBs(['cardsDB', 'listsDB', 'kanbanDB', 'moveDB']);

    const cardsRepo = DBs.cardsDB as unknown as SqliteRepository;
    const listsRepo = DBs.listsDB as unknown as SqliteRepository;
    const boardsRepo = DBs.kanbanDB as unknown as SqliteRepository;
    const movesRepo = DBs.moveDB as unknown as SqliteRepository;

    const cards = cardsRepo.findSync<Card>();
    const lists = listsRepo.findSync<List>();
    const boards = boardsRepo.findSync<KanbanBoard>();

    const boardIds = new Set(payload.boards ?? []);
    const listIds = new Set(payload.lists ?? []);
    const cardIds = new Set(payload.cards ?? []);

    // Expand board -> lists -> cards so one delete request removes the subtree.
    for (const board of boards) {
        if (!boardIds.has(board._id)) {
            continue;
        }
        for (const listId of board.lists ?? []) {
            listIds.add(listId);
        }
    }
    for (const list of lists) {
        if (!listIds.has(list._id)) {
            continue;
        }
        for (const cardId of list.cards ?? []) {
            cardIds.add(cardId);
        }
    }

    // Lists that survive but lose cards, and boards that survive but lose
    // lists or cards.
    const updatedLists: { [id: string]: List } = {};
    for (const list of lists) {
        if (listIds.has(list._id)) {
            continue;
        }
        const nextCards = (list.cards ?? []).filter((cardId) => !cardIds.has(cardId));
        if (nextCards.length !== (list.cards ?? []).length) {
            updatedLists[list._id] = { ...list, cards: nextCards };
        }
    }

    const updatedBoards: { [id: string]: KanbanBoard } = {};
    for (const board of boards) {
        if (boardIds.has(board._id)) {
            continue;
        }

        // Only the reference list changes. The board's totals count sessions of
        // the project, so a card going away does not take its focus time with
        // it: those sessions are still on the board, just unassigned now.
        const nextListIds = (board.lists ?? []).filter((listId) => !listIds.has(listId));
        if (nextListIds.length !== (board.lists ?? []).length) {
            updatedBoards[board._id] = { ...board, lists: nextListIds };
        }
    }

    const deletedCards = cards.filter((card) => cardIds.has(card._id)).map((card) => card._id);
    const deletedLists = lists.filter((list) => listIds.has(list._id)).map((list) => list._id);
    const deletedBoards = boards
        .filter((board) => boardIds.has(board._id))
        .map((board) => board._id);

    // Move rows are pure bookkeeping for a card; they go with the card, and
    // with either endpoint list when a list/board is removed.
    const moveQuery: any[] = [];
    if (cardIds.size > 0) {
        moveQuery.push({ cardId: { $in: Array.from(cardIds) } });
    }
    if (listIds.size > 0) {
        const ids = Array.from(listIds);
        moveQuery.push({ fromListId: { $in: ids } }, { toListId: { $in: ids } });
    }

    runInTransaction(() => {
        if (deletedCards.length > 0) {
            cardsRepo.removeSync({ _id: { $in: deletedCards } }, { multi: true });
        }
        if (deletedLists.length > 0) {
            listsRepo.removeSync({ _id: { $in: deletedLists } }, { multi: true });
        }
        if (deletedBoards.length > 0) {
            boardsRepo.removeSync({ _id: { $in: deletedBoards } }, { multi: true });
        }
        if (moveQuery.length > 0) {
            movesRepo.removeSync({ $or: moveQuery }, { multi: true });
        }
        for (const list of Object.values(updatedLists)) {
            listsRepo.updateSync({ _id: list._id }, { $set: { cards: list.cards } });
        }
        for (const board of Object.values(updatedBoards)) {
            boardsRepo.updateSync({ _id: board._id }, { $set: { lists: board.lists } });
        }
    });

    return {
        cards: deletedCards,
        lists: deletedLists,
        boards: deletedBoards,
        updatedLists,
        updatedBoards,
    };
}
