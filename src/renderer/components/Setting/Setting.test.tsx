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
 *   the floor (`// TODO: Show Warning`).
 *
 * Import and "delete all" no longer restart: the store is re-read instead, and
 * an import with leftovers opens a report that leads into the data check.
 */
import * as React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

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
            importConfirm: 'Importing merges the file into your data. Continue?',
            importInvalidTitle: 'This file cannot be imported',
            importInvalidIntro: 'Nothing was imported.',
            importDone: 'Data imported',
            importIssuesLogged: 'The complete list was written to the log folder.',
            importFailed: 'Import Failed',
            importFailedDetail: (reason: string) => `Could not import: ${reason}`,
            importFailedHint: 'Check the log folder for details.',
            exportDone: (fileName: string) => `Data exported to ${fileName}`,
            exportFailed: 'Export Failed',
            exportFailedDetail: (reason: string) => `Could not export: ${reason}`,
            deleteAllConfirm: 'Delete all sessions, projects and boards? Your settings are kept.',
            deleteAllNote: 'Your settings are kept. This cannot be undone.',
            deleteDone: 'All data deleted',
            deleteFailed: 'Could Not Delete Data',
            deleteFailedDetail: (reason: string) =>
                `The data could not be fully deleted: ${reason}.`,
            dataCheckNone: 'No data problems found',
            dataCheckFailed: 'Could Not Check the Data',
            dataCheckFailedDetail: (reason: string) => `Could not check the data: ${reason}`,
            openDataDirFailed: 'Could Not Open Data Folder',
            openDataDirFailedDetail: (reason: string) =>
                `Could not open the data folder: ${reason}`,
            openLogDirFailed: 'Could Not Open Log Folder',
            openLogDirFailedDetail: (reason: string) => `Could not open the log folder: ${reason}`,
        },
    },
}));

// The page's other options are not the subject: they drag in the monitor, the
// workers and the theming, none of which the data buttons depend on.
jest.mock('./DistractingList', () => ({
    DistractingListModalButton: () => null,
}));

// The real dialog is a connected subtree (it renders the card-restore flow);
// this file drives the page's own orchestration: scan, open, apply, rescan.
jest.mock('./DataRepairDialog', () => ({
    DataRepairDialog: ({ open, report, onClose, onRescan, applyRepair }: any) =>
        open ? (
            <div>
                <span data-testid="repair-cards">{report.orphanCards.length}</span>
                <button
                    data-testid="repair-apply"
                    onClick={() =>
                        applyRepair({
                            removedCards: [],
                            removedLists: [],
                            updatedCards: {},
                            updatedLists: {},
                            updatedBoards: {},
                            removedMoves: 0,
                            repairedRefs: 0,
                        })
                    }
                >
                    apply
                </button>
                <button data-testid="repair-rescan" onClick={onRescan}>
                    rescan
                </button>
                <button data-testid="repair-close" onClick={onClose}>
                    close
                </button>
            </div>
        ) : null,
}));
const mockDeleteAllUserData = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);
jest.mock('../../monitor/sessionManager', () => ({
    deleteAllUserData: () => mockDeleteAllUserData(),
}));

// The report is a layout-only dialog; this file drives the page's orchestration
// (reload, open, and the jump into the data check).
jest.mock('./ImportReportDialog', () => ({
    ImportReportDialog: ({ open, summary, onClose, onCheckData }: any) =>
        open ? (
            <div data-testid="import-report">
                <span data-testid="import-report-cards">{summary.counts.cardsOutsideLists}</span>
                <button data-testid="import-report-check" onClick={onCheckData}>
                    check
                </button>
                <button data-testid="import-report-done" onClick={onClose}>
                    done
                </button>
            </div>
        ) : null,
}));

const mockReloadData = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);

const mockRefreshDbs = jest.fn().mockResolvedValue(undefined);
jest.mock('../../dbs', () => ({
    __esModule: true,
    refreshDbs: () => mockRefreshDbs(),
    loadDBs: jest.fn(),
    dbs: {},
}));

// The three slider tests care about the values Setting hands to antd, not the
// pointer geometry of the real slider. A native range input exposes value/min/
// max and calls the same onChange with a number; the real slider announces the
// end of a drag separately, so the input reports both (see PreviewSlider).
jest.mock('antd', () => {
    const React = require('react');
    const actual = jest.requireActual('antd');
    const Slider = ({ value, min, max, onChange, onChangeComplete }: any) =>
        React.createElement('input', {
            type: 'range',
            'data-testid': 'slider',
            value,
            min,
            max,
            onChange: (event: any) => {
                const next = Number(event.target.value);
                onChange?.(next);
                onChangeComplete?.(next);
            },
        });
    return { ...actual, Slider };
});

