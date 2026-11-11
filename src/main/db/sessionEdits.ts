import { DBs, loadDBs, runInTransaction } from './index';
import type { SqliteRepository } from './repository';
import { roundHours } from './kanbanDeletion';
import type { Card, KanbanBoard, List } from '../../renderer/components/Kanban/type';
import type { PomodoroRecord } from '../../renderer/monitor/type';
import type {
    EditedSession,
    SessionEdit,
    SessionEditsResult,
    UnassignedSessionSummary,
    UnassignedSessionsQuery,
    UnassignedSessionsResult,
} from '../../shared/sessionEdits';

const DEFAULT_UNASSIGNED_LIMIT = 200;
const MAX_UNASSIGNED_LIMIT = 500;

/**
 * Applies the session editor's draft in one transaction.
 *
 * The renderer only sends differences; the expansion and every derived number
 * live here. Moving a session between projects has to move the board's
 * `spentHours` / `relatedSessions` with it (those totals count sessions, not
 * cards), and moving it between cards has to unbind it everywhere first --
 * a session that is counted by two cards makes the card totals meaningless and
 * multiplies `board.spentHours` on the next import, where `setBoardInfo`
 * recomputes from cards.
 *
 * Validation happens before the transaction opens, so a rejected edit leaves
 * both the database and the open dialog untouched.
 */
