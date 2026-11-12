import { DBs, loadDBs, runInTransaction } from './index';
import type { SqliteRepository } from './repository';
import type { Card, KanbanBoard, List, MoveInfo } from '../../renderer/components/Kanban/type';
import type { PomodoroRecord } from '../../renderer/monitor/type';
import type {
    CardIssue,
    DanglingRefIssue,
    DataIssuesReport,
    DataRepairPayload,
    DataRepairResult,
} from '../../shared/dataRepair';

const loadRepos = async () => {
    await loadDBs(['cardsDB', 'listsDB', 'kanbanDB', 'moveDB', 'sessionDB']);
    return {
        cards: DBs.cardsDB as unknown as SqliteRepository,
        lists: DBs.listsDB as unknown as SqliteRepository,
        boards: DBs.kanbanDB as unknown as SqliteRepository,
        moves: DBs.moveDB as unknown as SqliteRepository,
        sessions: DBs.sessionDB as unknown as SqliteRepository,
    };
};

const toIssue = (card: Card): CardIssue => ({
    _id: card._id,
    title: card.title,
    spentHours: card.spentTimeInHour?.actual ?? 0,
    sessionCount: new Set(card.sessionIds ?? []).size,
});

/** Entries a repair would drop: ids that do not exist, and repeated ids. */
const countInvalid = (ids: string[] | undefined, exists: (id: string) => boolean): number => {
    const seen = new Set<string>();
    let count = 0;
    for (const id of ids ?? []) {
        if (!exists(id) || seen.has(id)) {
            count += 1;
        }
        seen.add(id);
    }
    return count;
};

const byHoursThenTitle = (a: CardIssue, b: CardIssue): number =>
    b.spentHours - a.spentHours || a.title.localeCompare(b.title);

/**
 * Everything the "Check & Repair Data" dialog shows.
 *
 * The two card groups are kept apart on purpose: a card still named by an
 * orphan list came from the old "delete the board row only" behaviour (the user
 * meant to delete it), while a card no list names at all came from a crash in
 * the middle of a cross-list drag or from a hand-edited import (the user may
 * still want it). Their default selection differs, so the data has to say which
 * group each card belongs to.
 *
 * Move rows are counted against the rows that exist now. Deleting a card also
 * makes its move rows dead, and those show up on the next check rather than
 * inflating this one.
 */
export async function scanDataIssues(): Promise<DataIssuesReport> {
    const repos = await loadRepos();
    const cards = repos.cards.findSync<Card>();
    const lists = repos.lists.findSync<List>();
    const boards = repos.boards.findSync<KanbanBoard>();
    const moves = repos.moves.findSync<MoveInfo>();
    const sessions = repos.sessions.findSync<PomodoroRecord>();

    const referencedLists = new Set<string>();
    for (const board of boards) {
        for (const listId of board.lists ?? []) {
            referencedLists.add(listId);
        }
    }

    const orphanLists = lists.filter((list) => !referencedLists.has(list._id));
    const orphanListIds = new Set(orphanLists.map((list) => list._id));
    const liveLists = lists.filter((list) => !orphanListIds.has(list._id));

    // Only lists a board still owns count as references. A card named by an
    // orphan list already lost its home; treating that list as alive would make
    // the card look fine and leave it behind after the list is removed.
    const liveCardIds = new Set<string>();
    for (const list of liveLists) {
        for (const cardId of list.cards ?? []) {
            liveCardIds.add(cardId);
        }
    }

    const orphanListOf = new Map<string, string>();
    for (const list of orphanLists) {
        for (const cardId of list.cards ?? []) {
            if (!orphanListOf.has(cardId)) {
                orphanListOf.set(cardId, list.title);
            }
        }
    }

    const detachedCards: CardIssue[] = [];
    const orphanCards: CardIssue[] = [];
    for (const card of cards) {
        if (liveCardIds.has(card._id)) {
            continue;
        }
        const listTitle = orphanListOf.get(card._id);
        if (listTitle === undefined) {
            orphanCards.push(toIssue(card));
        } else {
            detachedCards.push({ ...toIssue(card), listTitle });
        }
    }
    detachedCards.sort(byHoursThenTitle);
    orphanCards.sort(byHoursThenTitle);

    const cardById = new Set(cards.map((card) => card._id));
    const listById = new Set(lists.map((list) => list._id));
    const sessionIds = new Set(sessions.map((session) => session._id));

    const deadMoves = moves.filter(
        (move) =>
            !cardById.has(move.cardId) ||
            !listById.has(move.fromListId) ||
            !listById.has(move.toListId)
    );

    const dangling: DanglingRefIssue[] = [];
    for (const board of boards) {
        const count = countInvalid(board.lists, (id) => listById.has(id));
        if (count > 0) {
            dangling.push({
                kind: 'boardLists',
                ownerId: board._id,
                ownerTitle: board.name,
                count,
            });
        }
    }
    // Orphan lists are left out: they are either deleted as a whole or never
    // rendered, so repairing their arrays would be work nobody sees.
    for (const list of liveLists) {
        const count = countInvalid(list.cards, (id) => cardById.has(id));
        if (count > 0) {
            dangling.push({
                kind: 'listCards',
                ownerId: list._id,
                ownerTitle: list.title,
                count,
            });
        }
    }
    for (const card of cards) {
        if (!liveCardIds.has(card._id)) {
            continue;
        }
        const count = countInvalid(card.sessionIds, (id) => sessionIds.has(id));
        if (count > 0) {
            dangling.push({
                kind: 'cardSessions',
                ownerId: card._id,
                ownerTitle: card.title,
                count,
            });
        }
    }

    return {
        detachedCards,
        orphanCards,
        lists: orphanLists.map((list) => ({ _id: list._id, title: list.title })),
        moves: {
            total: deadMoves.length,
            cardCount: new Set(deadMoves.map((move) => move.cardId)).size,
        },
        dangling,
    };
}

