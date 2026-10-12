import { UsageRecorder } from './UsageRecorder';
import { generateRandomName } from '../utils';

const realDate = Date;
function mockDate(targetDate: string | number) {
    const DATE_TO_USE = new realDate(targetDate);
    // @ts-ignore
    global.Date = jest.fn(() => DATE_TO_USE);
    global.Date.UTC = realDate.UTC;
    global.Date.parse = realDate.parse;
    global.Date.now = realDate.now;
}

function createResult(appName: string, title: string = appName) {
    return {
        title,
        bounds: { height: 100, width: 100, x: 0, y: 0 },
        id: 123,
        memoryUsage: 100,
        owner: {
            name: appName,
            path: `/path/to/${appName}.exe`,
            processId: 123,
        },
    };
}

describe('monitor/UsageRecorder', () => {
    afterAll(() => {
        global.Date = realDate;
    });

    it('app spent hours are recorded correctly', async () => {
        const recorder = new UsageRecorder(() => {});
        mockDate(0);
        recorder.start();
        await recorder.listener(createResult('a'));
        mockDate(30000);
        await recorder.listener(createResult('b'));
        mockDate(60000);
        await recorder.listener(createResult('a'));
        mockDate(90000);
        await recorder.stop();
        const sessionData = recorder.sessionData;
        expect(sessionData.apps).toHaveProperty('a');
        expect(sessionData.apps).toHaveProperty('b');
        expect(sessionData.apps.b.spentTimeInHour).toBeCloseTo(30000 / 1000 / 3600, 5);
        expect(sessionData.apps.a.spentTimeInHour).toBeCloseTo((30000 * 2) / 1000 / 3600, 5);
    });

    it('app spent hours are recorded correctly (complicated case 0)', async () => {
        const recorder = new UsageRecorder(() => {});
        let aSum = 0;
        mockDate(0);
        recorder.start();
        let i = 3000;
        for (; i < 3000 * 1000; i += 3000) {
            mockDate(i);
            if (Math.random() > 0.5) {
                await recorder.listener(createResult('b'));
            } else {
                await recorder.listener(createResult('a'));
                aSum += 3000;
            }
        }

        await recorder.stop();
        const sessionData = recorder.sessionData;
        expect(sessionData.apps.a.spentTimeInHour).toBeCloseTo(aSum / 1000 / 3600, 5);
    });

    it('app spent hours are recorded correctly (complicated case 1)', async () => {
        const recorder = new UsageRecorder(() => {});
        let aSum = 0;
        mockDate(0);
        recorder.start();
        const a = createResult('a');
        const b = createResult('b');
        let i = 1500;
        for (; i < 3000 * 1000; i += 3000) {
            mockDate(i);
            await recorder.listener(a);
            mockDate(i + 1500);
            await recorder.listener(b);
            aSum += 1500;
        }

        await recorder.stop();
        const sessionData = recorder.sessionData;
        expect(sessionData.apps.a.spentTimeInHour).toBeCloseTo(aSum / 1000 / 3600, 5);
        expect(sessionData.apps.b.spentTimeInHour).toBeCloseTo(aSum / 1000 / 3600, 5);
    });

    it('app spent hours are recorded correctly (complicated case 2)', async () => {
        const recorder = new UsageRecorder(() => {});
        let aSum = 0;
        let i = 0;
        mockDate(0);
        recorder.start();
        const a = createResult('a');
        for (; i < 3000 * 1000; i += 3000) {
            await recorder.listener(a);
            mockDate(i);
            aSum += 3000;
        }

        mockDate(i);
        await recorder.stop();
        const sessionData = recorder.sessionData;
        expect(sessionData.apps.a.spentTimeInHour).toBeCloseTo(aSum / 1000 / 3600, 5);
    });

    it('should record switch stay time', async () => {
        const recorder = new UsageRecorder(() => {});
        const stayDuration = [];
        for (let i = 0; i < 1000; i += 1) {
            stayDuration.push(Math.ceil(Math.random() * 5000 + 100));
        }

        let targetDate = 0;
        recorder.start();
        mockDate(targetDate);
        await recorder.listener(createResult(generateRandomName()));
        for (let i = 0; i < 1000; i += 1) {
            targetDate += stayDuration[i] * 1000;
            mockDate(targetDate);

            const result = createResult(generateRandomName());
            await recorder.listener(result);
        }

        await recorder.stop();
        const sess = recorder.sessionData;
        for (let i = 0; i < 1000; i += 1) {
            expect(sess.stayTimeInSecond![i]).toBeCloseTo(stayDuration[i]);
        }
    });

    it('should record switch activity correctly', async () => {
        const recorder = new UsageRecorder(() => {});
        const a = () => createResult('a');
        const b = () => createResult('b');
        const c = () => createResult('c');

        mockDate(0);
        recorder.start();
        mockDate(10000);
        await recorder.listener(a());
        mockDate(20000);
        await recorder.listener(a());
        mockDate(30000);
        await recorder.listener(b());
        mockDate(40000);
        await recorder.listener(a());
        mockDate(50000);
        await recorder.listener(c());
        mockDate(60000);
        await recorder.listener(c());
        mockDate(70000);
        await recorder.listener(c(), 'sss.jpg');
        mockDate(80000);
        await recorder.listener(c());
        mockDate(90000);
        await recorder.listener(createResult('b', 'hello'));
        mockDate(100000);
        await recorder.listener(a(), '111.jpg');
        mockDate(110000);
        recorder.stop();
        expect(recorder.sessionData.switchActivities).toStrictEqual([0, 1, 0, 2, 3, 0]);
        expect(recorder.sessionData.stayTimeInSecond).toStrictEqual([20, 10, 10, 40, 10, 10]);
        expect(recorder.sessionData.screenshots).toStrictEqual([
            { time: 70000, path: 'sss.jpg' },
            { time: 100000, path: '111.jpg' },
        ]);
    });

    it('should clear', async () => {
        const recorder = new UsageRecorder(() => {});
        const a = () => createResult('a');

        mockDate(0);
        recorder.start();
        mockDate(100000);
        await recorder.listener(a(), '111.jpg');
        mockDate(110000);
        recorder.stop();
        const id = recorder.sessionData._id;
        recorder.clear();
        expect(id).not.toEqual(recorder.sessionData._id);
        expect(recorder.sessionData.switchActivities!.length).toBe(0);
        expect(recorder.sessionData.stayTimeInSecond!.length).toBe(0);
        expect(recorder.sessionData.efficiency).toBeUndefined();
    });

    it('excludes the paused gap from app time', async () => {
        const recorder = new UsageRecorder(() => {});
        const a = () => createResult('a');

        mockDate(0);
        recorder.start();
        mockDate(10000);
        await recorder.listener(a());
        // Pause: `Timer.onPause` calls stop(), which commits the time up to
        // this moment.
        mockDate(20000);
        recorder.stop();
        // A long pause... the recorder is not collecting meanwhile.
        mockDate(200000);
        recorder.resume();
        mockDate(210000);
        await recorder.listener(a());
        mockDate(220000);
        recorder.stop();

        // 20s + 20s of observed time, NOT the 200s wall span: the pause gap
        // (20s -> 200s) must not be credited to any app. (spentTimeInHour is
        // hours: 40s == 40 / 3600.)
        const spent = recorder.sessionData.apps.a.spentTimeInHour;
        expect(spent).toBeCloseTo(40 / 3600, 8);
    });

    it('does not count pausing or ending as an app switch', async () => {
        const recorder = new UsageRecorder(() => {});
        const a = () => createResult('a');
        const b = () => createResult('b');

        mockDate(0);
        recorder.start();
        mockDate(10000);
        await recorder.listener(a());
        // Pause. The old `listener(undefined)` round-trip in stop() counted
        // one phantom switch here.
        mockDate(20000);
        recorder.stop();
        // A real switch happens DURING the pause: the first tick after the
        // resume sees a different app than the last one before the pause.
        mockDate(100000);
        recorder.resume();
        mockDate(110000);
        await recorder.listener(b());
        expect(recorder.sessionData.switchTimes).toBe(1);

        // Ending the recording adds nothing either.
        mockDate(120000);
        recorder.stop();
        expect(recorder.sessionData.switchTimes).toBe(1);
    });

    it('drops an in-flight tick that arrives after stop()', async () => {
        const recorder = new UsageRecorder(() => {});
        const a = () => createResult('a');

        mockDate(0);
        recorder.start();
        mockDate(10000);
        await recorder.listener(a());
        mockDate(20000);
        recorder.stop();

        // The interval callback was already in flight when the pause hit:
        // it must add neither time, nor a screenshot, nor a switch.
        mockDate(30000);
        await recorder.listener(createResult('b'), 'late.jpg');
        const data = recorder.sessionData;
        expect(data.apps.b).toBeUndefined();
        expect(data.screenshots ?? []).toStrictEqual([]);
        expect(data.switchTimes).toBe(0);
    });

    it('forgets the last app on clear, so the next session starts switch-free', async () => {
        const recorder = new UsageRecorder(() => {});
        const a = () => createResult('a');

        mockDate(0);
        recorder.start();
        mockDate(10000);
        await recorder.listener(a());
        mockDate(20000);
        recorder.stop();

        recorder.clear();
        recorder.start();
        mockDate(100000);
        await recorder.listener(createResult('b'));
        // The first tick of the new session must not look like a switch away
        // from the previous session's app.
        expect(recorder.sessionData.switchTimes).toBe(0);
    });
});
