import { nextMacroTask, waitUntil } from './wait';

describe('Timer waitUntil', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('returns immediately when the condition already holds', async () => {
        let calls = 0;

        await waitUntil(() => {
            calls += 1;
            return true;
        });

        expect(calls).toBe(1);
    });

    it('keeps polling until the condition holds', async () => {
        let calls = 0;

        await waitUntil(() => {
            calls += 1;
            return calls >= 5;
        });

        expect(calls).toBe(5);
    });

    // Regression: the wait used to ride on `requestAnimationFrame`, which
    // stops entirely while the window is fully occluded by other windows or
    // minimized to the tray -- a tray "Start Focusing" hung on the first
    // await and never started the timer, moving again only once part of the
    // window became visible. Keeping animation frames from arriving simulates
    // that occluded window; should the wait ever ride on frames again, this
    // test hangs into jest's per-test timeout.
    it('completes while animation frames never arrive', async () => {
        jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);

        let calls = 0;
        await waitUntil(() => {
            calls += 1;
            return calls >= 2;
        });

        expect(calls).toBe(2);
    });

    it('throws once the timeout elapsed even though the condition never holds', async () => {
        // The old frame-driven loop could never reach this either: its timeout
        // check only ran between animation frames, which never arrive while
        // the window is occluded -- the wait simply hung instead of failing.
        const now = jest.spyOn(Date, 'now');
        let time = 0;
        now.mockImplementation(() => time);

        await expect(
            waitUntil(() => {
                time += 60;
                return false;
            }, 100)
        ).rejects.toThrow('Timeout');
    });
});

describe('Timer nextMacroTask', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    // Regression: the start-after-confirm delay used to be a 30ms
    // `setTimeout`, which once the page has been hidden for five minutes is
    // pushed to Chromium's next per-minute wakeup -- the tray's "Start
    // Focusing" sat waiting up to a minute before the session began. Same
    // guard as the waitUntil regression above: if this ever rides on
    // animation frames again, it hangs into jest's per-test timeout.
    it('resolves while animation frames never arrive', async () => {
        jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);

        await expect(nextMacroTask()).resolves.toBeUndefined();
    });
});
