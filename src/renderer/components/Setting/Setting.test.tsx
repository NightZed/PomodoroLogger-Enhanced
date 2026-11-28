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

// Only the three side effects are replaced. `FEEDBACK_MESSAGES` stays real: it
// resolves through the i18n catalog that `test/i18n.ts` pins to English, so a
// hand-written copy here would silently drift from the copy the page shows.
jest.mock('../feedback', () => ({
    ...jest.requireActual('../feedback'),
    feedback: {
        alert: (...args: any[]) => mockAlert(...args),
        toast: (...args: any[]) => mockToast(...args),
        confirm: (...args: any[]) => mockConfirm(...args),
        notice: jest.fn(),
    },
}));

// The repair dialog's restore flow reads boards from the store and has its own
// tests; this file pins the page's orchestration (scan → open → result).
jest.mock('../Kanban/RestoreCardsDialog', () => ({
    RestoreCardsDialog: () => null,
}));

const mockReloadData = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);

// The three slider tests care about the values Setting hands to antd, not the
// pointer geometry of the real slider. A native range input exposes value/min/
// max and calls the same onChange with a number; the real slider announces the
// end of a drag separately, so the input reports both (see PreviewSlider).
// `PreviewSlider` hands the value over as `defaultValue` -- the slider owns it
// while the thumb moves -- so the stand-in reads either spelling.
jest.mock('antd', () => {
    const React = require('react');
    const actual = jest.requireActual('antd');
    const Slider = ({ value, defaultValue, min, max, onChange, onChangeComplete }: any) =>
        React.createElement('input', {
            type: 'range',
            value: value ?? defaultValue,
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
const selectSound = jest.fn<Promise<string | undefined>, []>();
const clearUserFiles = jest.fn<Promise<void>, []>();
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
    workSoundPath: undefined,
    workSoundEnabled: true,
    shortBreakSoundPath: undefined,
    shortBreakSoundEnabled: true,
    longBreakSoundPath: undefined,
    longBreakSoundEnabled: true,
    soundVolume: 0.5,
    desktopNotification: true,
    warnBeforeFocusStart: false,
    autoStartWork: false,
    autoStartBreak: false,
    returnToTimerOnSessionEnd: true,
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
    setAutoStartWork: jest.fn(),
    setAutoStartBreak: jest.fn(),
    setReturnToTimerOnSessionEnd: jest.fn(),
    setUseHardwareAcceleration: jest.fn(),
    setUnloadOnCloseToTray: jest.fn(),
    setCompactAlwaysOnTop: jest.fn(),
    setContentOpacity: jest.fn(),
    setThemeBackgroundOpacity: jest.fn(),
    setThemeId: jest.fn(),
    setFollowSystemTheme: jest.fn(),
    setWallpaperPath: jest.fn(),
    setWallpaperOpacity: jest.fn(),
    setWorkSoundPath: jest.fn(),
    setShortBreakSoundPath: jest.fn(),
    setLongBreakSoundPath: jest.fn(),
    setWorkSoundEnabled: jest.fn(),
    setShortBreakSoundEnabled: jest.fn(),
    setLongBreakSoundEnabled: jest.fn(),
    setSoundVolume: jest.fn(),
    setDesktopNotification: jest.fn(),
    setStartOnBoot: jest.fn(),
    setCalendarBaseColor: jest.fn(),
    setLanguage: jest.fn(),
    setLogLevel: jest.fn(),
    resetSettings: jest.fn(),
});

/** The button whose accessible name contains `label`. */
const button = (label: string) => screen.getByRole('button', { name: new RegExp(label) });

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
    clearUserFiles.mockReset();
    clearUserFiles.mockResolvedValue(undefined);
    exportData.mockReset();
    importData.mockReset();
    openDataDir.mockReset();
    openLogDir.mockReset();
    selectSound.mockReset();
    scanDataIssues.mockReset();
    repairData.mockReset();
    applyRepair.mockClear();
    // Keep what `test/dbBridge.ts` installed (dbRequest/dbReady and the
    // main-process transactions behind them) and override only the IPC calls
    // this page makes. Replacing the object wholesale used to drop the bridge,
    // which is why the delete flow needed a stub for the entire data layer.
    (window as any).api = {
        ...(window as any).api,
        exportData,
        importData,
        openDataDir,
        openLogDir,
        clearUserFiles,
        scanDataIssues,
        repairData,
        checkUpdate: jest.fn(),
        onUpdateAvailable: jest.fn(() => jest.fn()),
        onUpdateNotAvailable: jest.fn(() => jest.fn()),
        onUpdateError: jest.fn(() => jest.fn()),
        openAtLogin: jest.fn(),
        openExternal: jest.fn(),
        selectWallpaper: jest.fn(),
        selectSound,
    };
});
describe('automatic session continuation', () => {
    it('offers a switch per direction on the timer section and saves it', () => {
        const p = props();
        render(<Setting {...p} />);

        const work = screen.getByRole('switch', { name: 'Auto-start Focus' });
        const rest = screen.getByRole('switch', { name: 'Auto-start Break' });
        // Off to begin with: skipping the ending mask is opt-in.
        expect(work.getAttribute('aria-checked')).toBe('false');
        expect(rest.getAttribute('aria-checked')).toBe('false');

        fireEvent.click(work);
        fireEvent.click(rest);

        expect(p.setAutoStartWork).toHaveBeenCalledWith(true);
        expect(p.setAutoStartBreak).toHaveBeenCalledWith(true);
    });
});