/**
 * Applies the dialog's selection in one transaction.
 *
 * Deleting a card also takes it out of every list that still names it. Board
 * totals are untouched: they count sessions, so a removed card only turns its
 * sessions into "unassigned". Lists and boards are rewritten with final arrays,
 * so dropping dead references and deleting a card cannot produce a half-updated
 * row.
 */
export async function repairData(payload: DataRepairPayload): Promise<DataRepairResult> {
    const repos = await loadRepos();
    const cards = repos.cards.findSync<Card>();
    const lists = repos.lists.findSync<List>();
    const boards = repos.boards.findSync<KanbanBoard>();
    const sessions = repos.sessions.findSync<PomodoroRecord>();

    const cardById = new Set(cards.map((card) => card._id));
    const listById = new Set(lists.map((list) => list._id));
    const sessionIds = new Set(sessions.map((session) => session._id));

    // Ids that vanished between the scan and the confirmation are ignored: the
    // user asked for a repair, not for an error about a row they cannot see.
    const cardIds = new Set(payload.cardIds.filter((id) => cardById.has(id)));
    const listIds = new Set(payload.listIds.filter((id) => listById.has(id)));
    const listRefIds = new Set(payload.listCardRefIds);
    const boardRefIds = new Set(payload.boardListRefIds);
    const cardRefIds = new Set(payload.cardSessionRefIds);

    let repairedRefs = 0;

    const updatedLists: { [id: string]: List } = {};
    for (const list of lists) {
        const fixRefs = listRefIds.has(list._id);
        const next: string[] = [];
        const seen = new Set<string>();
        let changed = false;

        for (const cardId of list.cards ?? []) {
            if (cardIds.has(cardId)) {
                // The card is going away; leaving its id here would create a
                // dangling reference the very check it came from reported.
                changed = true;
                continue;
            }
            if (fixRefs && (!cardById.has(cardId) || seen.has(cardId))) {
                changed = true;
                repairedRefs += 1;
                continue;
            }
            seen.add(cardId);
            next.push(cardId);
        }

        if (changed) {
            updatedLists[list._id] = { ...list, cards: next };
        }
    }

    const updatedBoards: { [id: string]: KanbanBoard } = {};
    for (const board of boards) {
        const fixRefs = boardRefIds.has(board._id);
        const next: string[] = [];
        const seen = new Set<string>();
        let changed = false;

        for (const listId of board.lists ?? []) {
            if (listIds.has(listId)) {
                changed = true;
                continue;
            }
            if (fixRefs && (!listById.has(listId) || seen.has(listId))) {
                changed = true;
                repairedRefs += 1;
                continue;
            }
            seen.add(listId);
            next.push(listId);
        }

        if (changed) {
            updatedBoards[board._id] = { ...board, lists: next };
        }
    }

    const updatedCards: { [id: string]: Card } = {};
    for (const card of cards) {
        if (cardIds.has(card._id) || !cardRefIds.has(card._id)) {
            continue;
        }
        const next: string[] = [];
        const seen = new Set<string>();
        let changed = false;

        for (const sessionId of card.sessionIds ?? []) {
            if (!sessionIds.has(sessionId) || seen.has(sessionId)) {
                changed = true;
                repairedRefs += 1;
                continue;
            }
            seen.add(sessionId);
            next.push(sessionId);
        }

        if (changed) {
            updatedCards[card._id] = { ...card, sessionIds: next };
        }
    }

    // `moves` has no `_id` column, so it can only be addressed by what the rows
    // point at. The surviving sets are computed AFTER the deletions above, so a
    // move that referenced a card removed in this same call is included.
    const survivingCardIds = cards.filter((card) => !cardIds.has(card._id)).map((card) => card._id);
    const survivingListIds = lists.filter((list) => !listIds.has(list._id)).map((list) => list._id);

    let removedMoves = 0;
    runInTransaction(() => {
        if (cardIds.size > 0) {
            repos.cards.removeSync({ _id: { $in: Array.from(cardIds) } }, { multi: true });
        }
        if (listIds.size > 0) {
            repos.lists.removeSync({ _id: { $in: Array.from(listIds) } }, { multi: true });
        }
        for (const list of Object.values(updatedLists)) {
            repos.lists.updateSync({ _id: list._id }, { $set: { cards: list.cards } });
        }
        for (const board of Object.values(updatedBoards)) {
            repos.boards.updateSync({ _id: board._id }, { $set: { lists: board.lists } });
        }
        for (const card of Object.values(updatedCards)) {
            repos.cards.updateSync({ _id: card._id }, { $set: { sessionIds: card.sessionIds } });
        }
        if (payload.removeOrphanMoves) {
            removedMoves = repos.moves.removeSync(
                {
                    $or: [
                        { cardId: { $nin: survivingCardIds } },
                        { fromListId: { $nin: survivingListIds } },
                        { toListId: { $nin: survivingListIds } },
                    ],
                },
                { multi: true }
            );
        }
    });

    return {
        removedCards: Array.from(cardIds),
        removedLists: Array.from(listIds),
        updatedCards,
        updatedLists,
        updatedBoards,
        removedMoves,
        repairedRefs,
    };
}
