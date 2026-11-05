import * as React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import AppErrorBoundary from './AppErrorBoundary';
import { t } from '../i18n';

const reportError = jest.fn();
const restart = jest.fn();
const quit = jest.fn();
const openLogDir = jest.fn(() => Promise.resolve());
const logInfo = jest.fn(() => Promise.resolve({ dir: '/tmp/logs', sessionId: 'abc123' }));

function Boom(): React.ReactElement {
    throw new Error('kaboom');
}

function mount() {
    return render(
        <AppErrorBoundary>
            <Boom />
        </AppErrorBoundary>
    );
}

describe('AppErrorBoundary', () => {
    let consoleError: jest.SpyInstance;
    let originalApi: unknown;

    beforeEach(() => {
        // React prints every caught error; the boundary is the subject here.
        consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
        jest.useFakeTimers();
        originalApi = (window as any).api;
        (window as any).api = { reportError, restart, quit, openLogDir, logInfo };
    });

    afterEach(() => {
        cleanup();
        jest.useRealTimers();
        consoleError.mockRestore();
        (window as any).api = originalApi;
        jest.clearAllMocks();
    });

    it('replaces the app with the error page and reports the crash once', () => {
        const { container } = mount();

        expect(container.textContent).toContain(t('crash.title'));
        expect(reportError).toHaveBeenCalledTimes(1);
        expect(reportError.mock.calls[0][0]).toMatchObject({
            kind: 'react',
            message: 'kaboom',
        });
        expect(reportError.mock.calls[0][0].stack).toContain('kaboom');
    });

    it('never restarts the app by itself', () => {
        mount();

        act(() => {
            jest.advanceTimersByTime(10_000);
        });

        expect(restart).not.toHaveBeenCalled();
    });

    it('restarts or quits only when the user asks for it', () => {
        const { getByText } = mount();

        fireEvent.click(getByText(t('crash.restart')));
        expect(restart).toHaveBeenCalledTimes(1);

        fireEvent.click(getByText(t('crash.quit')));
        expect(quit).toHaveBeenCalledTimes(1);
    });

    it('opens the log folder from the error page', () => {
        const { getByText } = mount();

        fireEvent.click(getByText(t('crash.logFolder')));

        expect(openLogDir).toHaveBeenCalledTimes(1);
    });

    it('still renders when the preload bridge is unavailable', () => {
        (window as any).api = undefined;

        const { container } = mount();

        expect(container.textContent).toContain(t('crash.title'));
    });
});
