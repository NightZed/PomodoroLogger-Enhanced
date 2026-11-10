import type { PomodoroRecord } from '../../renderer/monitor/type';
import { MAX_RECORDED_ISSUES } from './validate';

/**
 * Which sessions the History view will put in its `Unknown` bucket.
 *
 * `aggPomodoro.ts` resolves a session's project name as
 * `boardNames[boardId] ?? 'Unknown'` and sends sessions without a `boardId`
 * to a sentinel bucket named `Unknown` as well. So exactly two kinds of data
 * end up there: sessions that never had a project, and sessions pointing at a
 * board that no longer exists. The second kind is what an import produces when
 * the file carries sessions but not the board they belong to.
 *
 * The report is for `data.log` only: it never blocks an import, and a session
 * without a project is a normal state, not a defect.
 */
export interface UnknownSessionReport {
    /** Every session rendered as `Unknown`, including those past the detail cap. */
    total: number;
    /** Sessions without a `boardId` at all. */
    noBoardId: number;
    /** Sessions whose `boardId` is not in `boards`. */
    danglingBoardId: number;
    /** Spent hours summed over the flagged sessions, so the size is visible. */
    hours: number;
    /** Dangling board ids by session count, descending. */
    danglingIds: [string, number][];
    /** One line per session, at most `MAX_RECORDED_ISSUES` of them. */
    lines: string[];
}

/** How many dangling ids the headline names before switching to "and N more". */
const MAX_HEADLINE_IDS = 10;

const hoursOf = (record: PomodoroRecord): string => (record.spentTimeInHour ?? 0).toFixed(2);

export function analyzeUnknownProjects(
    records: PomodoroRecord[],
    boards: { [boardId: string]: unknown }
): UnknownSessionReport {
    const danglingCounts = new Map<string, number>();
    const lines: string[] = [];
    let total = 0;
    let noBoardId = 0;
    let danglingBoardId = 0;
    let hours = 0;

    for (const record of records) {
        const boardId = record.boardId;
        // Same test as `aggPomodoro.ts`: an empty string is falsy there too, so
        // it lands in the sentinel bucket rather than being looked up.
        const missing = !boardId;
        // `?? 'Unknown'` only fires when the lookup is `undefined`; a board
        // that exists with an empty name renders as a blank block, not Unknown.
        const dangling = !missing && boards[boardId] === undefined;
        if (!missing && !dangling) {
            continue;
        }

        total += 1;
        hours += record.spentTimeInHour ?? 0;
        const id = JSON.stringify(record._id);
        const spent = hoursOf(record);

        if (missing) {
            noBoardId += 1;
            if (lines.length < MAX_RECORDED_ISSUES) {
                lines.push(
                    `records[${id}] boardId missing startTime=${record.startTime} spent=${spent}h`
                );
            }
        } else {
            danglingBoardId += 1;
            danglingCounts.set(boardId, (danglingCounts.get(boardId) ?? 0) + 1);
            if (lines.length < MAX_RECORDED_ISSUES) {
                lines.push(
                    `records[${id}] boardId=${JSON.stringify(boardId)} not in boards ` +
                        `startTime=${record.startTime} spent=${spent}h`
                );
            }
        }
    }

    const danglingIds = Array.from(danglingCounts.entries()).sort((a, b) => b[1] - a[1]);

    return {
        total,
        noBoardId,
        danglingBoardId,
        hours,
        danglingIds,
        lines,
    };
}

/**
 * The one-line summary that heads the log block, so the pattern is readable
 * without scrolling through the detail lines.
 */
export function describeUnknownProjects(report: UnknownSessionReport): string {
    const named = report.danglingIds
        .slice(0, MAX_HEADLINE_IDS)
        .map(([id, count]) => `${id}:${count}`)
        .join(',');
    const hidden = report.danglingIds.length - MAX_HEADLINE_IDS;
    const ids = hidden > 0 ? `${named},+${hidden} more` : named;

    return (
        `total=${report.total} noBoardId=${report.noBoardId} dangling=${report.danglingBoardId} ` +
        `hours=${report.hours.toFixed(2)}` +
        (report.danglingIds.length > 0 ? ` ids="${ids}"` : '')
    );
}