import { Setting } from './Setting';
import type { ExportResult, ImportResult } from '../../../main/ipc/type';

const exportData = jest.fn<Promise<ExportResult>, []>();
const openDataDir = jest.fn<Promise<void>, []>();
const openLogDir = jest.fn<Promise<void>, []>();
const scanDataIssues = jest.fn();
const repairData = jest.fn();
const applyRepair = jest.fn();
const props = (): any => ({
    applyRepair,
    reloadDataStore: mockReloadData,
    focusDuration: 1500,
    restDuration: 300,
    longBreakDuration: 900,
    minFinishDuration: 600,
    monitorInterval: 1000,
    autoUpdate: false,
    screenShotInterval: undefined,
    warnBeforeFocusStart: false,
    useHardwareAcceleration: true,
    unloadOnCloseToTray: false,
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
    language: 'system',
    logLevel: 'info',
    setFocusDuration: jest.fn(),
    setRestDuration: jest.fn(),
    setLongBreakDuration: jest.fn(),
    setMinFinishDuration: jest.fn(),
    setAutoUpdate: jest.fn(),
    setScreenShotInterval: jest.fn(),
    setWarnBeforeFocusStart: jest.fn(),
    setUseHardwareAcceleration: jest.fn(),
    setUnloadOnCloseToTray: jest.fn(),
    setCompactAlwaysOnTop: jest.fn(),
    setContentOpacity: jest.fn(),
    setThemeBackgroundOpacity: jest.fn(),
    setThemeId: jest.fn(),
    setFollowSystemTheme: jest.fn(),
    setWallpaperPath: jest.fn(),
    setWallpaperOpacity: jest.fn(),
    setStartOnBoot: jest.fn(),
    setCalendarBaseColor: jest.fn(),
    setLanguage: jest.fn(),
    setLogLevel: jest.fn(),
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
    // Only the import and delete are guarded by a confirmation; the export
    // writes a file and is taken at face value. `onOk` may return a promise
    // (the delete keeps the dialog busy until it settles), so it is awaited.
    if (mockConfirm.mock.calls.length > 0) {
        await act(async () => {
            await mockConfirm.mock.calls.slice(-1)[0][0].onOk?.();
        });
    }

    // Let the awaited IPC promise settle.
    await act(async () => {
        await Promise.resolve();
    });
};

/** Renders the extra actions of the last alert so they can be clicked. */
const alertActions = () => {
    const actions = mockAlert.mock.calls.slice(-1)[0][0].actions;
    const { container, unmount } = render(<>{actions}</>);
    return {
        click: (label: string) =>
            fireEvent.click(within(container).getByRole('button', { name: label })),
        unmount,
    };
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
    mockReloadData.mockClear();
    mockDeleteAllUserData.mockClear();
    exportData.mockReset();
    importData.mockReset();
    openDataDir.mockReset();
    openLogDir.mockReset();
    scanDataIssues.mockReset();
    repairData.mockReset();
    applyRepair.mockClear();
    (window as any).api = {
        exportData,
        importData,
        openDataDir,
        openLogDir,
        scanDataIssues,
        repairData,
        checkUpdate: jest.fn(),
        onUpdateAvailable: jest.fn(() => jest.fn()),
        onUpdateNotAvailable: jest.fn(() => jest.fn()),
        onUpdateError: jest.fn(() => jest.fn()),
        openAtLogin: jest.fn(),
        openExternal: jest.fn(),
        selectWallpaper: jest.fn(),
    };
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
        // The page folds slider events into one change per frame (see
        // `useSliderChange`), so the value is applied on the next frame rather
        // than inside the event.
        await waitFor(() => expect(p.setMinFinishDuration).toHaveBeenCalledWith(5 * 60));
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

describe('open data folder', () => {
    it('asks the main process to open the folder that holds the data', async () => {
        openDataDir.mockResolvedValue(undefined);
        await mount();

        await click('Open Data Folder');

        expect(openDataDir).toHaveBeenCalledTimes(1);
        expect(mockAlert).not.toHaveBeenCalled();
    });

    it('explains why the folder could not be opened', async () => {
        openDataDir.mockRejectedValue(new Error('EACCES: permission denied'));
        await mount();

        await click('Open Data Folder');

        expect(mockAlert).toHaveBeenCalledTimes(1);
        expect(mockAlert.mock.calls[0][0].title).toBe('Could Not Open Data Folder');
        expect(alertText()).toContain('EACCES: permission denied');
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
        // The list in the dialog is shortened on purpose; the promise is that
        // the rest is in the log, not that the dialog can show everything.
        expect(shown).toContain('The complete list was written to the log folder.');

        openLogDir.mockResolvedValue(undefined);
        const actions = alertActions();
        actions.click('Open Log Folder');
        actions.unmount();
        await act(async () => {
            await Promise.resolve();
        });
        expect(openLogDir).toHaveBeenCalledTimes(1);

        // The whole point of the refusal: no reload, no data touched.
        expect(mockReloadData).not.toHaveBeenCalled();
        expect(isLoading(button('Import Data'))).toBe(false);
    });

    it('reports an unexpected failure instead of leaving the button spinning', async () => {
        importData.mockRejectedValue('ENOENT: no such file');
        await mount();

        await click('Import Data');

        expect(mockAlert.mock.calls[0][0].title).toBe('Import Failed');
        expect(alertText()).toContain('ENOENT: no such file');
        expect(alertText()).toContain('Check the log folder for details.');
        expect(mockAlert.mock.calls[0][0].actions).toBeTruthy();
        expect(mockReloadData).not.toHaveBeenCalled();
        expect(isLoading(button('Import Data'))).toBe(false);
    });

    it('stays quiet when the open dialog was cancelled', async () => {
        importData.mockResolvedValue({ status: 'cancelled' });
        await mount();

        await click('Import Data');

        expect(mockAlert).not.toHaveBeenCalled();
        expect(mockToast).not.toHaveBeenCalled();
        expect(mockReloadData).not.toHaveBeenCalled();
    });
});

describe('import of a usable file', () => {
    const summary = (over: Partial<Record<string, number>> = {}) => ({
        counts: {
            cardsOutsideLists: 0,
            deadMoves: 0,
            danglingSessions: 0,
            unknownBoard: 0,
            noBoard: 0,
            rehomed: 0,
            ...over,
        },
    });

    it('reloads the store and stops at a toast when nothing needs attention', async () => {
        importData.mockResolvedValue({ status: 'imported', summary: summary(), meta: {} });
        await mount();

        await click('Import Data');

        expect(mockReloadData).toHaveBeenCalledTimes(1);
        expect(mockToast.mock.calls[0][0].content).toBe('Data imported');
        expect(screen.queryByTestId('import-report')).toBeNull();
    });

    it('opens the report when the merge left something behind', async () => {
        importData.mockResolvedValue({
            status: 'imported',
            summary: summary({ cardsOutsideLists: 12 }),
            meta: {},
        });
        await mount();

        await click('Import Data');

        expect(mockReloadData).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId('import-report')).toBeTruthy();
        expect(screen.getByTestId('import-report-cards').textContent).toBe('12');
    });

    it('goes straight to the data check from the report', async () => {
        importData.mockResolvedValue({
            status: 'imported',
            summary: summary({ deadMoves: 2 }),
            meta: {},
        });
        scanDataIssues.mockResolvedValue({
            detachedCards: [],
            orphanCards: [],
            lists: [],
            moves: { total: 0, cardCount: 0 },
            dangling: [],
        });
        await mount();

        await click('Import Data');
        await act(async () => {
            fireEvent.click(screen.getByTestId('import-report-check'));
            await Promise.resolve();
        });

        expect(scanDataIssues).toHaveBeenCalledTimes(1);
        expect(screen.queryByTestId('import-report')).toBeNull();
        // An empty scan only toasts; the repair dialog stays closed.
        expect(mockToast).toHaveBeenCalledWith(
            expect.objectContaining({ content: 'No data problems found' })
        );
    });
});

describe('delete of all data', () => {
    it('deletes behind the confirmation dialog and reloads the store', async () => {
        await mount();

        await click('Delete All Data');

        expect(mockConfirm).toHaveBeenCalledTimes(1);
        const options = mockConfirm.mock.calls[0][0];
        expect(options.title).toBe(
            'Delete all sessions, projects and boards? Your settings are kept.'
        );
        expect(options.content).toBe('Your settings are kept. This cannot be undone.');
        expect(mockDeleteAllUserData).toHaveBeenCalledTimes(1);
        expect(mockReloadData).toHaveBeenCalledTimes(1);
        expect(mockToast.mock.calls[0][0].content).toBe('All data deleted');
    });

    it('explains a failed deletion, offers the log folder and leaves the data alone', async () => {
        mockDeleteAllUserData.mockRejectedValueOnce(new Error('EPERM: resource busy'));
        await mount();

        await click('Delete All Data');

        expect(mockAlert).toHaveBeenCalledTimes(1);
        expect(mockAlert.mock.calls[0][0].title).toBe('Could Not Delete Data');
        expect(alertText()).toContain('EPERM: resource busy');
        expect(mockAlert.mock.calls[0][0].actions).toBeTruthy();
        expect(mockReloadData).not.toHaveBeenCalled();
    });
});

const importData = jest.fn<Promise<ImportResult>, []>();

describe('Setting logging option', () => {
    it('offers the four levels and reports the chosen one', async () => {
        const loggingProps = { ...props(), logLevel: 'info' as const };
        render(<Setting {...loggingProps} />);

        const nav = screen.getByRole('navigation', { name: 'Settings sections' });
        fireEvent.click(within(nav).getByRole('button', { name: /System/ }));

        fireEvent.click(screen.getByRole('button', { name: 'Debug' }));
        expect(loggingProps.setLogLevel).toHaveBeenCalledWith('debug');

        fireEvent.click(screen.getByRole('button', { name: 'Warn' }));
        expect(loggingProps.setLogLevel).toHaveBeenCalledWith('warn');
    });

    it('opens the log folder', async () => {
        openLogDir.mockResolvedValue(undefined);
        await mount();

        await click('Open Log Folder');

        expect(openLogDir).toHaveBeenCalledTimes(1);
        expect(mockAlert).not.toHaveBeenCalled();
    });

    it('explains why the log folder could not be opened', async () => {
        openLogDir.mockRejectedValue(new Error('EACCES: permission denied'));
        await mount();

        await click('Open Log Folder');

        expect(mockAlert).toHaveBeenCalledTimes(1);
        expect(alertText()).toContain('EACCES: permission denied');
    });
});

describe('Setting language option', () => {
    it('offers follow-system, Chinese and English, and reports the choice', () => {
        const languageProps = { ...props(), language: 'system' };
        render(<Setting {...languageProps} />);

        const nav = screen.getByRole('navigation', { name: 'Settings sections' });
        fireEvent.click(within(nav).getByRole('button', { name: /System/ }));

        fireEvent.click(screen.getByRole('button', { name: '简体中文' }));
        expect(languageProps.setLanguage).toHaveBeenCalledWith('zh');

        fireEvent.click(screen.getByRole('button', { name: 'English' }));
        expect(languageProps.setLanguage).toHaveBeenCalledWith('en');

        fireEvent.click(screen.getByRole('button', { name: 'Follow system' }));
        expect(languageProps.setLanguage).toHaveBeenCalledWith('system');
    });
});

describe('Setting tray memory option', () => {
    it('offers the toggle in the system section and reports the choice', () => {
        const trayProps = props();
        render(<Setting {...trayProps} />);

        const nav = screen.getByRole('navigation', { name: 'Settings sections' });
        fireEvent.click(within(nav).getByRole('button', { name: /System/ }));

        const label = screen.getByText('Release Page Memory in Tray');
        const toggle =
            label.parentElement?.querySelector<HTMLButtonElement>('button[role="switch"]');
        expect(toggle).toBeTruthy();

        fireEvent.click(toggle!);
        expect(trayProps.setUnloadOnCloseToTray).toHaveBeenCalledWith(true);
    });
});

describe('Setting screenshot option', () => {
    const openNotifications = (container: HTMLElement) => {
        const nav = within(container).getByRole('navigation', { name: 'Settings sections' });
        fireEvent.click(within(nav).getByRole('button', { name: /Notifications/ }));
    };

    const HINT = /Takes a screenshot every 5 minutes/;

    it('offers the capture toggle in a development build', () => {
        const { container } = render(<Setting {...props()} />);
        openNotifications(container);

        expect(within(container).getByText(HINT)).toBeTruthy();
    });

    it('hides it in a packaged build, where the capture is retired', () => {
        (window.api as any).isPackaged = true;
        try {
            const { container } = render(<Setting {...props()} />);
            openNotifications(container);

            expect(within(container).queryByText(HINT)).toBeNull();
        } finally {
            delete (window.api as any).isPackaged;
        }
    });
});

describe('Setting data check', () => {
    const emptyReport = {
        detachedCards: [],
        orphanCards: [],
        lists: [],
        moves: { total: 0, cardCount: 0 },
        dangling: [],
    };
    const cardIssue = (id: string) => ({
        _id: id,
        title: id,
        spentHours: 1,
        sessionCount: 1,
    });

    it('says so when nothing needs attention', async () => {
        scanDataIssues.mockResolvedValue(emptyReport);
        await mount();

        fireEvent.click(button('Check & Repair Data'));
        await act(async () => {
            await Promise.resolve();
        });

        expect(mockToast).toHaveBeenCalledWith(
            expect.objectContaining({ content: 'No data problems found' })
        );
        expect(screen.queryByTestId('repair-cards')).toBeNull();
    });

    it('opens the dialog with the scan result', async () => {
        scanDataIssues.mockResolvedValue({
            ...emptyReport,
            orphanCards: [cardIssue('c1'), cardIssue('c2')],
        });
        await mount();

        fireEvent.click(button('Check & Repair Data'));
        await act(async () => {
            await Promise.resolve();
        });

        expect(screen.getByTestId('repair-cards').textContent).toBe('2');
    });

    it('hands the repair result to the store and rescans on demand', async () => {
        scanDataIssues.mockResolvedValue({ ...emptyReport, orphanCards: [cardIssue('c1')] });
        await mount();

        fireEvent.click(button('Check & Repair Data'));
        await act(async () => {
            await Promise.resolve();
        });

        fireEvent.click(screen.getByTestId('repair-apply'));
        expect(applyRepair).toHaveBeenCalledWith(expect.objectContaining({ removedCards: [] }));

        fireEvent.click(screen.getByTestId('repair-rescan'));
        await act(async () => {
            await Promise.resolve();
        });
        expect(scanDataIssues).toHaveBeenCalledTimes(2);
    });

    it('keeps the button in its loading state while the scan is in flight', async () => {
        let resolveScan: (value: any) => void = () => {};
        scanDataIssues.mockReturnValue(
            new Promise((resolve) => {
                resolveScan = resolve;
            })
        );
        await mount();

        const checkButton = button('Check & Repair Data');
        fireEvent.click(checkButton);
        await act(async () => {
            await Promise.resolve();
        });

        // The spinner follows the promise, not a blocking call: it stays on
        // screen for as long as the scan takes, with the dialog still closed.
        // A synchronous scan would paint the spinner only after it finished,
        // which is why a slow one looked like "click, nothing, dialog".
        expect(isLoading(checkButton)).toBe(true);
        expect(screen.queryByTestId('repair-cards')).toBeNull();

        await act(async () => {
            resolveScan(emptyReport);
            await Promise.resolve();
        });
        expect(isLoading(checkButton)).toBe(false);
    });

    it('reports a failed scan and keeps the dialog closed', async () => {
        scanDataIssues.mockRejectedValue(new Error('disk gone'));
        await mount();

        fireEvent.click(button('Check & Repair Data'));
        await act(async () => {
            await Promise.resolve();
        });

        expect(mockAlert).toHaveBeenCalledTimes(1);
        expect(screen.queryByTestId('repair-cards')).toBeNull();
    });
});

describe('Setting update check', () => {
    it('releases the listeners when the page is left while a check is in flight', () => {
        const unsubscribers: jest.Mock[] = [];
        const track = () => {
            const unsubscribe = jest.fn();
            unsubscribers.push(unsubscribe);
            return unsubscribe;
        };
        (window as any).api.onUpdateAvailable = jest.fn(track);
        (window as any).api.onUpdateNotAvailable = jest.fn(track);
        (window as any).api.onUpdateError = jest.fn(track);

        const { unmount } = render(<Setting {...props()} />);
        const nav = screen.getByRole('navigation', { name: 'Settings sections' });
        fireEvent.click(within(nav).getByRole('button', { name: /System/ }));

        fireEvent.click(button('Check Update'));
        expect(unsubscribers).toHaveLength(3);

        // No answer arrived; leaving the page is the only thing that can clean
        // up, and it is what used to be missing.
        unmount();
        for (const unsubscribe of unsubscribers) {
            expect(unsubscribe).toHaveBeenCalledTimes(1);
        }
    });
});
