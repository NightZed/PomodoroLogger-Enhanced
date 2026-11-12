import { DBs, loadDBs, runInTransaction } from './index';
import type { SqliteRepository } from './repository';
import type { Card, KanbanBoard, List } from '../../renderer/components/Kanban/type';
import type { CardMoveResult } from '../../shared/cardMove';
import type { MoveCardInBoardPayload } from '../../shared/cardDrag';

const clampIndex = (index: number, max: number): number => Math.max(0, Math.min(index, max));

/**
 * One drag, one transaction.
 *
 * The renderer used to write this as three independent statements -- update the
 * source list, update the destination list, insert the move row. A crash or a
 * quit between them left a card that the source list no longer names and the
 * destination never received, which is exactly the "not in any list" card the
 * data check offers to restore. The three writes are now one transaction.
 *
 * The card itself is not moved between boards: dragging only reorders and
 * re-columns inside one board (the board owns the drag context), so this
 * command rejects a destination outside it. Crossing boards is
 * `moveCardToBoard`, which also migrates the card's sessions.
 */
export async function moveCardInBoard(payload: MoveCardInBoardPayload): Promise<CardMoveResult> {
    await loadDBs(['cardsDB', 'listsDB', 'kanbanDB', 'moveDB']);

    const cardsRepo = DBs.cardsDB as unknown as SqliteRepository;
    const listsRepo = DBs.listsDB as unknown as SqliteRepository;
    const boardsRepo = DBs.kanbanDB as unknown as SqliteRepository;
    const movesRepo = DBs.moveDB as unknown as SqliteRepository;

    const cards = cardsRepo.findSync<Card>();
    const lists = listsRepo.findSync<List>();
    const boards = boardsRepo.findSync<KanbanBoard>();

    const from = lists.find((list) => list._id === payload.fromListId);
    if (from === undefined) {
        throw new Error(`list ${payload.fromListId} does not exist`);
    }
    const to = lists.find((list) => list._id === payload.toListId);
    if (to === undefined) {
        throw new Error(`list ${payload.toListId} does not exist`);
    }

    const fromCards = [...(from.cards ?? [])];
    const sourceIndex = fromCards.indexOf(payload.cardId);
    if (sourceIndex < 0) {
        throw new Error(`card ${payload.cardId} is not in list ${payload.fromListId}`);
    }

    // Dragging happens inside one board (each board owns its drag context).
    // Only reject when both lists resolve to different boards; a list that no
    // board owns is old residue, and refusing the write would make the drag
    // fail for a reason the user cannot act on.
    const fromBoard = boards.find((row) => (row.lists ?? []).includes(from._id));
    const toBoard = boards.find((row) => (row.lists ?? []).includes(to._id));
    if (fromBoard !== undefined && toBoard !== undefined && fromBoard._id !== toBoard._id) {
        throw new Error('cards can only be dragged inside one board');
    }
    const board = toBoard;

    const updatedLists: { [id: string]: List } = {};
    let updatedCard: Card | undefined;

    if (payload.fromListId === payload.toListId) {
        // Same-list reorder: remove first, then insert at the index the drag
        // library reported against the pre-removal array.
        fromCards.splice(sourceIndex, 1);
        fromCards.splice(clampIndex(payload.toIndex, fromCards.length), 0, payload.cardId);
        updatedLists[from._id] = { ...from, cards: fromCards };
    } else {
        fromCards.splice(sourceIndex, 1);
        const toCards = [...(to.cards ?? [])];
        toCards.splice(clampIndex(payload.toIndex, toCards.length), 0, payload.cardId);
        updatedLists[from._id] = { ...from, cards: fromCards };
        updatedLists[to._id] = { ...to, cards: toCards };

        // A move into the done list is a completion; leaving it keeps the
        // stamp, which is the same rule the drag had before.
        if (board?.doneList === to._id) {
            const card = cards.find((row) => row._id === payload.cardId);
            if (card !== undefined) {
                updatedCard = { ...card, completedTime: Date.now() };
            }
        }
    }

    const move =
        payload.fromListId === payload.toListId
            ? undefined
            : {
                  fromListId: from._id,
                  toListId: to._id,
                  cardId: payload.cardId,
                  time: Date.now(),
              };

    runInTransaction(() => {
        for (const list of Object.values(updatedLists)) {
            listsRepo.updateSync({ _id: list._id }, { $set: { cards: list.cards } });
        }
        if (move !== undefined) {
            movesRepo.insertSync(move);
        }
        if (updatedCard !== undefined) {
            cardsRepo.updateSync(
                { _id: updatedCard._id },
                { $set: { completedTime: updatedCard.completedTime } }
            );
        }
    });

    return {
        updatedCards: updatedCard === undefined ? {} : { [updatedCard._id]: updatedCard },
        updatedLists,
        updatedBoards: {},
    };
}
