import { waitUntil } from './wait';

describe('Timer waitUntil', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('returns immediately when the condition already holds', async () => {
        const raf = jest.spyOn(window, 'requestAnimationFrame');

        await waitUntil(() => true);

        expect(raf).not.toHaveBeenCalled();
    });

    it('waits for later animation frames until the condition holds', async () => {
        let calls = 0;
        jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
            callback(0);
            return 0;
        });

        await waitUntil(() => {
            calls += 1;
            return calls >= 3;
        });

        expect(calls).toBe(3);
    });

    it('throws once the timeout elapsed', async () => {
        jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
            callback(0);
            return 0;
        });
        let now = 0;
        jest.spyOn(Date, 'now').mockImplementation(() => now);
        // `waitUntil` reads the clock through `+new Date()`; keep it in sync.
        const RealDate = Date;
        jest.spyOn(global, 'Date').mockImplementation(((value?: any) => {
            if (value === undefined) {
                return new RealDate(now);
            }
            return new RealDate(value);
        }) as any);

        await expect(
            waitUntil(() => {
                now += 60;
                return false;
            }, 100)
        ).rejects.toThrow('Timeout');
    });
});
