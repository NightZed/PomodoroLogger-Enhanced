/**
 * The Data Management part of the settings page: what the user is told after an
 * export or an import.
 *
 * Two failures are pinned down here, both of which used to be completely
 * silent:
 *
 * - a refused file (bad JSON, or a JSON file that is not a data export) threw
 *   inside the main process, the promise rejected, and nothing caught it: the
 *   user saw no message at all *and* the button stayed spinning forever,
 *   because `setImporting(false)` sat after the `await` that never came back;
 * - an import that worked but merged lossily dropped the merger's warnings on
 *   the floor (`// TODO: Show Warning`), and the main process restarted the app
 *   from inside its own handler, so the renderer never got a reply it could
 *   have reported anyway.
 *
 * The restart therefore has to be the renderer's job, which is what these tests
 * exercise end to end through the real component.
 */
import * as React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';

const mockAlert = jest.fn();
const mockToast = jest.fn();
const mockConfirm = jest.fn();

jest.mock('../feedback', () => ({
    feedback: {
        alert: (...args: any[]) => mockAlert(...args),
        toast: (...args: any[]) => mockToast(...args),
        confirm: (...args: any[]) => mockConfirm(...args),
        notice: jest.fn(),
    },
    FEEDBACK_MESSAGES: {
        setting: {
            importConfirm: 'Pomodoro Logger will restart after importing. Continue?',
            importInvalidTitle: 'This file cannot be imported',
            importInvalidIntro: 'Nothing was imported.',
            importWarningTitle: 'Imported with warnings',
            importWarningIntro: 'Some entries were adjusted:',
            importDone: 'Data imported. Restarting',
            importFailed: 'Import Failed',
            importFailedDetail: (reason: string) => `Could not import: ${reason}`,
            exportDone: (fileName: string) => `Data exported to ${fileName}`,
            exportFailed: 'Export Failed',
            exportFailedDetail: (reason: string) => `Could not export: ${reason}`,
            deleteAllConfirm: 'Delete all sessions, projects and boards? Your settings are kept.',
            dataRemoved: 'All user data is removed. Your settings are kept.',
        },
    },
}));

// The page's other options are not the subject: they drag in the monitor, the
// workers and the theming, none of which the data buttons depend on.
jest.mock('./DistractingList', () => ({
    DistractingListModalButton: () => null,
}));
const mockDeleteAllUserData = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);
jest.mock('../../monitor/sessionManager', () => ({
    deleteAllUserData: () => mockDeleteAllUserData(),
}));

const mockSend = jest.fn();
jest.mock('electron', () => ({
    shell: { openExternal: jest.fn() },
    ipcRenderer: { send: (...args: any[]) => mockSend(...args) },
}));

const mockRefreshDbs = jest.fn().mockResolvedValue(undefined);
jest.mock('../../dbs', () => ({
    __esModule: true,
    refreshDbs: () => mockRefreshDbs(),
    loadDBs: jest.fn(),
    dbs: {},
}));

// The three slider tests care about the values Setting hands to antd, not the
// pointer geometry of the real slider. A native range input exposes value/min/
// max and calls the same onChange with a number.
jest.mock('antd', () => {
    const React = require('react');
    const actual = jest.requireActual('antd');
    const Slider = ({ value, min, max, onChange }: any) =>
        React.createElement('input', {
            type: 'range',
            'data-testid': 'slider',
            value,
            min,
            max,
            onChange: (event: any) => onChange?.(Number(event.target.value)),
        });
    return { ...actual, Slider };
});

import { Setting } from './Setting';
import { IpcEventName, ExportResult, ImportResult } from '../../../main/ipc/type';

const exportData = jest.fn<Promise<ExportResult>, []>();
const props = (): any => ({
    focusDuration: 1500,
    restDuration: 300,
    longBreakDuration: 900,
    minFinishDuration: 600,
    monitorInterval: 1000,
    autoUpdate: false,
    screenShotInterval: undefined,
    warnBeforeFocusStart: false,
    useHardwareAcceleration: true,
    compactAlwaysOnTop: false,
    contentOpacity: 1,
    themeBackgroundOpacity: 1,
    themeId: 'day',
    followSystemTheme: true,
    customThemes: undefined,
    wallpaperPath: undefined,
    wallpaperOpacity: 1,
    startOnBoot: false,
    distractingList: [],
    calendarBaseColor: '#aceebb',
    setFocusDuration: jest.fn(),
    setRestDuration: jest.fn(),
    setLongBreakDuration: jest.fn(),
    setMinFinishDuration: jest.fn(),
    setAutoUpdate: jest.fn(),
    setScreenShotInterval: jest.fn(),
    setWarnBeforeFocusStart: jest.fn(),
    setUseHardwareAcceleration: jest.fn(),
    setCompactAlwaysOnTop: jest.fn(),
    setContentOpacity: jest.fn(),
    setThemeBackgroundOpacity: jest.fn(),
    setThemeId: jest.fn(),
    setFollowSystemTheme: jest.fn(),
    setWallpaperPath: jest.fn(),
    setWallpaperOpacity: jest.fn(),
    setStartOnBoot: jest.fn(),
    setCalendarBaseColor: jest.fn(),
});

