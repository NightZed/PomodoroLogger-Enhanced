import type { Card, KanbanBoard, MoveInfo } from '../../renderer/components/Kanban/type';
import type { PomodoroRecord } from '../../renderer/monitor/type';
import type { SourceData } from '../dataMerger/dataMerger';
import { MAX_RECORDED_ISSUES } from './validate';

/**
 * What an import left behind, counted on the merged data.
 *
 * Import never deletes or repairs anything (see `.scratch/import-report/spec.md`):
 * a card no list names, a move whose endpoint is gone and a card naming a dead
 * session all reach the database unchanged. This module reports them; the data
 * check cleans them up. Counting here, on the merge result, is what makes the
 * numbers agree with what the check will find a minute later.
 */
export interface ImportSummaryCounts {
    /** Cards no live list names, including those an orphan list still names. */
    cardsOutsideLists: number;
    deadMoves: number;
    danglingSessions: number;
    /** Sessions whose `boardId` names a board the merged data does not have. */
    unknownBoard: number;
    /** Sessions that never had a project. Normal, but worth mentioning. */
    noBoard: number;
    /** Cards the merge put back into a list based on a move record. */
    rehomed: number;
}

export interface ImportSummary {
    counts: ImportSummaryCounts;
}

/** One block of `data.log`: a heading plus 4-space-indented detail lines. */
export interface ImportLogGroup {
    title: string;
    lines: string[];
    /** Entries beyond the 500-line cap, written as `N more not shown`. */
    more: number;
}

/** Lets the main process format times with the logger's local-offset format. */
export type FormatImportTime = (time: number) => string;

interface CardOutsideList {
    card: Card;
    state: 'orphan' | 'detached';
    listTitle?: string;
}

interface DanglingSession {
    card: Card;
    sessionId: string;
}

interface ImportDetails {
    cardsOutsideLists: CardOutsideList[];
    deadMoves: MoveInfo[];
    danglingSessions: DanglingSession[];
    unknownBoard: PomodoroRecord[];
    noBoard: PomodoroRecord[];
}

const listIdsOf = (boards: KanbanBoard[]): Set<string> => {
    const referenced = new Set<string>();
    for (const board of boards) {
        for (const listId of board.lists ?? []) {
            referenced.add(listId);
        }
    }
    return referenced;
};

/**
 * The same rules the data check uses:
 * - "live list" means some board names it; a card only an orphan list names is
 *   already outside the visible board tree, so it counts as outside a list.
 * - a dangling session is only reported for cards that are inside a live list;
 *   the same dead id on an orphan card is handled when that card is restored
 *   or deleted.
 */
const collect = (merged: SourceData): ImportDetails => {
    const cards = Object.values(merged.cards ?? {});
    const lists = Object.values(merged.lists ?? {});
    const boards = Object.values(merged.boards ?? {});
    const records = merged.records ?? [];
    const moves = merged.move ?? [];

    const referencedListIds = listIdsOf(boards);
    const liveLists = lists.filter((list) => referencedListIds.has(list._id));
    const orphanLists = lists.filter((list) => !referencedListIds.has(list._id));

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

    const cardsOutsideLists: CardOutsideList[] = cards
        .filter((card) => !liveCardIds.has(card._id))
        .map((card) => {
            const listTitle = orphanListOf.get(card._id);
            return listTitle === undefined
                ? { card, state: 'orphan' as const }
                : { card, state: 'detached' as const, listTitle };
        });

    const cardIds = new Set(cards.map((card) => card._id));
    const listIds = new Set(lists.map((list) => list._id));
    const deadMoves = moves.filter(
        (move) =>
            !cardIds.has(move.cardId) ||
            !listIds.has(move.fromListId) ||
            !listIds.has(move.toListId)
    );

    const recordIds = new Set(records.map((record) => record._id));
    const danglingSessions: DanglingSession[] = [];
    for (const card of cards) {
        if (!liveCardIds.has(card._id)) {
            continue;
        }
        for (const sessionId of card.sessionIds ?? []) {
            if (!recordIds.has(sessionId)) {
                danglingSessions.push({ card, sessionId });
            }
        }
    }

    // Same test as `aggPomodoro`: an empty `boardId` is falsy and lands in the
    // sentinel bucket; a board id that exists but has no name is not Unknown.
    const unknownBoard: PomodoroRecord[] = [];
    const noBoard: PomodoroRecord[] = [];
    for (const record of records) {
        if (!record.boardId) {
            noBoard.push(record);
        } else if (merged.boards?.[record.boardId] === undefined) {
            unknownBoard.push(record);
        }
    }

    return { cardsOutsideLists, deadMoves, danglingSessions, unknownBoard, noBoard };
};