export async function applySessionEdits(edits: SessionEdit[]): Promise<SessionEditsResult> {
    if (edits.length === 0) {
        return { deleted: [], sessions: [], updatedCards: {}, updatedBoards: {} };
    }

    await loadDBs(['sessionDB', 'cardsDB', 'listsDB', 'kanbanDB']);

    const sessionsRepo = DBs.sessionDB as unknown as SqliteRepository;
    const cardsRepo = DBs.cardsDB as unknown as SqliteRepository;
    const listsRepo = DBs.listsDB as unknown as SqliteRepository;
    const boardsRepo = DBs.kanbanDB as unknown as SqliteRepository;

    const cards = cardsRepo.findSync<Card>();
    const lists = listsRepo.findSync<List>();
    const boards = boardsRepo.findSync<KanbanBoard>();
    const sessionIds = Array.from(new Set(edits.map((edit) => edit._id)));
    const sessions = sessionsRepo.findSync<PomodoroRecord>({ _id: { $in: sessionIds } });

    const sessionById = new Map(sessions.map((session) => [session._id, session]));
    const cardById = new Map(cards.map((card) => [card._id, card]));
    const listById = new Map(lists.map((list) => [list._id, list]));
    const boardById = new Map(boards.map((board) => [board._id, board]));

    // Which board a card lives in, derived from `board.lists -> list.cards`.
    // A card has no `boardId` of its own.
    const boardOfCard = new Map<string, string>();
    for (const board of boards) {
        for (const listId of board.lists ?? []) {
            for (const cardId of listById.get(listId)?.cards ?? []) {
                boardOfCard.set(cardId, board._id);
            }
        }
    }

    // Drafts only exist for rows that actually change, so "in the map" is the
    // same as "needs writing".
    const cardDrafts = new Map<string, Card>();
    const boardDrafts = new Map<string, KanbanBoard>();

    const draftCard = (id: string): Card | undefined => {
        const existing = cardDrafts.get(id);
        if (existing !== undefined) {
            return existing;
        }
        const source = cardById.get(id);
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

    const draftBoard = (id: string): KanbanBoard | undefined => {
        const existing = boardDrafts.get(id);
        if (existing !== undefined) {
            return existing;
        }
        const source = boardById.get(id);
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

    /** Removes one session from every card that counted it, hour for hour. */
    const detachFromCards = (sessionId: string, spentTime: number): void => {
        for (const card of cards) {
            if (!(card.sessionIds ?? []).includes(sessionId)) {
                continue;
            }
            const draft = draftCard(card._id);
            if (draft === undefined) {
                continue;
            }
            // Old data can list the same session more than once; subtract once
            // per occurrence so the card total stays consistent with the array.
            const occurrences = draft.sessionIds.filter((id) => id === sessionId).length;
            draft.sessionIds = draft.sessionIds.filter((id) => id !== sessionId);
            draft.spentTimeInHour.actual = Math.max(
                0,
                roundHours(draft.spentTimeInHour.actual - spentTime * occurrences)
            );
        }
    };

    const removeFromBoard = (
        boardId: string | undefined,
        sessionId: string,
        spentTime: number
    ): void => {
        if (boardId === undefined) {
            return;
        }
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

    const deleted: string[] = [];
    const editedSessions: EditedSession[] = [];
    const sessionUpdates: { _id: string; boardId?: string }[] = [];

    for (const edit of edits) {
        const session = sessionById.get(edit._id);
        if (session === undefined) {
            // Already gone (a stale draft after another window deleted it).
            continue;
        }

        const spentTime = session.spentTimeInHour ?? 0;

        if (edit.delete) {
            detachFromCards(edit._id, spentTime);
            removeFromBoard(session.boardId, edit._id, spentTime);
            deleted.push(edit._id);
            continue;
        }

        // `undefined` = leave the project alone, `null` = detach from it.
        const nextBoardId =
            edit.boardId === undefined ? session.boardId : (edit.boardId ?? undefined);

        if (nextBoardId !== undefined && !boardById.has(nextBoardId)) {
            throw new Error(`session ${edit._id} refers to a board that does not exist`);
        }

        if (edit.cardId !== undefined && edit.cardId !== null) {
            if (nextBoardId === undefined) {
                throw new Error(
                    `session ${edit._id} needs a project before it can be put on a card`
                );
            }
            if (!cardById.has(edit.cardId)) {
                throw new Error(`session ${edit._id} refers to a card that does not exist`);
            }
            const cardBoardId = boardOfCard.get(edit.cardId);
            if (cardBoardId !== nextBoardId) {
                throw new Error(`session ${edit._id} cannot move to a card of another board`);
            }
        }

        const boardChanged = nextBoardId !== session.boardId;

        if (boardChanged) {
            removeFromBoard(session.boardId, edit._id, spentTime);
            if (nextBoardId !== undefined) {
                addToBoard(nextBoardId, edit._id, spentTime);
            }
            sessionUpdates.push({ _id: edit._id, boardId: nextBoardId });
        }

        // A project change invalidates the card (cards belong to a board), and
        // so does any explicit `cardId` -- the session is unbound first and
        // then, when a target was named, bound once.
        if (boardChanged || edit.cardId !== undefined) {
            detachFromCards(edit._id, spentTime);
        }

        if (edit.cardId !== undefined && edit.cardId !== null) {
            const target = draftCard(edit.cardId);
            if (target !== undefined) {
                target.sessionIds.push(edit._id);
                target.spentTimeInHour.actual = roundHours(
                    target.spentTimeInHour.actual + spentTime
                );
            }
        }

        editedSessions.push({ _id: edit._id, boardId: nextBoardId });
    }

    const touchedCards = Array.from(cardDrafts.values());
    const touchedBoards = Array.from(boardDrafts.values());

    runInTransaction(() => {
        if (deleted.length > 0) {
            sessionsRepo.removeSync({ _id: { $in: deleted } }, { multi: true });
        }
        for (const update of sessionUpdates) {
            sessionsRepo.updateSync(
                { _id: update._id },
                update.boardId === undefined
                    ? { $unset: { boardId: 1 } }
                    : { $set: { boardId: update.boardId } }
            );
        }
        for (const card of touchedCards) {
            cardsRepo.updateSync(
                { _id: card._id },
                {
                    $set: {
                        sessionIds: card.sessionIds,
                        'spentTimeInHour.actual': card.spentTimeInHour.actual,
                    },
                }
            );
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
    });

    const updatedCards: { [id: string]: Card } = {};
    for (const card of touchedCards) {
        updatedCards[card._id] = card;
    }
    const updatedBoards: { [id: string]: KanbanBoard } = {};
    for (const board of touchedBoards) {
        updatedBoards[board._id] = board;
    }

    return { deleted, sessions: editedSessions, updatedCards, updatedBoards };
}

/**
 * Sessions that no card counts, optionally restricted to one board.
 *
 * `total` is the full count; `sessions` is the first `limit` rows, newest
 * first. The board page shows `total` in its button, so it cannot be derived
 * from the page itself.
 */
export async function listUnassignedSessions(
    query: UnassignedSessionsQuery = {}
): Promise<UnassignedSessionsResult> {
    await loadDBs(['sessionDB', 'cardsDB']);

    const cardsRepo = DBs.cardsDB as unknown as SqliteRepository;
    const sessionsRepo = DBs.sessionDB as unknown as SqliteRepository;

    const assigned = new Set<string>();
    for (const card of cardsRepo.findSync<Card>()) {
        for (const sessionId of card.sessionIds ?? []) {
            assigned.add(sessionId);
        }
    }

    // `boardId` has to be selected too: `findHistory` runs the in-memory
    // matcher against the projected document, so a query field that was not
    // selected would reject every row.
    const rows = await sessionsRepo.findHistory(
        query.boardId === undefined ? {} : { boardId: query.boardId },
        ['startTime', 'spentTimeInHour', 'apps', 'boardId']
    );

    const unassigned: UnassignedSessionSummary[] = [];
    for (const row of rows) {
        if (assigned.has(row._id)) {
            continue;
        }
        unassigned.push({
            _id: row._id,
            startTime: row.startTime ?? 0,
            spentTimeInHour: row.spentTimeInHour ?? 0,
            appCount: row.apps == null ? 0 : Object.keys(row.apps).length,
        });
    }

    unassigned.sort((a, b) => b.startTime - a.startTime);

    const requested = query.limit ?? DEFAULT_UNASSIGNED_LIMIT;
    const limit = Math.min(MAX_UNASSIGNED_LIMIT, Math.max(1, Math.trunc(requested)));

    return { total: unassigned.length, sessions: unassigned.slice(0, limit) };
}
