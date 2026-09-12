import { Counter } from '../../../utils/Counter';
import { PomodoroRecord } from '../../monitor/type';
import { getBetterAppName } from '../../utils';
import { getNameFromBoardId } from '../../getNameFromBoardId';
import { workers } from '../../workers';
import { Card } from '../Kanban/type';

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
 * 聚合番茄钟数据。
 * `pomodoros` 用于“今日/本周/本月”统计（只需近期记录，避免全量加载）；
 * `yearRecords` 用于日历/饼图/词云（按选定年份查询，默认与 pomodoros 相同，
 * 保持向后兼容，例如测试场景）；
 * `totalCount` 为全量记录数（由轻量的 count 查询得到，默认取 pomodoros 长度）。
 */
export async function getAggPomodoroInfo(
    pomodoros: PomodoroRecord[],
    cards: Card[],
    yearRecords: PomodoroRecord[] = pomodoros,
    totalCount?: number
): Promise<AggPomodoroInfo> {
    return {
        agg: {
            day: getPomodoroAgg(0, pomodoros),
            week: getPomodoroAgg(new Date().getDay(), pomodoros),
            month: getPomodoroAgg(new Date().getDate() - 1, pomodoros),
        },
        total: {
            count: totalCount ?? pomodoros.length,
            usedTime: cards.reduce((a, b) => a + b.spentTimeInHour.actual, 0),
        },
        wordWeights: await workers.tokenizer.tokenize(yearRecords, cards),
        pieChart: await getTimeSpentDataFromRecords(yearRecords),
        calendarCount: getPomodoroCalendarData(yearRecords),
    };
}
