import { Counter } from './Counter';
import { getWeightsFromPomodoros } from './tokenizer';
import { PomodoroRecord } from '../renderer/monitor/type';

export interface TimeSpentData {
    projectData: { name: string; value: number }[];
    appData: { name: string; value: number }[];
}

const DAY_MS = 24 * 3600 * 1000;

/**
 * Local-midnight-aligned timestamp of the day `time` belongs to.
 * getTimezoneOffset() is UTC minus local time (e.g. -480 for UTC+8), so
 * bucketing on (time - offset) aligns to local days; add offset back to get
 * the local midnight timestamp. Pure arithmetic: no Date/string allocation
 * and no per-call parsing in the hot aggregation loop.
 */
export const getDateFromTimestamp = (time: number): Date => {
    const offsetMs = new Date().getTimezoneOffset() * 60000;
    return new Date(Math.floor((time - offsetMs) / DAY_MS) * DAY_MS + offsetMs);
};

export const getPomodoroCalendarData = (pomodoros: PomodoroRecord[]) => {
    const counter = new Counter();
    const timeSum = new Counter();
    pomodoros.forEach((v) => {
        const date = getDateFromTimestamp(v.startTime).getTime();
        counter.add(date);
        timeSum.add(date, v.spentTimeInHour);
    });

    const ans: Record<string, { count: number; hours: number }> = {};
    for (const key in counter.dict) {
        ans[key] = { count: counter.dict[key], hours: timeSum.dict[key] };
    }

    return ans;
};

export const getPomodoroAgg = (
    days: number,
    pomodoros: PomodoroRecord[]
): { count: number; hours: number } => {
    const time = getDateFromTimestamp(new Date().getTime()).getTime() - days * DAY_MS;
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

export function getBetterAppName(appName: string) {
    const name = appName.replace(/\.exe$/g, '');
    return name[0].toUpperCase() + name.slice(1);
}

const UNK = 'UNK[qqwe]';

/**
 * Aggregate time spent per project/app from records. Pure and synchronous so it
 * can run inside a web worker; project ids are resolved through the provided
 * `boardNames` map instead of hitting the kanban DB.
 */
export function getTimeSpentDataFromRecordsSync(
    pomodoros: PomodoroRecord[],
    boardNames: { [boardId: string]: string } = {}
): TimeSpentData {
    const appTimeCounter = new Counter();
    const projectTimeCounter = new Counter();
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

        v.name = boardNames[v.name] ?? 'Unknown';
    }

    const appData = appTimeCounter
        .getNameValuePairs({ toFixed: 2, topK: 10, minRatio: 0.01 })
        .map((v) => ({ ...v, name: getBetterAppName(v.name) }));

    return {
        projectData,
        appData,
    };
}

export function getTokenWeights(records: PomodoroRecord[]): [string, number][] {
    return getWeightsFromPomodoros(records, []);
}

/**
 * Everything the History view needs, computed from already-queried records.
 * Runs inside the db worker so raw records never cross to the main thread.
 */
export function aggHistory(
    recentRecords: PomodoroRecord[],
    yearRecords: PomodoroRecord[],
    boardNames: { [boardId: string]: string }
) {
    return {
        agg: {
            day: getPomodoroAgg(0, recentRecords),
            week: getPomodoroAgg(new Date().getDay(), recentRecords),
            month: getPomodoroAgg(new Date().getDate() - 1, recentRecords),
        },
        total: {
            count: yearRecords.length,
            usedTime: yearRecords.reduce((a, b) => a + b.spentTimeInHour, 0),
        },
        wordWeights: getTokenWeights(yearRecords),
        pieChart: getTimeSpentDataFromRecordsSync(yearRecords, boardNames),
        calendarCount: getPomodoroCalendarData(yearRecords),
    };
}
