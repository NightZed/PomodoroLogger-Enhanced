import { normalizeAppHours } from './normalizeAppHours';
import type { PomodoroRecord } from '../renderer/monitor/type';

const createRecord = (
    apps: { [name: string]: number },
    spentTimeInHour: number,
    stayTimeInSecond?: number[]
): PomodoroRecord => ({
    _id: 's1',
    apps: Object.fromEntries(
        Object.entries(apps).map(([appName, hours]) => [
            appName,
            { appName, spentTimeInHour: hours, titleSpentTime: {} },
        ])
    ),
    spentTimeInHour,
    switchTimes: 0,
    startTime: 0,
    stayTimeInSecond,
});

const sumApps = (record: PomodoroRecord): number =>
    Object.values(record.apps).reduce((total, app) => total + app.spentTimeInHour, 0);

describe('normalizeAppHours', () => {
    it('scales the breakdown onto the session total', () => {
        // 1500.8s of wall time recorded against a nominal 1500s session.
        const record = createRecord({ Code: 0.3, Chrome: 0.12 }, 1500 / 3600);

        const result = normalizeAppHours(record, record.spentTimeInHour);

        expect(result.changed).toBe(true);
        // `roundHours` keeps six decimals, so "exact" means within its grid.
        expect(Math.abs(sumApps(record) - record.spentTimeInHour)).toBeLessThanOrEqual(1e-6);
        // Proportions survive: Code had 30/42 of the time, it keeps it (the
        // 1e-6-hour storage grid costs a few digits of that ratio).
        expect(record.apps.Code.spentTimeInHour / record.apps.Chrome.spentTimeInHour).toBeCloseTo(
            0.3 / 0.12,
            3
        );
    });

    it('writes the exact total, rounding included', () => {
        const record = createRecord({ A: 1 / 3, B: 1 / 7, C: 1 / 11 }, 0.5);

        normalizeAppHours(record, 0.5);

        expect(sumApps(record)).toBeCloseTo(0.5, 6);
    });

    it('does nothing when the breakdown already matches', () => {
        const record = createRecord({ Code: 0.25, Chrome: 0.25 }, 0.5);

        const result = normalizeAppHours(record, 0.5);

        expect(result.changed).toBe(false);
        expect(result.factor).toBeCloseTo(1, 12);
        expect(record.apps.Code.spentTimeInHour).toBe(0.25);
    });

    it('leaves a record without apps alone', () => {
        const record = createRecord({}, 0.5);

        const result = normalizeAppHours(record, 0.5);

        expect(result.changed).toBe(false);
        expect(record.spentTimeInHour).toBe(0.5);
    });

    it('leaves a zero-duration session alone', () => {
        const record = createRecord({ Code: 0.1 }, 0);

        const result = normalizeAppHours(record, 0);

        expect(result.changed).toBe(false);
        expect(record.apps.Code.spentTimeInHour).toBe(0.1);
    });

    it('rescales the stay-time segments to the same total', () => {
        const record = createRecord({ Code: 0.5 }, 0.5, [20, 10, 30]);

        normalizeAppHours(record, 0.5);

        const total = record.stayTimeInSecond!.reduce((sum, value) => sum + value, 0);
        expect(total).toBeCloseTo(0.5 * 3600, 3);
        // Segment proportions survive as well.
        expect(record.stayTimeInSecond![0]).toBeCloseTo(1800 / 3, 3);
        expect(record.stayTimeInSecond![1]).toBeCloseTo(1800 / 6, 3);
    });

    it('keeps stay-time untouched when it has no measurable sum', () => {
        const record = createRecord({ Code: 0.5 }, 0.5, [0, 0]);

        normalizeAppHours(record, 0.5);

        expect(record.stayTimeInSecond).toStrictEqual([0, 0]);
    });
});
