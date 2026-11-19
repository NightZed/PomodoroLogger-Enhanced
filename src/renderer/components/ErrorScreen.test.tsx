import * as React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ErrorScreen from './ErrorScreen';
import { ISSUES_URL } from '../../shared/links';

const writeText = jest.fn();
const openExternal = jest.fn();
const openLogDir = jest.fn();
const logInfo = jest.fn();

beforeEach(() => {
    writeText.mockReset().mockResolvedValue(undefined);
    openExternal.mockReset();
    openLogDir.mockReset();
    logInfo.mockReset().mockResolvedValue({ dir: 'C:\\logs', sessionId: 'session-7' });
    Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
    });
    (window as any).api = {
        logInfo,
        openExternal,
        openLogDir,
        restart: jest.fn(),
        quit: jest.fn(),
        windowAction: jest.fn(),
    };
});

afterEach(() => {
    delete (navigator as any).clipboard;
});

const renderScreen = async () => {
    render(<ErrorScreen error={new Error('kaboom')} />);
    // The log location arrives from the main process; waiting for it keeps the
    // effect's state update inside an act() scope.
    await screen.findByText(/Logs: C:\\logs/);
};

describe('ErrorScreen', () => {
    it('reports the issue with the details already on the clipboard', async () => {
        await renderScreen();

        fireEvent.click(screen.getByRole('button', { name: 'Report Issue' }));

        await waitFor(() => expect(openExternal).toHaveBeenCalledWith(ISSUES_URL));
        expect(writeText).toHaveBeenCalledTimes(1);
        expect(writeText.mock.calls[0][0]).toContain('Error: kaboom');
        expect(writeText.mock.calls[0][0]).toContain('Log folder: C:\\logs');
    });

    it('shows the copy result on the copy button', async () => {
        await renderScreen();

        fireEvent.click(screen.getByRole('button', { name: 'Copy Details' }));

        await waitFor(() => expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy());
        expect(writeText.mock.calls[0][0]).toContain('Session: session-7');
    });

    it('opens the log folder', async () => {
        await renderScreen();

        fireEvent.click(screen.getByRole('button', { name: 'Open Log Folder' }));

        expect(openLogDir).toHaveBeenCalledTimes(1);
    });
});