describe('minimum focus time before Finish', () => {
    it('renders the option on the timer section and saves the slider value in seconds', async () => {
        const p = props();
        render(<Setting {...p} />);

        const shown = document.body.textContent ?? '';
        expect(shown).toContain('Minimum Focus Time before Finish');

        // Focus, short break, long break, then the minimum: the last slider of
        // the (default) timer section is the new one.
        const sliders = screen.getAllByRole('slider') as HTMLInputElement[];
        expect(sliders.length).toBe(4);
        fireEvent.change(sliders[3], { target: { value: '5' } });
        // The stand-in above reports the end of the drag in the same event
        // (`onChangeComplete` is the real slider's release).
        await waitFor(() => expect(p.setMinFinishDuration).toHaveBeenCalledWith(5 * 60));
    });

    it('shows a zero minimum as 0 min instead of an "Any" label', () => {
        render(<Setting {...{ ...props(), minFinishDuration: 0 }} />);

        expect(screen.getByText('0 min')).toBeTruthy();
    });

    it('offers up to the focus duration, so a 50 minute session allows a 40 minute minimum', async () => {
        const p = { ...props(), focusDuration: 50 * 60, minFinishDuration: 40 * 60 };
        render(<Setting {...p} />);

        const sliders = screen.getAllByRole('slider') as HTMLInputElement[];
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

        const sliders = screen.getAllByRole('slider') as HTMLInputElement[];
        expect(sliders[3].max).toBe('25');
        expect(sliders[3].value).toBe('25');
        // Rendering must never rewrite the setting on its own.
        expect(p.setMinFinishDuration).not.toHaveBeenCalled();
    });
});

