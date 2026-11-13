import type { Card, KanbanBoard, List } from '../renderer/components/Kanban/type';

/**
 * One card the sweep can offer to restore or delete.
 *
 * `listTitle` is set when an orphan list still names the card: that is the
 * shape left behind by the old "delete the board row only" behaviour. Without
 * it the card is not named by any list at all, which is what a crash in the
 * middle of a cross-list drag, or a hand-edited import, leaves behind.
 */
export interface CardIssue {
    _id: string;
    title: string;
    spentHours: number;
    sessionCount: number;
    /** Only for cards still named by a list that no board owns. */
    listTitle?: string;
}

/** A list no `board.lists` names. Its board name is gone, not recoverable. */
export interface ListIssue {
    _id: string;
    title: string;
}

/** Move rows whose card or either end list no longer exists. */
export interface MoveIssue {
    total: number;
    /** Distinct cards those rows mention, for the one-line summary. */
    cardCount: number;
}

/**
 * One id an array still names but should not.
 *
 * Dead ids and duplicates have no row left to read a title from, so the id is
 * all the dialog can show. `times` is how often the array names it; 2+ means
 * the entry is repeated rather than merely dead.
 */
export interface DanglingRefId {
    id: string;
    times: number;
}

/**
 * An array that names rows which no longer exist, or names one twice.
 * `kind` decides which owner carries it.
 */
export interface DanglingRefIssue {
    kind: 'listCards' | 'boardLists' | 'cardSessions';
    ownerId: string;
    ownerTitle: string;
    /** Entries that would be dropped: dead ids plus duplicates. */
    count: number;
    /**
     * The distinct ids behind `count`, in first-seen order. `count` can be
     * larger than `ids.length` when an id is repeated or appears several
     * times after being deleted.
     */
    ids: DanglingRefId[];
}

export interface DataIssuesReport {
    /** Cards still named by an orphan list (old board/list deletions). */
    detachedCards: CardIssue[];
    /** Cards no list names at all (drag crash, import, hand-edited file). */
    orphanCards: CardIssue[];
    /** Lists no board owns. */
    lists: ListIssue[];
    moves: MoveIssue;
    dangling: DanglingRefIssue[];
}

/**
 * What the dialog asks for. Every field is a subset of what the scan reported;
 * ids that no longer exist are ignored, so a stale dialog cannot fail.
 */
export interface DataRepairPayload {
    cardIds: string[];
    listIds: string[];
    removeOrphanMoves: boolean;
    /** Lists whose `cards` array should lose dead and duplicate entries. */
    listCardRefIds: string[];
    /** Boards whose `lists` array should lose dead and duplicate entries. */
    boardListRefIds: string[];
    /** Cards whose `sessionIds` array should lose dead and duplicate entries. */
    cardSessionRefIds: string[];
}

/**
 * Final state of everything the transaction touched. The renderer replaces
 * these rows wholesale: a repair can delete cards and lists, rewrite one list's
 * `cards` while another keeps its array untouched, and fix a card's hours in
 * the same call.
 */
export interface DataRepairResult {
    removedCards: string[];
    removedLists: string[];
    updatedCards: { [id: string]: Card };
    updatedLists: { [id: string]: List };
    updatedBoards: { [id: string]: KanbanBoard };
    removedMoves: number;
    /** Dead and duplicate entries dropped from owner arrays. */
    repairedRefs: number;
}
