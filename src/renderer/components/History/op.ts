import { Counter } from '../../../utils/Counter';
import { PomodoroRecord } from '../../monitor/type';
import { getBetterAppName } from '../../utils';
import { getNameFromBoardId } from '../../getNameFromBoardId';
import { workers } from '../../workers';

export const getPomodoroCalendarData = (pomodoros: PomodoroRecord[]) => {
    const counter = new Counter();
    const timeSum = new Counter();
    pomodoros.forEach((v) => {
        const date = _getDateFromTimestamp(v.startTime).getTime();
        counter.add(date);
        timeSum.add(date, v.spentTimeInHour);
    });

    const ans: Record<string, { count: number; hours: number }> = {};
    for (const key in counter.dict) {
        ans[key] = { count: counter.dict[key], hours: timeSum.dict[key] };
    }

    return ans;
};

const _getDateFromTimestamp = (time: number): Date => {
    const datetime = new Date(time);
    const dateStr = `${datetime.getFullYear()}-${datetime.getMonth() + 1}-${datetime.getDate()}`;
    return new Date(dateStr);
};

export const getPomodoroAgg = (
    days: number,
    pomodoros: PomodoroRecord[]
): { count: number; hours: number } => {
    const time = _getDateFromTimestamp(new Date().getTime()).getTime() - days * 24 * 3600 * 1000;
    let count = 0;
    let hours = 0;
    for (const p of pomodoros) {
        if (p.startTime >= time) {
            count += 1;
            hours += p.spentTimeInHour;
        }
    }

    return { count, hours };
};

export interface TimeSpentData {
    projectData: { name: string; value: number }[];
    appData: { name: string; value: number }[];
}

export const getTimeSpentDataFromRecords = async (
    pomodoros: PomodoroRecord[]
): Promise<TimeSpentData> => {
    const appTimeCounter = new Counter();
    const projectTimeCounter = new Counter();
    const UNK = 'UNK[qqwe]';
    for (const pomodoro of pomodoros) {
        if (pomodoro.boardId) {
            projectTimeCounter.add(pomodoro.boardId, pomodoro.spentTimeInHour);
        } else {
            projectTimeCounter.add(UNK, pomodoro.spentTimeInHour);
        }

        const apps = pomodoro.apps;
        for (const app in apps) {
            appTimeCounter.add(apps[app].appName, apps[app].spentTimeInHour);
        }
    }

    const projectData = projectTimeCounter.getNameValuePairs({
        toFixed: 2,
        topK: 10,
    });
    for (const v of projectData) {
        if (v.name === UNK) {
            v.name = 'Unknown';
            continue;
        }

        v.name = await getNameFromBoardId(v.name).catch(() => 'Unknown');
    }

    const appData = appTimeCounter
        .getNameValuePairs({ toFixed: 2, topK: 10, minRatio: 0.01 })
        .map((v) => ({ ...v, name: getBetterAppName(v.name) }));

    return {
        projectData,
        appData,
    };
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
        wordWeights: await workers.tokenizer.tokenize(yearRecords, []),
        pieChart: await getTimeSpentDataFromRecords(yearRecords),
        calendarCount: getPomodoroCalendarData(yearRecords),
    };
}
