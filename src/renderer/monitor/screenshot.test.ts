import { getScreen } from './screenshot';

const stream = {
    getTracks: () => [{ stop: jest.fn() }],
} as unknown as MediaStream;

const mediaDevices = {
    getUserMedia: jest.fn(),
};

function setApi(values: Record<string, any>) {
    (window as any).api = { ...(window as any).api, ...values };
}

describe('monitor/screenshot', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        mediaDevices.getUserMedia.mockReset();
        setApi({
            platform: 'linux',
            saveScreenshot: jest.fn().mockResolvedValue('saved.jpg'),
        });
        Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: mediaDevices,
        });
        jest.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
        jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
        jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
            drawImage: jest.fn(),
        } as any);
        jest.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
            'data:image/jpeg;base64,AA=='
        );
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
        document.body.innerHTML = '';
    });

    it('captures a frame and hands the data URL to the main process', async () => {
        mediaDevices.getUserMedia.mockResolvedValue(stream);

        const request = getScreen(1000);
        await Promise.resolve();
        await Promise.resolve();

        const video = document.querySelector('video') as HTMLVideoElement;
        expect(video).not.toBeNull();
        Object.defineProperty(video, 'videoWidth', { configurable: true, value: 100 });
        Object.defineProperty(video, 'videoHeight', { configurable: true, value: 50 });
        video.onloadedmetadata?.(new Event('loadedmetadata'));

        await expect(request).resolves.toBe('saved.jpg');
        expect((window as any).api.saveScreenshot).toHaveBeenCalledWith(
            'data:image/jpeg;base64,AA=='
        );
    });

    it('rejects when the stream never produces a frame before the timeout', async () => {
        const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
        mediaDevices.getUserMedia.mockReturnValue(new Promise(() => {}));

        const request = getScreen(10);
        jest.advanceTimersByTime(11);

        await expect(request).rejects.toBeUndefined();
        expect(consoleLog).toHaveBeenCalledWith('timeout... reject screen shot');
    });

    it('rejects when Windows has no desktop capture source', async () => {
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
        setApi({ platform: 'win32', desktopSource: jest.fn().mockResolvedValue(undefined) });

        const request = getScreen(1000);

        await expect(request).rejects.toThrow(
            'Cannot find a desktop capture source for the current screen'
        );
        expect(consoleError).toHaveBeenCalled();
    });
});