/** The button whose accessible name contains `label`. */
const button = (label: string) => screen.getByRole('button', { name: new RegExp(label) });

const isLoading = (element: HTMLElement) => element.classList.contains('ant-btn-loading');

const mount = async () => {
    render(<Setting {...props()} />);
    // The page starts on the timer section; the data buttons live in `system`.
    const nav = screen.getByRole('navigation', { name: 'Settings sections' });
    fireEvent.click(within(nav).getByRole('button', { name: /System/ }));
};

const click = async (label: string) => {
    fireEvent.click(button(label));
    // Only the import is guarded by a confirmation; the export writes a file
    // and is taken at face value.
    if (mockConfirm.mock.calls.length > 0) {
        await act(async () => {
            mockConfirm.mock.calls.slice(-1)[0][0].onOk();
        });
    }

    // Let the awaited IPC promise settle.
    await act(async () => {
        await Promise.resolve();
    });
};

/** Renders the content the last dialog was opened with, as flat text. */
const alertText = () => {
    const content = mockAlert.mock.calls.slice(-1)[0][0].content;
    const { container, unmount } = render(<>{content}</>);
    const text = container.textContent ?? '';
    unmount();
    return text;
};

beforeEach(() => {
    mockAlert.mockClear();
    mockToast.mockClear();
    mockConfirm.mockClear();
    mockSend.mockClear();
    mockDeleteAllUserData.mockClear();
    exportData.mockReset();
    importData.mockReset();
    (window as any).api = { exportData, importData };
});
describe('minimum focus time before Finish', () => {
    it('renders the option on the timer section and saves the slider value in seconds', async () => {
        const p = props();
        render(<Setting {...p} />);

        const shown = document.body.textContent ?? '';
        expect(shown).toContain('Minimum Focus Time before Finish');
        // The hint has to explain the off switch: 0 allows finishing at any
        // time, which is what the "Any" mark of the slider stands for.
        expect(shown).toContain('allow finishing at any time');

        // Focus, short break, long break, then the minimum: the last slider of
        // the (default) timer section is the new one.
        const sliders = screen.getAllByTestId('slider') as HTMLInputElement[];
        expect(sliders.length).toBe(4);
        fireEvent.change(sliders[3], { target: { value: '5' } });
        expect(p.setMinFinishDuration).toHaveBeenCalledWith(5 * 60);
    });

    it('offers up to the focus duration, so a 50 minute session allows a 40 minute minimum', async () => {
        const p = { ...props(), focusDuration: 50 * 60, minFinishDuration: 40 * 60 };
        render(<Setting {...p} />);

        const sliders = screen.getAllByTestId('slider') as HTMLInputElement[];
        // The old flat maximum of 30 minutes made this unreachable.
        expect(sliders[3].max).toBe('50');
        expect(sliders[3].value).toBe('40');
    });

    it('shows a stored minimum above the focus duration at the effective value', async () => {
        // 30 minutes minimum with a 25 minute focus session: the guard could
        // never be passed, so the slider shows the effective value -- and the
        // stored setting is left alone, it applies again once the focus
        // duration allows it.
        const p = { ...props(), focusDuration: 25 * 60, minFinishDuration: 30 * 60 };
        render(<Setting {...p} />);

        const sliders = screen.getAllByTestId('slider') as HTMLInputElement[];
        expect(sliders[3].max).toBe('25');
        expect(sliders[3].value).toBe('25');
        // Rendering must never rewrite the setting on its own.
        expect(p.setMinFinishDuration).not.toHaveBeenCalled();
    });
});

describe('export', () => {
    it('names the file it wrote, which is also the receipt of when it was taken', async () => {
        exportData.mockResolvedValue({
            status: 'written',
            filePath: 'C:\\Users\\me\\pomodoro-logger-data-2026-10-04-15-04-05.json',
            meta: { exportedAt: 1, exportedAtText: '2026-10-04 15:04:05' },
        });
        await mount();

        await click('Export Data');

        expect(mockToast).toHaveBeenCalledTimes(1);
        expect(mockToast.mock.calls[0][0].content).toBe(
            'Data exported to pomodoro-logger-data-2026-10-04-15-04-05.json'
        );
        expect(isLoading(button('Export Data'))).toBe(false);
    });

    it('says nothing when the save dialog was cancelled', async () => {
        exportData.mockResolvedValue({ status: 'cancelled' });
        await mount();

        await click('Export Data');

        expect(mockToast).not.toHaveBeenCalled();
        expect(mockAlert).not.toHaveBeenCalled();
    });

    it('reports a failed export and frees the button', async () => {
        exportData.mockRejectedValue('EACCES: permission denied');
        await mount();

        await click('Export Data');

        expect(mockAlert).toHaveBeenCalledTimes(1);
        expect(mockAlert.mock.calls[0][0].title).toBe('Export Failed');
        expect(alertText()).toContain('EACCES: permission denied');
        expect(isLoading(button('Export Data'))).toBe(false);
    });
});

