import { Counter } from './Counter';
import { getWeightsFromPomodoros } from './tokenizer';
import { PomodoroRecord } from '../renderer/monitor/type';
import { roundHours } from '../shared/hours';

export interface TimeSpentData {
    projectData: { name: string; value: number }[];
    appData: { name: string; value: number }[];
    /**
     * The two panels' real totals, taken BEFORE the per-entry `toFixed(2)`
     * rounding and the `value > 0` filter that `getNameValuePairs` applies.
     *
     * The rounded entries are right for the blocks, but summing them makes the
     * panel titles disagree: a day of 27 × 25 minutes is exactly 11.25 h, yet
     * the entries can add up to 11.249999999999995, and `toFixed(1)` then
     * prints 11.2 next to the calendar's 11.3. They can also lose a few
     * minutes when short-lived apps round to 0 and are dropped. The titles and
     * the percentage denominators use these values instead; the blocks keep
     * the rounded ones.
     */
    projectTotal?: number;
    appTotal?: number;
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

/** Raw sum of a counter, before any per-entry rounding or filtering. */
const counterTotal = (counter: Counter): number => {
    let sum = 0;
    for (const key in counter.dict) {
        sum += counter.dict[key];
    }
    return sum;
};

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

    const projectData = projectTimeCounter
        .getNameValuePairs({ toFixed: 2 })
        .sort((a, b) => b.value - a.value);
    for (const v of projectData) {
        if (v.name === UNK) {
            v.name = 'Unknown';
            continue;
        }

        v.name = boardNames[v.name] ?? 'Unknown';
    }

    const appData = appTimeCounter
        .getNameValuePairs({ toFixed: 2 })
        .sort((a, b) => b.value - a.value)
        .map((v) => ({ ...v, name: getBetterAppName(v.name) }));

    return {
        projectData,
        appData,
        // `roundHours` (1e-6 h) absorbs the float drift from summing
        // 1500/3600-shaped values, so the pair of titles agrees with the
        // calendar instead of straddling the .25 boundary.
        projectTotal: roundHours(counterTotal(projectTimeCounter)),
        appTotal: roundHours(counterTotal(appTimeCounter)),
    };
}

export function getTokenWeights(records: PomodoroRecord[]): [string, number][] {
    return getWeightsFromPomodoros(records, []);
}

/**
 * Everything the History view needs, computed from already-queried records.
 * Runs inside the db worker so raw records never cross to the main thread.
 *
 * `yearRecords` covers the whole chosen year and always feeds the calendar: the
 * heat map stays on its full-year window regardless of the month filter, so the
 * user can still see (and compare) the whole year while only one month is
 * highlighted.
 *
 * `periodRange`, when given, slices those same records down to the chosen month
 * and feeds the badge / treemap / word cloud. The caller may also pass those
 * records directly (`periodRecords`): the SQL repository queries the month with
 * `apps` separately, so the full-year scan can stay scalar-only for the
 * calendar/total. Without `periodRecords`, the range is applied here.
 */
export function aggHistory(
    recentRecords: PomodoroRecord[],
    yearRecords: PomodoroRecord[],
    boardNames: { [boardId: string]: string },
    periodRange?: { from: number; to: number },
    periodRecords?: PomodoroRecord[]
) {
    const period = periodRecords
        ? periodRecords
        : periodRange
          ? yearRecords.filter(
                (v) => v.startTime >= periodRange.from && v.startTime < periodRange.to
            )
          : yearRecords;
    return {
        agg: {
            day: getPomodoroAgg(0, recentRecords),
            week: getPomodoroAgg(new Date().getDay(), recentRecords),
            month: getPomodoroAgg(new Date().getDate() - 1, recentRecords),
        },
        total: {
            count: period.length,
            usedTime: period.reduce((a, b) => a + b.spentTimeInHour, 0),
        },
        wordWeights: getTokenWeights(period),
        timeSpent: getTimeSpentDataFromRecordsSync(period, boardNames),
        calendarCount: getPomodoroCalendarData(yearRecords),
    };
}
