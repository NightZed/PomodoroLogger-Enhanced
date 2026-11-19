import * as React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ErrorNoticeActions from './ErrorNoticeActions';
import { ISSUES_URL } from '../../shared/links';

const writeText = jest.fn();
const openExternal = jest.fn();
const openLogDir = jest.fn();
const logInfo = jest.fn();

const source = { message: 'boom' };

beforeEach(() => {
    writeText.mockReset().mockResolvedValue(undefined);
    openExternal.mockReset();
    openLogDir.mockReset();
    logInfo.mockReset().mockResolvedValue({ dir: 'C:\\logs', sessionId: 'session-7' });
    Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
    });
    (window as any).api = { logInfo, openExternal, openLogDir };
});

afterEach(() => {
    delete (navigator as any).clipboard;
});

describe('ErrorNoticeActions', () => {
    it('uses the crash screen wording for all three actions', () => {
        render(<ErrorNoticeActions source={source} />);

        // The labels live in the tooltip / accessible name instead of the
        // button text, so the narrow notice does not have to wrap.
        expect(screen.getByRole('button', { name: 'Copy Details' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Report Issue' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Open Log Folder' })).toBeTruthy();
    });

    it('copies the diagnostics block the log refers to', async () => {
        render(<ErrorNoticeActions source={source} />);

        fireEvent.click(screen.getByRole('button', { name: 'Copy Details' }));

        await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
        const text = writeText.mock.calls[0][0] as string;
        expect(text).toContain('Error: boom');
        expect(text).toContain('Log folder: C:\\logs');
        expect(text).toContain('Session: session-7');
    });

    it('turns the copy button into a confirmation', async () => {
        render(<ErrorNoticeActions source={source} />);

        fireEvent.click(screen.getByRole('button', { name: 'Copy Details' }));

        await waitFor(() => expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy());
    });

    it('puts the details on the clipboard before opening the tracker', async () => {
        const order: string[] = [];
        writeText.mockImplementation(async () => {
            order.push('clipboard');
        });
        openExternal.mockImplementation((url: string) => {
            order.push(`open:${url}`);
        });

        render(<ErrorNoticeActions source={source} />);
        fireEvent.click(screen.getByRole('button', { name: 'Report Issue' }));

        await waitFor(() => expect(openExternal).toHaveBeenCalledTimes(1));
        // Regression: opening the browser first moves focus away from the
        // window, and the clipboard write can then be rejected -- the issue
        // would arrive without the log details it was meant to carry.
        expect(order).toEqual(['clipboard', `open:${ISSUES_URL}`]);
    });

    it('does not claim a copy happened when the clipboard rejects', async () => {
        writeText.mockRejectedValue(new Error('denied'));
        render(<ErrorNoticeActions source={source} />);

        fireEvent.click(screen.getByRole('button', { name: 'Copy Details' }));

        await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
        expect(screen.getByRole('button', { name: 'Copy Details' })).toBeTruthy();
    });

    it('opens the log folder', () => {
        render(<ErrorNoticeActions source={source} />);

        fireEvent.click(screen.getByRole('button', { name: 'Open Log Folder' }));

        expect(openLogDir).toHaveBeenCalledTimes(1);
    });
});
