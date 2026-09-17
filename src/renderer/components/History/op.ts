import { getNameFromBoardId } from '../../getNameFromBoardId';
import { PomodoroRecord } from '../../monitor/type';
import {
    getTokenWeights,
    getPomodoroAgg,
    getPomodoroCalendarData,
    getTimeSpentDataFromRecordsSync,
    TimeSpentData,
} from '../../../utils/aggPomodoro';

export { getPomodoroAgg, getPomodoroCalendarData };
export type { TimeSpentData };

const boardNameCache = new Map<string, string>();
async function resolveBoardName(boardId: string) {
    if (boardNameCache.has(boardId)) {
        return boardNameCache.get(boardId) as string;
    }

    const name = await getNameFromBoardId(boardId).catch(() => 'Unknown');
    boardNameCache.set(boardId, name);
    return name;
}

/**
 * Async variant used outside the worker (e.g. DualPieChart): delegates the
 * counting to the shared sync core and resolves project names via the kanban DB.
 */
export const getTimeSpentDataFromRecords = async (
    pomodoros: PomodoroRecord[]
): Promise<TimeSpentData> => {
    const boardIds = new Set(pomodoros.filter((p) => p.boardId).map((p) => p.boardId as string));
    const boardNames: { [boardId: string]: string } = {};
    await Promise.all(
        Array.from(boardIds).map(async (boardId) => {
            boardNames[boardId] = await resolveBoardName(boardId);
        })
    );
    return getTimeSpentDataFromRecordsSync(pomodoros, boardNames);
};

export interface AggPomodoroInfo {
    agg: {
        day?: { count: number; hours: number };
        week?: { count: number; hours: number };
        month?: { count: number; hours: number };
    };
    total: {
        count?: number;
        usedTime?: number;
    };
    calendarCount?: any;
    wordWeights?: [string, number][];
    pieChart?: TimeSpentData;
}

/**
 * Aggregate pomodoro records.
 * `pomodoros` feeds the Today/Week/Month stats (recent records only, avoid full load);
 * `yearRecords` feeds the calendar/pie/word cloud and the total count/time badge
 * (queried for the chosen year or All time; defaults to `pomodoros` for backward
 * compatibility, e.g. tests). The badge and the word cloud share the same source as
 * the charts, so they follow the project/year filter; card titles are not mixed in
 * because cards have no year dimension, so the word cloud follows the period.
 *
 * Kept for in-process use (tests, DualPieChart). The History view uses the
 * worker-side `aggHistory` op instead, so records stay inside the worker.
 */
export async function getAggPomodoroInfo(
    pomodoros: PomodoroRecord[],
    yearRecords: PomodoroRecord[] = pomodoros
): Promise<AggPomodoroInfo> {
    return {
        agg: {
            day: getPomodoroAgg(0, pomodoros),
            week: getPomodoroAgg(new Date().getDay(), pomodoros),
            month: getPomodoroAgg(new Date().getDate() - 1, pomodoros),
        },
        total: {
            count: yearRecords.length,
            usedTime: yearRecords.reduce((a, b) => a + b.spentTimeInHour, 0),
        },
        wordWeights: getTokenWeights(yearRecords),
        pieChart: await getTimeSpentDataFromRecords(yearRecords),
        calendarCount: getPomodoroCalendarData(yearRecords),
    };
}
