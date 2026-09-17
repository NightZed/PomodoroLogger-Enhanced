import {
    aggHistory,
    getDateFromTimestamp,
    getPomodoroCalendarData,
    getTimeSpentDataFromRecordsSync,
} from './aggPomodoro';
import { PomodoroRecord } from '../renderer/monitor/type';

function createRecord(boardId: string, spentTime: number, apps: [string, number][]): any {
    const appNameDict: any = {};
    for (const [name, time] of apps) {
        appNameDict[generateRandomName()] = {
            appName: name,
            spentTimeInHour: time,
        };
    }

    return {
        boardId,
        _id: generateRandomName(),
        startTime: 1575195080415,
        spentTimeInHour: spentTime,
        apps: appNameDict,
    };
}

function generateRandomName() {
    return Math.random().toString(36).slice(2);
}

describe('aggPomodoro shared core', () => {
    it('buckets timestamps to local midnight', () => {
        const noon = new Date(2020, 5, 15, 12, 30).getTime();
        const dayBefore = new Date(2020, 5, 14, 23, 59).getTime();
        expect(getDateFromTimestamp(noon).getTime()).toBe(new Date(2020, 5, 15).getTime());
        expect(getDateFromTimestamp(dayBefore).getTime()).toBe(new Date(2020, 5, 14).getTime());
        expect(getPomodoroCalendarData([{ startTime: noon, spentTimeInHour: 2 } as any])).toEqual({
            [new Date(2020, 5, 15).getTime()]: { count: 1, hours: 2 },
        });
    });

    it('resolves project names through boardNames', async () => {
        const records = [
            createRecord('b1', 10, [['chrome', 10]]),
            createRecord('b2', 5, [['code', 5]]),
        ];
        const pie = getTimeSpentDataFromRecordsSync(records, { b1: 'Work', b2: 'Side' });
        expect(pie.projectData).toEqual([
            { name: 'Work', value: 10 },
            { name: 'Side', value: 5 },
        ]);
        expect(pie.appData[0].name).toBe('Chrome');
    });

    it('marks unknown boards', () => {
        const pie = getTimeSpentDataFromRecordsSync([createRecord('zz', 3, [['app', 3]])], {});
        expect(pie.projectData).toEqual([{ name: 'Unknown', value: 3 }]);
    });

    it('aggregates everything in one call', async () => {
        const dayStart = getDateFromTimestamp(Date.now()).getTime();
        const record = {
            startTime: dayStart + 3600e3,
            spentTimeInHour: 1.5,
            apps: {},
            boardId: 'b1',
        } as any;
        const ans = aggHistory([record], [record], { b1: 'Work' });
        expect(ans.agg.day).toEqual({ count: 1, hours: 1.5 });
        expect(ans.total).toEqual({ count: 1, usedTime: 1.5 });
        expect(ans.pieChart.projectData).toEqual([{ name: 'Work', value: 1.5 }]);
        expect(ans.wordWeights).toEqual([]);
        expect(Object.keys(ans.calendarCount).length).toBe(1);
    });
});
