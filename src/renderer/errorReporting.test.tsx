/**
 * The reporter keeps per-fingerprint state (occurrence count, last write,
 * whether the notice was shown), so every test loads a fresh copy of the
 * module instead of sharing that map with its neighbours.
 */
const mockNotice = jest.fn();
const mockReportError = jest.fn();

jest.mock('./components/feedback', () => ({
    feedback: {
        notice: (...args: unknown[]) => mockNotice(...args),
    },
}));

// Only `Button` is used, and the real antd is expensive to require once per
// isolated module registry.
jest.mock('antd', () => ({
    Button: () => null,
}));

async function loadReporter(): Promise<typeof import('./errorReporting')> {
    jest.resetModules();
    return import('./errorReporting');
}

function report(
    reporter: typeof import('./errorReporting'),
    message: string,
    extra: Parameters<typeof reporter.reportRendererError>[2] = {}
) {
    reporter.reportRendererError('window-error', new Error(message), extra);
}

describe('reportRendererError', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2026-11-14T10:00:00.000Z'));
        mockNotice.mockReset();
        mockReportError.mockReset();
        (window as any).api = { reportError: mockReportError, openLogDir: jest.fn() };
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('writes the first occurrence immediately, with its count', async () => {
        const reporter = await loadReporter();

        report(reporter, 'boom', { notify: true });

        expect(mockReportError).toHaveBeenCalledTimes(1);
        expect(mockReportError.mock.calls[0][0]).toMatchObject({
            kind: 'window-error',
            message: 'boom',
            count: 1,
        });
        expect(mockNotice).toHaveBeenCalledTimes(1);
    });

    it('folds a burst into one log line and one notice', async () => {
        const reporter = await loadReporter();

        for (let i = 0; i < 25; i += 1) {
            report(reporter, 'boom', { notify: true });
            jest.advanceTimersByTime(100);
        }

        expect(mockReportError).toHaveBeenCalledTimes(1);
        expect(mockNotice).toHaveBeenCalledTimes(1);
    });

    it('writes the running count once the aggregation window elapses', async () => {
        const reporter = await loadReporter();

        for (let i = 0; i < 5; i += 1) {
            report(reporter, 'boom');
        }
        jest.advanceTimersByTime(60_000);
        report(reporter, 'boom');

        expect(mockReportError).toHaveBeenCalledTimes(2);
        expect(mockReportError.mock.calls[1][0]).toMatchObject({ count: 6 });
    });

    it('does not notify when the caller owns the window', async () => {
        const reporter = await loadReporter();

        // A React render failure replaces the window with `ErrorScreen`.
        reporter.reportRendererError('react', new Error('boom'));

        expect(mockReportError).toHaveBeenCalledTimes(1);
        expect(mockNotice).not.toHaveBeenCalled();
    });

    it('leaves the notice pending while the feedback bridge is missing', async () => {
        mockNotice.mockImplementationOnce(() => {
            throw new Error('Feedback APIs are unavailable');
        });
        const reporter = await loadReporter();

        report(reporter, 'boom', { notify: true });
        expect(mockNotice).toHaveBeenCalledTimes(1);
        expect(mockReportError).toHaveBeenCalledTimes(1);

        // The next occurrence still gets a notice: nothing was shown yet.
        jest.advanceTimersByTime(61_000);
        report(reporter, 'boom', { notify: true });
        expect(mockNotice).toHaveBeenCalledTimes(2);
        expect(mockReportError).toHaveBeenCalledTimes(2);
    });

    it('keeps different messages in separate fingerprints', async () => {
        const reporter = await loadReporter();

        report(reporter, 'first', { notify: true });
        report(reporter, 'second', { notify: true });

        expect(mockReportError).toHaveBeenCalledTimes(2);
        expect(mockNotice).toHaveBeenCalledTimes(2);
    });
});