describe('reset all settings', () => {
    const openSystem = () => {
        const nav = screen.getByRole('navigation', { name: 'Settings sections' });
        fireEvent.click(within(nav).getByRole('button', { name: /System/ }));
    };

    // The button's label reads as switches and sliders, while the reset also
    // clears the wallpaper, a custom theme and the distracting-app list. The
    // confirmation is the only place that can say so -- and the click alone
    // must not reset anything.
    it('asks before touching anything and spells out what else goes', () => {
        const p = props();
        render(<Setting {...p} />);
        openSystem();

        fireEvent.click(screen.getByRole('button', { name: 'Reset All Settings' }));

        expect(p.resetSettings).not.toHaveBeenCalled();
        expect(mockConfirm.mock.calls[0]?.[0]).toMatchObject({
            title: 'Reset all settings?',
            okText: 'Reset',
        });

        const content = mockConfirm.mock.calls[0][0].content;
        expect(content).toContain('wallpaper');
        expect(content).toContain('distracting app list');
        // Sessions live in another table; the note has to promise that.
        expect(content).toContain('Sessions and boards are kept.');
    });

    it('resets and reports it once the dialog is accepted', async () => {
        const p = props();
        render(<Setting {...p} />);
        openSystem();

        fireEvent.click(screen.getByRole('button', { name: 'Reset All Settings' }));
        await act(async () => {
            await mockConfirm.mock.calls[0][0].onOk?.();
        });

        expect(p.resetSettings).toHaveBeenCalledTimes(1);
        expect(mockToast.mock.calls[0][0].content).toBe('Settings restored to their defaults.');
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
    });

    it('reports an unexpected failure and offers the log folder', async () => {
        importData.mockRejectedValue('ENOENT: no such file');
        await mount();

        await click('Import Data');

        expect(mockAlert.mock.calls[0][0].title).toBe('Import Failed');
        expect(alertText()).toContain('ENOENT: no such file');
        expect(alertText()).toContain('Check the log folder for details.');
        expect(mockAlert.mock.calls[0][0].actions).toBeTruthy();
        expect(mockReloadData).not.toHaveBeenCalled();
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

    // Regression: the main process restarted the app from inside the import
    // handler, so the report was never readable and the store was never
    // refreshed in place.
    it('reloads the store and stops at a toast when nothing needs attention', async () => {
        importData.mockResolvedValue({ status: 'imported', summary: summary(), meta: {} });
        await mount();

        await click('Import Data');

        expect(mockReloadData).toHaveBeenCalledTimes(1);
        expect(mockToast.mock.calls[0][0].content).toBe('Data imported');
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    // Regression: the merge warnings were dropped on the floor
    // (`// TODO: Show Warning`), so a lossy import looked like a clean one.
    it('opens the report when the merge left something behind', async () => {
        importData.mockResolvedValue({
            status: 'imported',
            summary: summary({ cardsOutsideLists: 12 }),
            meta: {},
        });
        await mount();

        await click('Import Data');

        expect(mockReloadData).toHaveBeenCalledTimes(1);
        const report = screen.getByRole('dialog', { name: 'Import complete' });
        expect(within(report).getByText('12 cards not in any list')).toBeTruthy();
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
            const report = screen.getByRole('dialog', { name: 'Import complete' });
            fireEvent.click(within(report).getByRole('button', { name: 'Check & Repair Data' }));
            await Promise.resolve();
        });

        expect(scanDataIssues).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('dialog', { name: 'Import complete' })).toBeNull();
        // An empty scan only toasts; the repair dialog stays closed.
        expect(mockToast).toHaveBeenCalledWith(
            expect.objectContaining({ content: 'No data problems found' })
        );
    });
});

describe('delete of all data', () => {
    const request = (db: string, operation: string, args: unknown[] = []) =>
        (window as any).api.dbRequest(db, operation, args);
    /** One session and one card, so "deleted" is distinguishable from "was empty". */
    const seed = async () => {
        await request('sessionDB', 'insert', [{ startTime: 1, apps: {} }]);
        await request('cardsDB', 'insert', [{ title: 'a card', boardId: 'b1' }]);
    };
    const remaining = async () => ({
        sessions: (await request('sessionDB', 'find', [{}])).length,
        cards: (await request('cardsDB', 'find', [{}])).length,
    });

    it('deletes every table behind the confirmation, then reloads the store', async () => {
        await seed();
        expect(await remaining()).toEqual({ sessions: 1, cards: 1 });

        await mount();
        await click('Delete All Data');

        const options = mockConfirm.mock.calls[0][0];
        expect(options.title.trim()).toBe('Delete all sessions, projects and boards?');
        expect(options.content).toBe('Your settings are kept. This cannot be undone.');
        // The rows are gone from the store itself, not just from a stub's memory.
        expect(await remaining()).toEqual({ sessions: 0, cards: 0 });
        expect(mockReloadData).toHaveBeenCalledTimes(1);
        expect(mockToast.mock.calls[0][0].content).toBe('All data deleted');
    });

    it('explains a failed deletion, offers the log folder and reports no success', async () => {
        clearUserFiles.mockRejectedValueOnce(new Error('EPERM: resource busy'));
        await mount();

        await click('Delete All Data');

        expect(mockAlert.mock.calls.map(([options]) => options.title)).toEqual([
            'Could Not Delete Data',
        ]);
        expect(alertText()).toContain('EPERM: resource busy');
        expect(mockAlert.mock.calls[0][0].actions).toBeTruthy();
        // A half-done delete must not be announced as done or reloaded into a
        // store that still expects the old rows.
        expect(mockReloadData).not.toHaveBeenCalled();
        expect(mockToast).not.toHaveBeenCalled();
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

describe('Setting return-to-timer option', () => {
    it('offers the toggle in the notification section and reports the choice', () => {
        const returnProps = props();
        render(<Setting {...returnProps} />);

        const nav = screen.getByRole('navigation', { name: 'Settings sections' });
        fireEvent.click(within(nav).getByRole('button', { name: /Notifications/ }));

        fireEvent.click(
            screen.getByRole('switch', { name: 'Return to the Timer When a Session Ends' })
        );

        expect(returnProps.setReturnToTimerOnSessionEnd).toHaveBeenCalledWith(false);
    });
});

describe('Setting tray memory option', () => {
    it('offers the toggle in the system section and reports the choice', () => {
        const trayProps = props();
        render(<Setting {...trayProps} />);

        const nav = screen.getByRole('navigation', { name: 'Settings sections' });
        fireEvent.click(within(nav).getByRole('button', { name: /System/ }));

        const toggle = screen.getByRole('switch', {
            name: 'Release Page Memory in Tray',
        }) as HTMLButtonElement;
        expect(toggle).toBeTruthy();

        fireEvent.click(toggle);
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
        expect(screen.queryByRole('dialog')).toBeNull();
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

        const dialog = screen.getByRole('dialog', { name: 'Check & Repair Data' });
        expect(within(dialog).getByText('Not in any list (2)')).toBeTruthy();
    });

    it('hands the repair result to the caller and rescans afterwards', async () => {
        scanDataIssues.mockResolvedValue({ ...emptyReport, orphanCards: [cardIssue('c1')] });
        repairData.mockResolvedValue({
            removedCards: ['c1'],
            removedLists: [],
            updatedCards: {},
            updatedLists: {},
            updatedBoards: {},
            removedMoves: 0,
            repairedRefs: 0,
        });
        await mount();

        fireEvent.click(button('Check & Repair Data'));
        await act(async () => {
            await Promise.resolve();
        });

        const dialog = screen.getByRole('dialog', { name: 'Check & Repair Data' });
        fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Select all' }));
        fireEvent.click(within(dialog).getByRole('button', { name: /Apply to selected/ }));
        await act(async () => {
            // The repair asks for one confirmation before touching the database.
            await mockConfirm.mock.calls.slice(-1)[0][0].onOk();
        });

        // What the page owes the rest of the app: the repair outcome leaves the
        // page and the data is scanned again. The dialog's own selection and
        // payload have their own tests.
        expect(applyRepair).toHaveBeenCalledWith(expect.objectContaining({ removedCards: ['c1'] }));
        expect(scanDataIssues).toHaveBeenCalledTimes(2);
    });

    // Regression: the scan blocked the main thread, so the spinner and the
    // dialog were both painted only after it finished.
    it('keeps the dialog closed until the scan resolves', async () => {
        let resolveScan: (value: any) => void = () => {};
        scanDataIssues.mockReturnValue(
            new Promise((resolve) => {
                resolveScan = resolve;
            })
        );
        await mount();

        fireEvent.click(button('Check & Repair Data'));
        await act(async () => {
            await Promise.resolve();
        });

        // The dialog follows the promise, not a blocking call. A synchronous
        // scan would have opened it before this assertion ran, which is why a
        // slow one looked like "click, nothing, dialog".
        expect(screen.queryByRole('dialog')).toBeNull();

        await act(async () => {
            resolveScan({ ...emptyReport, orphanCards: [cardIssue('c1')] });
            await Promise.resolve();
        });
        expect(screen.getByText('Not in any list (1)')).toBeTruthy();
    });

    it('reports a failed scan and keeps the dialog closed', async () => {
        scanDataIssues.mockRejectedValue(new Error('disk gone'));
        await mount();

        fireEvent.click(button('Check & Repair Data'));
        await act(async () => {
            await Promise.resolve();
        });

        // One alert, and the one that explains what failed: the titles are the
        // assertion so a duplicated dialog or a swapped message shows up here.
        expect(mockAlert.mock.calls.map(([options]) => options.title)).toEqual([
            'Could Not Check the Data',
        ]);
        expect(alertText()).toContain('disk gone');
        expect(screen.queryByRole('dialog')).toBeNull();
    });
});

describe('Setting update check', () => {
    const openAbout = () => {
        const nav = screen.getByRole('navigation', { name: 'Settings sections' });
        fireEvent.click(within(nav).getByRole('button', { name: /About/ }));
    };

    /** Preload's three update events, each returning a tracked unsubscribe. */
    const trackUpdateEvents = () => {
        const unsubscribers: jest.Mock[] = [];
        const track = () => {
            const unsubscribe = jest.fn();
            unsubscribers.push(unsubscribe);
            return unsubscribe;
        };
        (window as any).api.onUpdateAvailable = jest.fn(track);
        (window as any).api.onUpdateNotAvailable = jest.fn(track);
        (window as any).api.onUpdateError = jest.fn(track);
        return unsubscribers;
    };

    it('starts a check when the about pane opens', () => {
        const unsubscribers = trackUpdateEvents();

        render(<Setting {...props()} />);
        openAbout();

        // Opening the pane is the check: there is no button to press first.
        expect((window as any).api.checkUpdate).toHaveBeenCalledTimes(1);
        // A request that does not listen for all three answers would hang.
        expect(unsubscribers).toHaveLength(3);
    });

    it('shows that a check is in progress', () => {
        trackUpdateEvents();

        render(<Setting {...props()} />);
        openAbout();

        expect(screen.getByText('Checking for updates…')).toBeTruthy();
    });

    it('reports the latest version in the updates row', async () => {
        let answer: ((info: string) => void) | undefined;
        (window as any).api.onUpdateNotAvailable = jest.fn((listener: (info: string) => void) => {
            answer = listener;
            return jest.fn();
        });

        render(<Setting {...props()} />);
        openAbout();

        await act(async () => {
            answer?.('up to date');
        });

        expect(screen.getByText('You are on the latest version')).toBeTruthy();
    });

    it('names the new version when the check finds one', async () => {
        let answer: ((info: { version: string }) => void) | undefined;
        (window as any).api.onUpdateAvailable = jest.fn(
            (listener: (info: { version: string }) => void) => {
                answer = listener;
                return jest.fn();
            }
        );

        render(<Setting {...props()} />);
        openAbout();

        await act(async () => {
            answer?.({ version: '1.4.0' });
        });

        expect(screen.getByText('Version v1.4.0 is available')).toBeTruthy();
    });

    it('reuses a check that is already running when the pane is opened again', () => {
        trackUpdateEvents();

        render(<Setting {...props()} />);
        openAbout();

        const nav = screen.getByRole('navigation', { name: 'Settings sections' });
        fireEvent.click(within(nav).getByRole('button', { name: /Timer/ }));
        openAbout();

        // Nothing answered the first check, so it is still in flight: opening
        // the pane again must wait for it instead of starting a second request.
        expect((window as any).api.checkUpdate).toHaveBeenCalledTimes(1);
    });

    it('gives up after ten seconds without an answer', () => {
        jest.useFakeTimers();
        try {
            trackUpdateEvents();

            render(<Setting {...props()} />);
            openAbout();

            act(() => {
                jest.advanceTimersByTime(10000);
            });

            expect(screen.getByText('Could not check for updates')).toBeTruthy();
            expect(button('Check Update').hasAttribute('disabled')).toBe(false);
        } finally {
            jest.useRealTimers();
        }
    });

    it('releases the listeners when the settings page closes while a check is in flight', () => {
        const unsubscribers = trackUpdateEvents();

        const { unmount } = render(<Setting {...props()} />);
        openAbout();
        expect(unsubscribers).toHaveLength(3);

        // No answer arrived; closing the page is the only thing that can clean
        // up, and it is what used to be missing.
        unmount();
        for (const unsubscribe of unsubscribers) {
            expect(unsubscribe).toHaveBeenCalledTimes(1);
        }
    });
});

describe('Setting about links', () => {
    const openAbout = () => {
        const nav = screen.getByRole('navigation', { name: 'Settings sections' });
        fireEvent.click(within(nav).getByRole('button', { name: /About/ }));
    };

    it.each([
        ['Release notes', 'https://github.com/NightZed/PomodoroLogger-Enhanced/releases/latest'],
        ['Feedback', 'https://github.com/NightZed/PomodoroLogger-Enhanced/issues/'],
        ['License', 'https://www.gnu.org/licenses/gpl-3.0.html'],
    ])('opens %s in the system browser', (label, url) => {
        render(<Setting {...props()} />);
        openAbout();

        fireEvent.click(button(label));

        expect(window.api.openExternal).toHaveBeenCalledWith(url);
    });

    it('opens the repository from the GitHub icon', () => {
        render(<Setting {...props()} />);
        openAbout();

        fireEvent.click(screen.getByRole('button', { name: 'View the project on GitHub' }));

        expect(window.api.openExternal).toHaveBeenCalledWith(
            'https://github.com/NightZed/PomodoroLogger-Enhanced'
        );
    });
});

describe('opacity sliders', () => {
    const openAppearance = () => {
        const nav = screen.getByRole('navigation', { name: 'Settings sections' });
        fireEvent.click(within(nav).getByRole('button', { name: /Appearance/ }));
    };
    // The preview lands on the document element as inline style -- that is what
    // every surface quotes (see the layer table in Application.tsx), so the
    // inline value IS the observable output of a drag.
    const cssVar = (name: string) => document.documentElement.style.getPropertyValue(name);
    const OPACITY_VARS = [
        '--pl-content-opacity',
        '--pl-wallpaper-opacity',
        '--pl-theme-bg-opacity',
    ];

    beforeEach(() => {
        for (const name of OPACITY_VARS) {
            document.documentElement.style.removeProperty(name);
        }
    });
    afterEach(() => {
        for (const name of OPACITY_VARS) {
            document.documentElement.style.removeProperty(name);
        }
    });

    it('previews a drag straight to the DOM and commits it once, divided by 100', async () => {
        const p = props();
        render(<Setting {...p} />);
        openAppearance();

        // Content, theme background, then wallpaper: the third slider of the
        // appearance section.
        const sliders = screen.getAllByRole('slider') as HTMLInputElement[];
        expect(sliders).toHaveLength(3);
        fireEvent.change(sliders[2], { target: { value: '40' } });
        // The stand-in above fires `onChange` and `onChangeComplete` in one
        // event, so the commit is immediate.
        expect(p.setWallpaperOpacity).toHaveBeenCalledWith(0.4);

        // The preview is folded to one write per frame (`useSliderChange`).
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 30));
        });
        expect({ var: '--pl-wallpaper-opacity', value: cssVar('--pl-wallpaper-opacity') }).toEqual({
            var: '--pl-wallpaper-opacity',
            value: '0.4',
        });
        // The badge (the tooltip's replacement) reads the same live value.
        expect(screen.getByText('40%')).toBeTruthy();
        // The other two sliders of the section were not touched.
        expect({ var: '--pl-content-opacity', value: cssVar('--pl-content-opacity') }).toEqual({
            var: '--pl-content-opacity',
            value: '',
        });
        expect({ var: '--pl-theme-bg-opacity', value: cssVar('--pl-theme-bg-opacity') }).toEqual({
            var: '--pl-theme-bg-opacity',
            value: '',
        });
        expect(p.setContentOpacity).not.toHaveBeenCalled();
    });

    it('previews the content slider without touching the store while dragging', async () => {
        const p = props();
        render(<Setting {...p} />);
        openAppearance();

        const sliders = screen.getAllByRole('slider') as HTMLInputElement[];
        fireEvent.change(sliders[0], { target: { value: '70' } });
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 30));
        });

        expect({ var: '--pl-content-opacity', value: cssVar('--pl-content-opacity') }).toEqual({
            var: '--pl-content-opacity',
            value: '0.7',
        });
        expect(p.setContentOpacity).toHaveBeenCalledWith(0.7);
    });
});

