import { DBs, loadDBs, runInTransaction } from './index';
import type { SqliteRepository } from './repository';
import { scanSessionHours } from './sessionHours';
import type { Card, KanbanBoard, List, MoveInfo } from '../../renderer/components/Kanban/type';
import type {
    CardIssue,
    DanglingRefId,
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

/**
 * The scan reads a projection, not the full rows: a card's content, labels and
 * timestamps never reach the report, and every session's per-app breakdown is
 * several kilobytes. Parsing all of that blocked the main process for about a
 * second per 20k sessions, which is long enough that the window stopped
 * repainting before the spinner appeared.
 */
type CardRow = Pick<Card, '_id' | 'title' | 'sessionIds'> & {
    spentTimeInHour?: { estimated?: number; actual?: number };
};
type ListRow = Pick<List, '_id' | 'title' | 'cards'>;
type BoardRow = Pick<KanbanBoard, '_id' | 'name' | 'lists'>;
type MoveRefs = Pick<MoveInfo, 'cardId' | 'fromListId' | 'toListId'>;

const toIssue = (card: CardRow): CardIssue => ({
    _id: card._id,
    title: card.title,
    spentHours: card.spentTimeInHour?.actual ?? 0,
    sessionCount: new Set(card.sessionIds ?? []).size,
});

interface InvalidEntries {
    /** Entries that would be dropped. */
    count: number;
    /** Distinct ids that lose at least one entry, in first-seen order. */
    ids: DanglingRefId[];
}

/**
 * Entries a repair would drop: ids that do not exist, and repeated ids.
 *
 * A dead id is listed once with its total occurrence count, so `id ×3` means
 * the array names it three times while `count` counts all three entries. A
 * live id that appears twice is listed too (the second copy is what gets
 * dropped) with `times: 2`.
 */
const collectInvalid = (
    ids: string[] | undefined,
    exists: (id: string) => boolean
): InvalidEntries => {
    const occurrences = new Map<string, number>();
    const broken = new Set<string>();
    const seen = new Set<string>();
    let count = 0;

    for (const id of ids ?? []) {
        occurrences.set(id, (occurrences.get(id) ?? 0) + 1);
        if (!exists(id)) {
            count += 1;
            broken.add(id);
        } else if (seen.has(id)) {
            count += 1;
            broken.add(id);
        }
        seen.add(id);
    }

    return {
        count,
        ids: [...occurrences]
            .filter(([id]) => broken.has(id))
            .map(([id, times]) => ({ id, times })),
    };
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
    const cards = repos.cards.findFieldsSync<CardRow>({}, [
        'title',
        'sessionIds',
        'spentTimeInHour.actual',
    ]);
    const lists = repos.lists.findFieldsSync<ListRow>({}, ['title', 'cards']);
    const boards = repos.boards.findFieldsSync<BoardRow>({}, ['name', 'lists']);
    const moves = repos.moves.findFieldsSync<MoveRefs>({}, ['cardId', 'fromListId', 'toListId']);
    // The scan only needs to know which sessions exist. Reading the rows would
    // parse every app/title breakdown in the history to build one id set.
    const sessionIds = new Set(repos.sessions.idsSync());

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

    const deadMoves = moves.filter(
        (move) =>
            !cardById.has(move.cardId) ||
            !listById.has(move.fromListId) ||
            !listById.has(move.toListId)
    );

    const dangling: DanglingRefIssue[] = [];
    for (const board of boards) {
        const invalid = collectInvalid(board.lists, (id) => listById.has(id));
        if (invalid.count > 0) {
            dangling.push({
                kind: 'boardLists',
                ownerId: board._id,
                ownerTitle: board.name,
                count: invalid.count,
                ids: invalid.ids,
            });
        }
    }
    // Orphan lists are left out: they are either deleted as a whole or never
    // rendered, so repairing their arrays would be work nobody sees.
    for (const list of liveLists) {
        const invalid = collectInvalid(list.cards, (id) => cardById.has(id));
        if (invalid.count > 0) {
            dangling.push({
                kind: 'listCards',
                ownerId: list._id,
                ownerTitle: list.title,
                count: invalid.count,
                ids: invalid.ids,
            });
        }
    }
    for (const card of cards) {
        if (!liveCardIds.has(card._id)) {
            continue;
        }
        const invalid = collectInvalid(card.sessionIds, (id) => sessionIds.has(id));
        if (invalid.count > 0) {
            dangling.push({
                kind: 'cardSessions',
                ownerId: card._id,
                ownerTitle: card.title,
                count: invalid.count,
                ids: invalid.ids,
            });
        }
    }

    // The calibration is a second, cheaper sweep (paged json_each, a few
    // hundred rows at a time). It is folded in here so the dialog can point at
    // it without a second click.
    const hours = await scanSessionHours();

    return {
        detachedCards,
        orphanCards,
        lists: orphanLists.map((list) => ({ _id: list._id, title: list.title })),
        moves: {
            total: deadMoves.length,
            cardCount: new Set(deadMoves.map((move) => move.cardId)).size,
        },
        dangling,
        appHours: { over: hours.over.total, under: hours.under.total },
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
    const lists = repos.lists.findSync<List>();
    const boards = repos.boards.findSync<KanbanBoard>();
    // Only the ids matter here; the rows themselves are never rewritten.
    const sessionIds = new Set(repos.sessions.idsSync());
    const allCardIds = repos.cards.idsSync();

    const cardById = new Set(allCardIds);
    const listById = new Set(lists.map((list) => list._id));

    // Ids that vanished between the scan and the confirmation are ignored: the
    // user asked for a repair, not for an error about a row they cannot see.
    const cardIds = new Set(payload.cardIds.filter((id) => cardById.has(id)));
    const listIds = new Set(payload.listIds.filter((id) => listById.has(id)));
    const listRefIds = new Set(payload.listCardRefIds);
    const boardRefIds = new Set(payload.boardListRefIds);
    const cardRefIds = new Set(payload.cardSessionRefIds);

    // Only the cards whose `sessionIds` are being repaired need their full row
    // (the renderer replaces them wholesale). Reading every card would parse
    // each card body for a repair that may touch a handful of them.
    const repairedCardIds = Array.from(cardRefIds).filter(
        (id) => cardById.has(id) && !cardIds.has(id)
    );
    const cards =
        repairedCardIds.length === 0
            ? []
            : repos.cards.findSync<Card>({ _id: { $in: repairedCardIds } });

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
    const survivingCardIds = allCardIds.filter((id) => !cardIds.has(id));
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
