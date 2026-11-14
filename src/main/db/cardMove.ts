import { DBs, loadDBs, runInTransaction } from './index';
import type { SqliteRepository } from './repository';
import { roundHours } from '../../shared/hours';
import type { Card, KanbanBoard, List } from '../../renderer/components/Kanban/type';
import type { PomodoroRecord } from '../../renderer/monitor/type';
import type { CardMoveResult, MoveCardPayload } from '../../shared/cardMove';

/**
 * Moves one card to a list, in one transaction.
 *
 * A card has no `boardId` of its own: it belongs to whichever board's
 * `list.cards` names it, while every session it counts carries its own
 * `boardId`. Rewriting only the list reference would leave the card in the new
 * board with its focus time still attributed to the old project, and the next
 * import recomputes `board.spentHours` as the sum of card totals -- so the
 * hours would land on a board that does not own them. The sessions therefore
 * travel with the card.
 *
 * They also travel *uniquely*: a session counted by several cards makes each
 * card's `actual` meaningless and multiplies the board total on import, so the
 * card being moved keeps it and every other card gives it up (hour for hour),
 * exactly like the session editor's move semantics.
 */
export async function moveCardToBoard(payload: MoveCardPayload): Promise<CardMoveResult> {
    await loadDBs(['cardsDB', 'listsDB', 'kanbanDB', 'moveDB', 'sessionDB']);

    const cardsRepo = DBs.cardsDB as unknown as SqliteRepository;
    const listsRepo = DBs.listsDB as unknown as SqliteRepository;
    const boardsRepo = DBs.kanbanDB as unknown as SqliteRepository;
    const movesRepo = DBs.moveDB as unknown as SqliteRepository;
    const sessionsRepo = DBs.sessionDB as unknown as SqliteRepository;

    const cards = cardsRepo.findSync<Card>();
    const lists = listsRepo.findSync<List>();
    const boards = boardsRepo.findSync<KanbanBoard>();

    const card = cards.find((row) => row._id === payload.cardId);
    if (card === undefined) {
        throw new Error(`card ${payload.cardId} does not exist`);
    }
    const targetList = lists.find((row) => row._id === payload.targetListId);
    if (targetList === undefined) {
        throw new Error(`list ${payload.targetListId} does not exist`);
    }
    const targetBoard = boards.find((row) => (row.lists ?? []).includes(targetList._id));
    if (targetBoard === undefined) {
        throw new Error(`list ${payload.targetListId} does not belong to any board`);
    }

    // A card normally sits in exactly one list; older data can list it twice.
    // Take them all out, and use the first one as the `move` row's origin.
    const sourceLists = lists.filter((row) => (row.cards ?? []).includes(card._id));
    if (sourceLists.some((row) => row._id === targetList._id)) {
        throw new Error(`card ${card._id} is already in list ${targetList._id}`);
    }
    const sourceList = sourceLists[0];

    const listDrafts = new Map<string, List>();
    const draftList = (id: string): List | undefined => {
        const existing = listDrafts.get(id);
        if (existing !== undefined) {
            return existing;
        }
        const source = lists.find((row) => row._id === id);
        if (source === undefined) {
            return undefined;
        }
        const draft: List = { ...source, cards: [...(source.cards ?? [])] };
        listDrafts.set(id, draft);
        return draft;
    };

    const cardDrafts = new Map<string, Card>();
    const draftCard = (id: string): Card | undefined => {
        const existing = cardDrafts.get(id);
        if (existing !== undefined) {
            return existing;
        }
        const source = cards.find((row) => row._id === id);
        if (source === undefined) {
            return undefined;
        }
        const draft: Card = {
            ...source,
            sessionIds: [...(source.sessionIds ?? [])],
            spentTimeInHour: { ...source.spentTimeInHour },
        };
        cardDrafts.set(id, draft);
        return draft;
    };

    const boardDrafts = new Map<string, KanbanBoard>();
    const draftBoard = (id: string): KanbanBoard | undefined => {
        const existing = boardDrafts.get(id);
        if (existing !== undefined) {
            return existing;
        }
        const source = boards.find((row) => row._id === id);
        if (source === undefined) {
            return undefined;
        }
        const draft: KanbanBoard = {
            ...source,
            relatedSessions: [...(source.relatedSessions ?? [])],
        };
        boardDrafts.set(id, draft);
        return draft;
    };

    for (const list of sourceLists) {
        const draft = draftList(list._id);
        if (draft !== undefined) {
            draft.cards = draft.cards.filter((id) => id !== card._id);
        }
    }
    const targetDraft = draftList(targetList._id);
    if (targetDraft !== undefined && !targetDraft.cards.includes(card._id)) {
        targetDraft.cards.push(card._id);
    }

    const movedCard = draftCard(card._id);
    // The drag path stamps `completedTime` when a card lands in the done list
    // and leaves it alone everywhere else, so a card moved out of done keeps
    // the date it was finished.
    const completedTimeUpdates = new Map<string, number>();
    if (targetBoard.doneList === targetList._id && movedCard !== undefined) {
        completedTimeUpdates.set(card._id, Date.now());
    }

    const sessionIds = Array.from(new Set(card.sessionIds ?? []));
    const sessions =
        sessionIds.length === 0
            ? []
            : sessionsRepo.findSync<PomodoroRecord>({ _id: { $in: sessionIds } });
    const sessionById = new Map(sessions.map((session) => [session._id, session]));
    const sessionUpdates: { _id: string; boardId: string }[] = [];

    const removeFromBoard = (boardId: string, sessionId: string, spentTime: number): void => {
        const draft = draftBoard(boardId);
        if (draft === undefined) {
            return;
        }
        draft.relatedSessions = (draft.relatedSessions ?? []).filter((id) => id !== sessionId);
        draft.spentHours = Math.max(0, roundHours((draft.spentHours ?? 0) - spentTime));
    };

    const addToBoard = (boardId: string, sessionId: string, spentTime: number): void => {
        const draft = draftBoard(boardId);
        if (draft === undefined) {
            return;
        }
        if (!(draft.relatedSessions ?? []).includes(sessionId)) {
            draft.relatedSessions = [...(draft.relatedSessions ?? []), sessionId];
        }
        draft.spentHours = roundHours((draft.spentHours ?? 0) + spentTime);
    };

    for (const sessionId of sessionIds) {
        const session = sessionById.get(sessionId);
        if (session === undefined) {
            // A stale reference (the session was deleted elsewhere). Leave the
            // reference as it is; the orphan-data sweep is what removes it.
            continue;
        }
        const spentTime = session.spentTimeInHour ?? 0;

        for (const other of cards) {
            if (other._id === card._id || !(other.sessionIds ?? []).includes(sessionId)) {
                continue;
            }
            const draft = draftCard(other._id);
            if (draft === undefined) {
                continue;
            }
            // Subtract once per occurrence so the total stays consistent with
            // the array even when old data lists the session twice.
            const occurrences = draft.sessionIds.filter((id) => id === sessionId).length;
            draft.sessionIds = draft.sessionIds.filter((id) => id !== sessionId);
            draft.spentTimeInHour.actual = Math.max(
                0,
                roundHours(draft.spentTimeInHour.actual - spentTime * occurrences)
            );
        }

        if (session.boardId === targetBoard._id) {
            continue;
        }
        if (session.boardId !== undefined) {
            removeFromBoard(session.boardId, sessionId, spentTime);
        }
        addToBoard(targetBoard._id, sessionId, spentTime);
        sessionUpdates.push({ _id: sessionId, boardId: targetBoard._id });
    }

    const touchedLists = Array.from(listDrafts.values());
    const touchedCards = Array.from(cardDrafts.values());
    const touchedBoards = Array.from(boardDrafts.values());

    // A card that was never in a list has no origin to record; the merger only
    // needs the row to keep an imported card out of its old list, and an orphan
    // never had one.
    const move =
        sourceList === undefined
            ? undefined
            : {
                  fromListId: sourceList._id,
                  toListId: targetList._id,
                  cardId: card._id,
                  time: Date.now(),
              };

    runInTransaction(() => {
        for (const list of touchedLists) {
            listsRepo.updateSync({ _id: list._id }, { $set: { cards: list.cards } });
        }
        for (const row of touchedCards) {
            const patch: any = {
                sessionIds: row.sessionIds,
                'spentTimeInHour.actual': row.spentTimeInHour.actual,
            };
            const completedTime = completedTimeUpdates.get(row._id);
            if (completedTime !== undefined) {
                patch.completedTime = completedTime;
            }
            cardsRepo.updateSync({ _id: row._id }, { $set: patch });
        }
        for (const board of touchedBoards) {
            boardsRepo.updateSync(
                { _id: board._id },
                {
                    $set: {
                        relatedSessions: board.relatedSessions,
                        spentHours: board.spentHours,
                    },
                }
            );
        }
        for (const update of sessionUpdates) {
            sessionsRepo.updateSync({ _id: update._id }, { $set: { boardId: update.boardId } });
        }
        if (move !== undefined) {
            movesRepo.insertSync(move);
        }
    });

    const updatedCards: { [id: string]: Card } = {};
    for (const row of touchedCards) {
        updatedCards[row._id] = row;
    }
    // The moved card has to reach the store with its new `completedTime` even
    // when no session changed, so fold the stamp into the returned copy.
    const completedTime = completedTimeUpdates.get(card._id);
    if (completedTime !== undefined && updatedCards[card._id] !== undefined) {
        updatedCards[card._id] = { ...updatedCards[card._id], completedTime };
    }

    const updatedLists: { [id: string]: List } = {};
    for (const list of touchedLists) {
        updatedLists[list._id] = list;
    }
    const updatedBoards: { [id: string]: KanbanBoard } = {};
    for (const board of touchedBoards) {
        updatedBoards[board._id] = board;
    }

    return { updatedCards, updatedLists, updatedBoards };
}
