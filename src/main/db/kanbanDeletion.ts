import { DBs, loadDBs, runInTransaction } from './index';
import type { SqliteRepository } from './repository';
import type { Card, KanbanBoard, List } from '../../renderer/components/Kanban/type';
import type { DeleteKanbanItemsPayload, KanbanDeletionResult } from '../../shared/kanbanDeletion';

/**
 * Hours are stored as floats derived from milliseconds. Rounding the sum back
 * to the same precision keeps repeated deletes from drifting (0.1 + 0.2 style
 * noise would otherwise accumulate in `spentHours`).
 */
const HOUR_PRECISION = 1e6;
export const roundHours = (value: number): number =>
    Math.round(value * HOUR_PRECISION) / HOUR_PRECISION;

/**
 * Cascade delete for the kanban tree, in one SQLite transaction.
 *
 * Expanding the request is the whole point: a board owns lists, a list owns
 * cards, and a card owns move rows. Deleting only the requested row is what
 * used to leave orphan cards and permanently dangle `move` rows that replayed
 * an import warning on every export.
 *
 * `sessions` is never touched. Deleting a board makes its sessions' `boardId`
 * dangle, which History renders as `Unknown`; that is the documented trade-off
 * (hide the board instead when the history matters).
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

    const cardById = new Map(cards.map((card) => [card._id, card]));
    const listById = new Map(lists.map((list) => [list._id, list]));

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

        const nextListIds = (board.lists ?? []).filter((listId) => !listIds.has(listId));
        // Cards that leave this board: every card of a deleted list, plus the
        // deleted cards still referenced by the surviving lists.
        const removedCards: Card[] = [];
        const keptCards: Card[] = [];
        for (const listId of board.lists ?? []) {
            const list = listById.get(listId);
            if (!list) {
                continue;
            }
            if (listIds.has(listId)) {
                for (const cardId of list.cards ?? []) {
                    const card = cardById.get(cardId);
                    if (card) {
                        removedCards.push(card);
                    }
                }
                continue;
            }
            for (const cardId of list.cards ?? []) {
                const card = cardById.get(cardId);
                if (!card) {
                    continue;
                }
                if (cardIds.has(cardId)) {
                    removedCards.push(card);
                } else {
                    keptCards.push(card);
                }
            }
        }

        const removedSessions = new Set<string>();
        for (const card of removedCards) {
            for (const sessionId of card.sessionIds ?? []) {
                removedSessions.add(sessionId);
            }
        }
        const keptSessions = new Set<string>();
        for (const card of keptCards) {
            for (const sessionId of card.sessionIds ?? []) {
                keptSessions.add(sessionId);
            }
        }

        // Keep sessions that are still referenced by a surviving card, plus
        // sessions that no card ever referenced (an unassigned pomodoro is a
        // normal state, not something a card deletion should erase).
        const nextRelatedSessions: string[] = [];
        const seen = new Set<string>();
        for (const sessionId of board.relatedSessions ?? []) {
            if (removedSessions.has(sessionId) && !keptSessions.has(sessionId)) {
                continue;
            }
            if (seen.has(sessionId)) {
                continue;
            }
            seen.add(sessionId);
            nextRelatedSessions.push(sessionId);
        }
        for (const sessionId of keptSessions) {
            if (seen.has(sessionId)) {
                continue;
            }
            seen.add(sessionId);
            nextRelatedSessions.push(sessionId);
        }

        let spentHours = board.spentHours ?? 0;
        for (const card of removedCards) {
            spentHours -= card.spentTimeInHour?.actual ?? 0;
        }
        spentHours = Math.max(0, roundHours(spentHours));

        const listsChanged = nextListIds.length !== (board.lists ?? []).length;
        const hoursChanged = spentHours !== roundHours(board.spentHours ?? 0);
        const relatedChanged =
            nextRelatedSessions.length !== (board.relatedSessions ?? []).length ||
            nextRelatedSessions.some(
                (sessionId) => !(board.relatedSessions ?? []).includes(sessionId)
            );

        if (listsChanged || hoursChanged || relatedChanged) {
            updatedBoards[board._id] = {
                ...board,
                lists: nextListIds,
                spentHours,
                relatedSessions: nextRelatedSessions,
            };
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
            boardsRepo.updateSync(
                { _id: board._id },
                {
                    $set: {
                        lists: board.lists,
                        spentHours: board.spentHours,
                        relatedSessions: board.relatedSessions,
                    },
                }
            );
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
