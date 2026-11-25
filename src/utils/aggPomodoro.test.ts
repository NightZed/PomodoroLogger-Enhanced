import {
    aggHistory,
    getDateFromTimestamp,
    getPomodoroCalendarData,
    getTimeOfDayHistogram,
    getTimeSpentDataFromRecordsSync,
} from './aggPomodoro';

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

    it('reports totals before per-entry rounding', () => {
        // 27 × 25 minutes is exactly 11.25 h, but the float sum of
        // 1500/3600 lands on 11.249999999999998. `projectTotal` / `appTotal`
        // are normalized so the panels and the calendar print the same value.
        const records = Array.from({ length: 27 }, () =>
            createRecord('b1', 1500 / 3600, [['code', 1500 / 3600]])
        );

        const timeSpent = getTimeSpentDataFromRecordsSync(records, { b1: 'Work' });

        expect(timeSpent.projectTotal).toBe(11.25);
        expect(timeSpent.appTotal).toBe(11.25);
        // Every record lands in exactly one project bucket, so both panels
        // describe the same record set and the subtitles share this count.
        expect(timeSpent.pomodoroCount).toBe(27);
    });

    it('resolves project names through boardNames', async () => {
        const records = [
            createRecord('b1', 10, [['chrome', 10]]),
            createRecord('b2', 5, [['code', 5]]),
        ];
        const timeSpent = getTimeSpentDataFromRecordsSync(records, { b1: 'Work', b2: 'Side' });
        expect(timeSpent.projectData).toEqual([
            { name: 'Work', value: 10 },
            { name: 'Side', value: 5 },
        ]);
        expect(timeSpent.appData[0].name).toBe('Chrome');
    });

    it('marks unknown boards', () => {
        const timeSpent = getTimeSpentDataFromRecordsSync(
            [createRecord('zz', 3, [['app', 3]])],
            {}
        );
        expect(timeSpent.projectData).toEqual([{ name: 'Unknown', value: 3 }]);
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
        expect(ans.timeSpent.projectData).toEqual([{ name: 'Work', value: 1.5 }]);
        expect(ans.wordWeights).toEqual([]);
        expect(Object.keys(ans.calendarCount).length).toBe(1);
    });

    it("does not let tomorrow's session into today's number", () => {
        const todayStart = getDateFromTimestamp(Date.now()).getTime();
        const tomorrow = {
            startTime: todayStart + 24 * 3600 * 1000 + 3600_000,
            spentTimeInHour: 1,
            apps: {},
            boardId: 'b1',
        } as any;

        // All-time mode passes `yearRecords` in as `recentRecords`, and those
        // keep future-dated rows; the Today/Week/Month counters must still stop
        // at midnight.
        const ans = aggHistory([tomorrow], [tomorrow], { b1: 'Work' });

        expect(ans.agg).toEqual({
            day: { count: 0, hours: 0 },
            week: { count: 0, hours: 0 },
            month: { count: 0, hours: 0 },
        });
        // "All time" still includes the row itself.
        expect(ans.total).toEqual({ count: 1, usedTime: 1 });
    });

    it('narrows the badge and charts to the month while the calendar keeps the year', () => {
        const rec = (startTime: number) =>
            ({ startTime, spentTimeInHour: 1, apps: {}, boardId: 'b1' }) as any;
        const yearRecords = [
            rec(new Date(2020, 2, 15, 10).getTime()),
            rec(new Date(2020, 5, 15, 10).getTime()),
        ];
        const ans = aggHistory(
            [],
            yearRecords,
            { b1: 'Work' },
            {
                from: new Date(2020, 2, 1).getTime(),
                to: new Date(2020, 3, 1).getTime(),
            }
        );

        // Badge / treemap describe March only...
        expect(ans.total).toEqual({ count: 1, usedTime: 1 });
        expect(ans.timeSpent.projectData).toEqual([{ name: 'Work', value: 1 }]);
        // ...while the heat map still has both days.
        expect(Object.keys(ans.calendarCount).length).toBe(2);
    });

    it('keeps the whole year when no period range is given (All time)', () => {
        const rec = (startTime: number) =>
            ({ startTime, spentTimeInHour: 1, apps: {}, boardId: 'b1' }) as any;
        const yearRecords = [
            rec(new Date(2020, 2, 15, 10).getTime()),
            rec(new Date(2020, 5, 15, 10).getTime()),
        ];
        const ans = aggHistory([], yearRecords, { b1: 'Work' }, undefined);
        expect(ans.total).toEqual({ count: 2, usedTime: 2 });
        expect(Object.keys(ans.calendarCount).length).toBe(2);
    });
});

describe('getTimeOfDayHistogram', () => {
    const at = (hour: number, minute = 0) => new Date(2020, 5, 15, hour, minute).getTime();
    const record = (startTime: number, spentTimeInHour: number) =>
        ({ startTime, spentTimeInHour }) as any;
    /** Buckets are 30 minutes, so index 21 starts at 10:30. */
    const bucket = (hours: number[], index: number) => Number(hours[index].toFixed(6));

    it('splits a session across the buckets it covers', () => {
        // 10:50–11:15 is 10 minutes in the 10:30 bucket and 15 in the 11:00 one.
        const hours = getTimeOfDayHistogram([record(at(10, 50), 25 / 60)]);

        expect([bucket(hours, 21), bucket(hours, 22)]).toEqual([0.166667, 0.25]);
    });

    it('accounts for every hour spent, once', () => {
        const hours = getTimeOfDayHistogram([record(at(9), 2), record(at(14, 30), 1.5)]);

        expect(Number(hours.reduce((sum, value) => sum + value, 0).toFixed(6))).toBe(3.5);
    });

    it('feeds the early buckets when a session runs past midnight', () => {
        // 23:50 + 30 minutes: 10 minutes before midnight, 20 after.
        const hours = getTimeOfDayHistogram([record(at(23, 50), 0.5)]);

        expect([bucket(hours, 47), bucket(hours, 0)]).toEqual([0.166667, 0.333333]);
    });
});
