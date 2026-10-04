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
import TestRenderer, { ReactTestRendererJSON, act } from 'react-test-renderer';

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
        },
    },
}));

// The page's other options are not the subject: they drag in the monitor, the
// workers and the theming, none of which the data buttons depend on.
jest.mock('./DistractingList', () => ({
    DistractingListModalButton: () => null,
}));
jest.mock('../../monitor/sessionManager', () => ({ deleteAllUserData: jest.fn() }));

const mockSend = jest.fn();
jest.mock('electron', () => ({
    shell: { openExternal: jest.fn() },
    ipcRenderer: { send: (...args: any[]) => mockSend(...args) },
}));

const mockRefreshDbs = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../main/db', () => ({
    refreshDbs: () => mockRefreshDbs(),
    loadDBs: jest.fn(),
    DBs: {},
}));

import { Setting } from './Setting';
import { IpcEventName, ExportResult, ImportResult } from '../../../main/ipc/type';

const exportData = jest.fn<Promise<ExportResult>, []>();
const props = (): any => ({
    focusDuration: 1500,
    restDuration: 300,
    longBreakDuration: 900,
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

/** Every string rendered anywhere in the tree, flattened. */
const texts = (node: unknown): string[] => {
    if (node == null) {
        return [];
    }

    if (typeof node === 'string') {
        return [node];
    }

    if (Array.isArray(node)) {
        return (node as unknown[]).reduce<string[]>((acc, child) => acc.concat(texts(child)), []);
    }

    const { children } = node as ReactTestRendererJSON;
    return (children ?? []).reduce<string[]>((acc, child) => acc.concat(texts(child)), []);
};

const findAll = (
    node: unknown,
    predicate: (n: ReactTestRendererJSON) => boolean
): ReactTestRendererJSON[] => {
    const result: ReactTestRendererJSON[] = [];
    const walk = (n: unknown) => {
        if (n == null || typeof n === 'string') {
            return;
        }

        if (Array.isArray(n)) {
            (n as unknown[]).forEach(walk);
            return;
        }

        const found = n as ReactTestRendererJSON;
        if (predicate(found)) {
            result.push(found);
        }

        (found.children ?? []).forEach(walk);
    };

    walk(node);
    return result;
};

/** The button whose label is exactly `label`. */
const button = (r: TestRenderer.ReactTestRenderer, label: string) =>
    findAll(r.toJSON(), (n) => n.type === 'button' && texts(n).join(' ') === label)[0];

const isLoading = (node: ReactTestRendererJSON | undefined) => !!node?.props?.loading === true;

let renderer!: TestRenderer.ReactTestRenderer;

const mount = async () => {
    await act(async () => {
        renderer = TestRenderer.create(<Setting {...props()} />);
    });
    // The page starts on the timer section; the data buttons live in `system`.
    await act(async () => {
        button(renderer, 'System')?.props.onClick();
    });
};

const click = async (label: string) => {
    await act(async () => {
        button(renderer, label)?.props.onClick();
    });
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
    return texts(TestRenderer.create(<>{content}</>).toJSON()).join('\n');
};

beforeEach(() => {
    mockAlert.mockClear();
    mockToast.mockClear();
    mockConfirm.mockClear();
    mockSend.mockClear();
    exportData.mockReset();
    importData.mockReset();
    (window as any).api = { exportData, importData };
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
        expect(isLoading(button(renderer, 'Export Data'))).toBe(false);
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
        expect(isLoading(button(renderer, 'Export Data'))).toBe(false);
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
        expect(isLoading(button(renderer, 'Import Data'))).toBe(false);
    });

    it('reports an unexpected failure instead of leaving the button spinning', async () => {
        importData.mockRejectedValue('ENOENT: no such file');
        await mount();

        await click('Import Data');

        expect(mockAlert.mock.calls[0][0].title).toBe('Import Failed');
        expect(alertText()).toContain('ENOENT: no such file');
        expect(mockSend).not.toHaveBeenCalled();
        expect(isLoading(button(renderer, 'Import Data'))).toBe(false);
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
const importData = jest.fn<Promise<ImportResult>, []>();