export function analyzeImport(
    merged: SourceData,
    rehomed: { cardId: string; listId: string }[]
): ImportSummary {
    const details = collect(merged);
    return {
        counts: {
            cardsOutsideLists: details.cardsOutsideLists.length,
            deadMoves: details.deadMoves.length,
            danglingSessions: details.danglingSessions.length,
            unknownBoard: details.unknownBoard.length,
            noBoard: details.noBoard.length,
            rehomed: rehomed.length,
        },
    };
}

const hours = (value: number | undefined): string => `${(value ?? 0).toFixed(2)}h`;
const titleOf = (card: Card | undefined): string => `title=${JSON.stringify(card?.title ?? '')}`;
const appCount = (record: PomodoroRecord): number => Object.keys(record.apps ?? {}).length;

const cap = <T>(items: T[]): { shown: T[]; more: number } => ({
    shown: items.slice(0, MAX_RECORDED_ISSUES),
    more: Math.max(0, items.length - MAX_RECORDED_ISSUES),
});

const heading = (label: string, total: number, shown: number): string =>
    total > shown ? `${label} (${total}, showing ${shown})` : `${label} (${total})`;

/**
 * The detail blocks written to `data.log` after a merge.
 *
 * Every line carries only fields that exist: a dangling session has no row
 * left, so it has no start time or duration to print -- only the card it was
 * credited to and the id that no longer resolves.
 */
export function buildImportLogGroups(
    merged: SourceData,
    rehomed: { cardId: string; listId: string }[],
    formatTime: FormatImportTime
): ImportLogGroup[] {
    const details = collect(merged);
    const groups: ImportLogGroup[] = [];

    const outside = cap(details.cardsOutsideLists);
    if (details.cardsOutsideLists.length > 0) {
        groups.push({
            title: heading(
                'cards not in any list',
                details.cardsOutsideLists.length,
                outside.shown.length
            ),
            lines: outside.shown.map(({ card, state, listTitle }) => {
                const sessions = new Set(card.sessionIds ?? []).size;
                return (
                    `card=${card._id} ${titleOf(card)} ` +
                    `spent=${hours(card.spentTimeInHour?.actual)} sessions=${sessions} ` +
                    `state=${state}` +
                    (listTitle === undefined ? '' : ` list=${JSON.stringify(listTitle)}`)
                );
            }),
            more: outside.more,
        });
    }

    const moves = cap(details.deadMoves);
    if (details.deadMoves.length > 0) {
        groups.push({
            title: heading('dead move records', details.deadMoves.length, moves.shown.length),
            lines: moves.shown.map((move) => {
                const card = merged.cards?.[move.cardId];
                return (
                    `card=${move.cardId}` +
                    (card === undefined ? '' : ` ${titleOf(card)}`) +
                    ` from=${move.fromListId} to=${move.toListId} time=${formatTime(move.time)}`
                );
            }),
            more: moves.more,
        });
    }

    const dangling = cap(details.danglingSessions);
    if (details.danglingSessions.length > 0) {
        groups.push({
            title: heading(
                'dangling session references',
                details.danglingSessions.length,
                dangling.shown.length
            ),
            lines: dangling.shown.map(
                ({ card, sessionId }) => `card=${card._id} ${titleOf(card)} session=${sessionId}`
            ),
            more: dangling.more,
        });
    }

    const unknownBoard = cap(details.unknownBoard);
    if (details.unknownBoard.length > 0) {
        groups.push({
            title: heading(
                'unknown projects - deleted board',
                details.unknownBoard.length,
                unknownBoard.shown.length
            ),
            lines: unknownBoard.shown.map(
                (record) =>
                    `session=${record._id} board=${record.boardId} ` +
                    `start=${formatTime(record.startTime)} spent=${hours(record.spentTimeInHour)} ` +
                    `apps=${appCount(record)}`
            ),
            more: unknownBoard.more,
        });
    }

    const noBoard = cap(details.noBoard);
    if (details.noBoard.length > 0) {
        groups.push({
            title: heading(
                'unknown projects - no project',
                details.noBoard.length,
                noBoard.shown.length
            ),
            lines: noBoard.shown.map(
                (record) =>
                    `session=${record._id} start=${formatTime(record.startTime)} ` +
                    `spent=${hours(record.spentTimeInHour)} apps=${appCount(record)}`
            ),
            more: noBoard.more,
        });
    }

    const rehomedGroup = cap(rehomed);
    if (rehomed.length > 0) {
        groups.push({
            title: heading(
                'cards rehomed by move records',
                rehomed.length,
                rehomedGroup.shown.length
            ),
            lines: rehomedGroup.shown.map(({ cardId, listId }) => {
                const card = merged.cards?.[cardId];
                return `card=${cardId} ${titleOf(card)} list=${listId} by=move`;
            }),
            more: rehomedGroup.more,
        });
    }

    return groups;
}