describe('import of a file that cannot be used', () => {
    it('lists the problems and leaves the app running', async () => {
        importData.mockResolvedValue({
            status: 'invalid',
            issues: [
                {
                    path: 'records[3].startTime',
                    message: 'is missing; a finite number is required',
                },
                { path: 'cards["a1"].spentTimeInHour', message: 'is missing' },
            ],
        });
        await mount();

        await click('Import Data');

        expect(mockAlert).toHaveBeenCalledTimes(1);
        expect(mockAlert.mock.calls[0][0].title).toBe('This file cannot be imported');
        const shown = alertText();
        expect(shown).toContain('records[3].startTime');
        expect(shown).toContain('is missing; a finite number is required');
        expect(shown).toContain('cards["a1"].spentTimeInHour');
        // The whole point of the refusal: no restart, no data touched.
        expect(mockSend).not.toHaveBeenCalled();
        expect(isLoading(button('Import Data'))).toBe(false);
    });

    it('reports an unexpected failure instead of leaving the button spinning', async () => {
        importData.mockRejectedValue('ENOENT: no such file');
        await mount();

        await click('Import Data');

        expect(mockAlert.mock.calls[0][0].title).toBe('Import Failed');
        expect(alertText()).toContain('ENOENT: no such file');
        expect(mockSend).not.toHaveBeenCalled();
        expect(isLoading(button('Import Data'))).toBe(false);
    });

    it('stays quiet when the open dialog was cancelled', async () => {
        importData.mockResolvedValue({ status: 'cancelled' });
        await mount();

        await click('Import Data');

        expect(mockAlert).not.toHaveBeenCalled();
        expect(mockToast).not.toHaveBeenCalled();
        expect(mockSend).not.toHaveBeenCalled();
    });
});

describe('import of a usable file', () => {
    it('restarts straight away when nothing had to be adjusted', async () => {
        importData.mockResolvedValue({ status: 'imported', warnings: [], meta: {} });
        await mount();

        await click('Import Data');

        expect(mockToast.mock.calls[0][0].content).toBe('Data imported. Restarting');
        expect(mockSend).toHaveBeenCalledWith(IpcEventName.Restart);
    });

    it('shows the warnings first and restarts once they are acknowledged', async () => {
        // The old flow restarted inside the main process handler, so the merge
        // notes could never be read by anyone: the user found out about dropped
        // cards by noticing they were gone.
        importData.mockResolvedValue({
            status: 'imported',
            warnings: [{ path: 'merge', message: 'Card "a1" will be removed' }],
            meta: {},
        });
        await mount();

        await click('Import Data');

        expect(mockAlert.mock.calls[0][0].title).toBe('Imported with warnings');
        expect(alertText()).toContain('Card "a1" will be removed');
        // Still not restarted: the user has not closed the dialog yet.
        expect(mockSend).not.toHaveBeenCalled();

        await act(async () => {
            mockAlert.mock.calls[0][0].onOk();
        });

        expect(mockSend).toHaveBeenCalledWith(IpcEventName.Restart);
    });
});

describe('delete of all data', () => {
    it('clears the data, reports it and restarts after the toast', async () => {
        // The restart sits behind a 3 second toast, so the clock is faked for
        // this test only: honest about the delay without actually spending it.
        jest.useFakeTimers();
        try {
            await mount();

            await click('Delete All Data');

            expect(mockConfirm).toHaveBeenCalledTimes(1);
            expect(mockConfirm.mock.calls[0][0].title).toBe(
                'Delete all sessions, projects and boards? Your settings are kept.'
            );
            expect(mockDeleteAllUserData).toHaveBeenCalledTimes(1);
            expect(mockToast.mock.calls[0][0].content).toBe(
                'All user data is removed. Your settings are kept.'
            );
            // The restart is on a timer: nothing is sent while the toast shows.
            expect(mockSend).not.toHaveBeenCalled();

            await act(async () => {
                jest.advanceTimersByTime(3000);
            });

            expect(mockSend).toHaveBeenCalledWith(IpcEventName.Restart);
        } finally {
            jest.useRealTimers();
        }
    });
});

const importData = jest.fn<Promise<ImportResult>, []>();