describe('notification sounds', () => {
    const openNotifications = () => {
        const nav = screen.getByRole('navigation', { name: 'Settings sections' });
        fireEvent.click(within(nav).getByRole('button', { name: /Notifications/ }));
    };

    it('offers one row per session kind plus the desktop switch', () => {
        render(<Setting {...props()} />);
        openNotifications();

        expect(
            screen.getByRole('button', { name: 'Focus Completion Alert Choose File' })
        ).toBeTruthy();
        expect(
            screen.getByRole('button', { name: 'Short Break Completion Alert Choose File' })
        ).toBeTruthy();
        expect(
            screen.getByRole('button', { name: 'Long Break Completion Alert Choose File' })
        ).toBeTruthy();
        expect(screen.getByRole('switch', { name: 'Focus Completion Alert' })).toBeTruthy();
        expect(screen.getByRole('switch', { name: 'Desktop Notification' })).toBeTruthy();
        // No file chosen yet: each row says it uses the bundled chime.
        expect(screen.getAllByText('Default')).toHaveLength(3);
    });

    it('stores the file chosen for one row only', async () => {
        selectSound.mockResolvedValue('C:\\sounds\\rain.mp3');
        const p = props();
        render(<Setting {...p} />);
        openNotifications();

        fireEvent.click(screen.getByRole('button', { name: 'Focus Completion Alert Choose File' }));

        await waitFor(() =>
            expect(p.setWorkSoundPath).toHaveBeenCalledWith('C:\\sounds\\rain.mp3')
        );
        expect(p.setShortBreakSoundPath).not.toHaveBeenCalled();
        expect(p.setLongBreakSoundPath).not.toHaveBeenCalled();
    });

    it('leaves the row alone when the picker was cancelled', async () => {
        selectSound.mockResolvedValue(undefined);
        const p = props();
        render(<Setting {...p} />);
        openNotifications();

        fireEvent.click(screen.getByRole('button', { name: 'Focus Completion Alert Choose File' }));
        await act(async () => {
            await Promise.resolve();
        });

        expect(p.setWorkSoundPath).not.toHaveBeenCalled();
    });

    it('resets only the chosen row to the default chime', () => {
        const p = { ...props(), workSoundPath: 'C:\\sounds\\rain.mp3' };
        render(<Setting {...p} />);
        openNotifications();

        fireEvent.click(screen.getByRole('button', { name: 'Focus Completion Alert Reset' }));

        expect(p.setWorkSoundPath).toHaveBeenCalledWith(undefined);
        expect(p.setShortBreakSoundPath).not.toHaveBeenCalled();
    });

    it('silences one row without clearing its file', () => {
        const p = props();
        render(<Setting {...p} />);
        openNotifications();

        fireEvent.click(screen.getByRole('switch', { name: 'Focus Completion Alert' }));

        expect(p.setWorkSoundEnabled).toHaveBeenCalledWith(false);
        expect(p.setWorkSoundPath).not.toHaveBeenCalled();
    });

    it('shows the file name of a chosen sound', () => {
        render(<Setting {...{ ...props(), workSoundPath: 'C:\\sounds\\rain.mp3' }} />);
        openNotifications();

        expect(screen.getByText('rain.mp3')).toBeTruthy();
    });

    it('saves the volume when the drag ends', () => {
        const p = props();
        render(<Setting {...p} />);
        openNotifications();

        const sliders = screen.getAllByRole('slider') as HTMLInputElement[];
        expect(sliders).toHaveLength(1);
        fireEvent.change(sliders[0], { target: { value: '40' } });

        expect(p.setSoundVolume).toHaveBeenCalledWith(0.4);
    });

    it('switches the desktop notification off', () => {
        const p = props();
        render(<Setting {...p} />);
        openNotifications();

        fireEvent.click(screen.getByRole('switch', { name: 'Desktop Notification' }));

        expect(p.setDesktopNotification).toHaveBeenCalledWith(false);
    });
});
