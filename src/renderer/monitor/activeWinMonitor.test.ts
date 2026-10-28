import { Monitor } from './activeWinMonitor';
import { getScreen } from './screenshot';

jest.mock('./screenshot', () => ({ getScreen: jest.fn() }));

const mockedGetScreen = getScreen as jest.MockedFunction<typeof getScreen>;

const activeWindow = {
    title: 'Editor',
    id: 1,
    bounds: { x: 0, y: 0, width: 100, height: 100 },
    memoryUsage: 0,
    owner: { name: 'editor.exe', path: '/editor.exe', processId: 1 },
} as any;

function setActiveWin(value: any) {
    (window as any).api = {
        ...(window as any).api,
        activeWin: jest.fn().mockResolvedValue(value),
    };
}

async function flush() {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
}

describe('monitor/activeWinMonitor', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        mockedGetScreen.mockReset();
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it('polls the active window and forwards it to the listener', async () => {
        setActiveWin(activeWindow);
        const listener = jest.fn();
        const monitor = new Monitor(listener, 1000);

        monitor.start();
        await flush();

        expect(listener).toHaveBeenCalledWith(activeWindow);
        expect(monitor.isRunning).toBe(true);

        monitor.stop();
        expect(monitor.isRunning).toBe(false);
    });

    it('does not start a second polling timer when start is called twice', async () => {
        setActiveWin(activeWindow);
        const activeWin = (window as any).api.activeWin;
        const monitor = new Monitor(jest.fn(), 1000);

        monitor.start();
        monitor.start();
        jest.advanceTimersByTime(1000);
        await flush();

        // One immediate watch + one interval tick, not two of each.
        expect(activeWin).toHaveBeenCalledTimes(2);
    });

    it('takes a screenshot only after the screenshot interval elapsed', async () => {
        setActiveWin(activeWindow);
        mockedGetScreen.mockResolvedValue('screenshot');
        const listener = jest.fn();
        const monitor = new Monitor(listener, 1000, 500);

        monitor.start();
        await flush();
        expect(listener).toHaveBeenLastCalledWith(activeWindow);

        jest.advanceTimersByTime(500);
        await (monitor as any).watch();

        expect(mockedGetScreen).toHaveBeenCalledWith(500);
        expect(listener).toHaveBeenLastCalledWith(activeWindow, 'screenshot');
    });

    it('keeps polling when the screenshot fails', async () => {
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
        setActiveWin(activeWindow);
        mockedGetScreen.mockRejectedValue(new Error('no capture source'));
        const listener = jest.fn();
        const monitor = new Monitor(listener, 1000, 500);

        monitor.start();
        jest.advanceTimersByTime(500);
        await (monitor as any).watch();

        expect(consoleError).toHaveBeenCalled();
        expect(monitor.isRunning).toBe(true);
    });

    it('ignores ticks where no active window is available', async () => {
        setActiveWin(undefined);
        const listener = jest.fn();
        const monitor = new Monitor(listener, 1000);

        monitor.start();
        await flush();

        expect(listener).not.toHaveBeenCalled();
    });
});
