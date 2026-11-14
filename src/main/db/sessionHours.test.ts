import { DBs, loadDBs, runInTransaction } from './index';
import { recalibrateSessionHours, scanSessionHours } from './sessionHours';
import type { PomodoroRecord } from '../../renderer/monitor/type';

const sessionRepo = () =>
    DBs.sessionDB as unknown as {
        insert: (doc: any) => Promise<unknown>;
        find: (query?: any) => Promise<any[]>;
        clearSync: () => void;
    };

const createSession = (
    id: string,
    startTime: number,
    spentTimeInHour: number,
    apps: { [name: string]: number },
    stayTimeInSecond?: number[]
): PomodoroRecord => ({
    _id: id,
    startTime,
    spentTimeInHour,
    switchTimes: 0,
    apps: Object.fromEntries(
        Object.entries(apps).map(([appName, hours]) => [
            appName,
            { appName, spentTimeInHour: hours, titleSpentTime: {} },
        ])
    ),
    ...(stayTimeInSecond === undefined ? {} : { stayTimeInSecond }),
});

const clearAll = () => {
    runInTransaction(() => {
        sessionRepo().clearSync();
    });
};

const read = async (id: string): Promise<PomodoroRecord> => {
    const rows = await sessionRepo().find({ _id: id });
    return rows[0] as PomodoroRecord;
};

const sumApps = (record: PomodoroRecord): number =>
    Object.values(record.apps).reduce((total, app) => total + app.spentTimeInHour, 0);

describe('session hours calibration', () => {
    beforeEach(async () => {
        await loadDBs(['sessionDB']);
        clearAll();
    });

    it('splits sessions into over / under / missing', async () => {
        await sessionRepo().insert([
            // 1h total, 1.1h of apps -> 6 minutes too much.
            createSession('s1', 1000, 1, { A: 1.1 }, [3600]),
            // 1h total, 2h of apps -> an hour too much; must sort first.
            createSession('s2', 2000, 1, { A: 1.4, B: 0.6 }, [3600]),
            // 1h total, 0.9h of apps -> 6 minutes short.
            createSession('s3', 3000, 1, { A: 0.9 }, [3600]),
            // No breakdown at all.
            createSession('s4', 4000, 1, {}),
            // Zero-length: nothing to scale, not reported.
            createSession('s5', 5000, 0, { A: 0.1 }),
        ]);

        const report = await scanSessionHours();

        expect(report.over.total).toBe(2);
        expect(report.over.preview.map((entry) => entry.sessionId)).toStrictEqual(['s2', 's1']);
        expect(report.over.totalDeltaSeconds).toBeCloseTo(3600 + 360, 6);
        expect(report.over.preview[0].deltaSeconds).toBeCloseTo(3600, 6);

        expect(report.under.total).toBe(1);
        expect(report.under.preview[0].sessionId).toBe('s3');
        expect(report.under.preview[0].deltaSeconds).toBeCloseTo(-360, 6);

        expect(report.missing.total).toBe(1);
        expect(report.missing.preview[0].sessionId).toBe('s4');
        // The whole session is what cannot be attributed.
        expect(report.missing.totalDeltaSeconds).toBeCloseTo(3600, 6);
    });

    it('previews at most ten entries, largest difference first', async () => {
        const rows = [];
        for (let i = 0; i < 15; i += 1) {
            // `i + 1` seconds of extra app time per session (the smallest is
            // still a measurable difference).
            rows.push(createSession(`s${i}`, 1000 + i, 1, { A: 1 + (i + 1) / 3600 }));
        }
        await sessionRepo().insert(rows);

        const report = await scanSessionHours();

        expect(report.over.total).toBe(15);
        expect(report.over.preview).toHaveLength(10);
        expect(report.over.preview[0].sessionId).toBe('s14');
        expect(report.over.preview[9].sessionId).toBe('s5');
    });

    it('sorts the missing group by start time, newest first', async () => {
        await sessionRepo().insert([
            createSession('old', 1000, 1, {}),
            createSession('new', 3000, 1, {}),
            createSession('mid', 2000, 1, {}),
        ]);

        const report = await scanSessionHours();

        expect(report.missing.preview.map((entry) => entry.sessionId)).toStrictEqual([
            'new',
            'mid',
            'old',
        ]);
    });

    it('rewrites only the selected group and makes the breakdown add up', async () => {
        await sessionRepo().insert([
            createSession('over', 1000, 1, { A: 0.8, B: 0.4 }, [1200, 2400]),
            createSession('under', 2000, 1, { A: 0.5 }),
            createSession('missing', 3000, 1, {}),
        ]);

        const result = await recalibrateSessionHours({ over: true, under: false });
        expect(result.repaired).toBe(1);

        const fixed = await read('over');
        expect(sumApps(fixed)).toBeCloseTo(fixed.spentTimeInHour, 6);
        // Proportions survive: A had 2/3 of the breakdown, it keeps it.
        expect(fixed.apps.A.spentTimeInHour).toBeCloseTo(1 / 1.5, 6);
        // The activity timeline is rescaled onto the same total.
        const stay = fixed.stayTimeInSecond!.reduce((total, value) => total + value, 0);
        expect(stay).toBeCloseTo(3600, 3);

        const untouched = await read('under');
        expect(untouched.apps.A.spentTimeInHour).toBe(0.5);

        const missing = await read('missing');
        expect(missing.apps).toStrictEqual({});

        const after = await scanSessionHours();
        expect(after.over.total).toBe(0);
        expect(after.under.total).toBe(1);
        expect(after.missing.total).toBe(1);
    });

    it('leaves sessions without a breakdown alone even when selected', async () => {
        await sessionRepo().insert([
            createSession('missing', 1000, 1, {}),
            createSession('zero-apps', 2000, 1, { A: 0 }),
        ]);

        const result = await recalibrateSessionHours({ over: true, under: true });
        expect(result.repaired).toBe(0);

        const after = await scanSessionHours();
        // Both are still "no measurable breakdown": an empty object and an
        // object whose only app holds zero.
        expect(after.missing.total).toBe(2);
    });

    it('does nothing on an empty database', async () => {
        await expect(recalibrateSessionHours({ over: true, under: true })).resolves.toStrictEqual({
            repaired: 0,
            skipped: 0,
        });
        const report = await scanSessionHours();
        expect(report.over.total + report.under.total + report.missing.total).toBe(0);
    });
});
