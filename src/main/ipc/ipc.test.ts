jest.mock('electron', () => ({
    ipcMain: {
        handle: jest.fn(),
        on: jest.fn(),
    },
    dialog: {
        showSaveDialog: jest.fn(),
        showOpenDialog: jest.fn(),
    },
    app: {
        setLoginItemSettings: jest.fn(),
    },
    nativeImage: { createFromPath: jest.fn(() => 'icon') },
    Notification: jest.fn().mockImplementation(() => ({ show: jest.fn() })),
    desktopCapturer: { getSources: jest.fn() },
    nativeTheme: { themeSource: '' },
    screen: { getDisplayMatching: jest.fn() },
}));

jest.mock('../init', () => ({
    win: undefined,
    revealWindow: jest.fn(),
    restoreWindowForError: jest.fn(),
    setMenuItems: jest.fn(),
    setSkipTaskbar: jest.fn(),
}));

jest.mock('../log', () => ({
    log: jest.fn(),
    logError: jest.fn(),
    configureLogging: jest.fn(),
    getLogDir: () => '/tmp/logs',
    getSessionId: () => 'sid123',
    // Import detail lines carry local wall-clock times; the format itself is
    // covered by `log.test.ts`, so a stable ISO string is enough here.
    formatTimestamp: (date: Date) => date.toISOString(),
}));

jest.mock('../db/ipc', () => ({ initializeDbIpc: jest.fn() }));
jest.mock('../io/read', () => ({ readAllData: jest.fn() }));
jest.mock('../io/write', () => ({ writeAllFile: jest.fn() }));
jest.mock('../worker/fork', () => ({ sendWorkerMessage: jest.fn() }));
jest.mock('../activeWin', () => ({ activeWin: jest.fn() }));
jest.mock('./windowDrag', () => ({ startWindowDrag: jest.fn(), stopWindowDrag: jest.fn() }));
jest.mock('../userFiles', () => ({
    clearUserFiles: jest.fn(),
    deleteScreenshots: jest.fn(),
    saveScreenshot: jest.fn(),
}));
jest.mock('../openExternal', () => ({ openExternalUrl: jest.fn() }));
jest.mock('../openDataDir', () => ({ openDataDir: jest.fn() }));

import { app, desktopCapturer, dialog, screen } from 'electron';
import { readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { initialize, handleCommand, isTrustedSender } from './ipc';
import { setMenuItems, setSkipTaskbar } from '../init';
import { clearUserFiles, saveScreenshot } from '../userFiles';
import { startWindowDrag, stopWindowDrag } from './windowDrag';
import { readAllData } from '../io/read';
import { writeAllFile } from '../io/write';
import { sendWorkerMessage } from '../worker/fork';
import { configureLogging, log } from '../log';

const init = require('../init');
const handleMock = () => (require('electron').ipcMain.handle as jest.Mock).mock.calls;
const onMock = () => (require('electron').ipcMain.on as jest.Mock).mock.calls;

const webContents = { id: 'trusted' };
const sender = webContents;
const trustedEvent = { sender } as any;
const untrustedEvent = { sender: { id: 'other' } } as any;
const mockWin = {
    webContents,
    isDestroyed: jest.fn(() => false),
    isMaximized: jest.fn(() => false),
    getBounds: jest.fn(() => ({ x: 0, y: 0, width: 100, height: 100 })),
    setAlwaysOnTop: jest.fn(),
    setContentSize: jest.fn(),
    minimize: jest.fn(),
    maximize: jest.fn(),
    unmaximize: jest.fn(),
    close: jest.fn(),
};

let handlers: Record<string, (...args: any[]) => any>;
let commands: Record<string, (...args: any[]) => any>;

function setup() {
    initialize();
    handlers = Object.fromEntries(
        handleMock().map(([name, callback]: [string, (...args: any[]) => any]) => [name, callback])
    );
    commands = Object.fromEntries(
        onMock().map(([name, callback]: [string, (...args: any[]) => any]) => [name, callback])
    );
}

describe('main/ipc', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        init.win = mockWin;
        mockWin.webContents = webContents;
        mockWin.isDestroyed.mockReturnValue(false);
        mockWin.isMaximized.mockReturnValue(false);
        (app.setLoginItemSettings as jest.Mock).mockClear();
        setup();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('only trusts the main window webContents while it is alive', () => {
        expect(isTrustedSender(trustedEvent)).toBe(true);
        expect(isTrustedSender(untrustedEvent)).toBe(false);

        mockWin.isDestroyed.mockReturnValue(true);
        expect(isTrustedSender(trustedEvent)).toBe(false);

        init.win = undefined;
        expect(isTrustedSender(trustedEvent)).toBe(false);
    });

    it('rejects request channels for untrusted senders', async () => {
        const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

        await expect(handlers['activeWin'](untrustedEvent)).rejects.toThrow(
            'Blocked IPC from an untrusted sender'
        );
        expect(consoleWarn).toHaveBeenCalledWith(
            '[ipc] blocked a message from an untrusted sender'
        );
    });

    it('drops one-way commands from untrusted senders', () => {
        const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

        commands['openExternal'](untrustedEvent, 'https://example.com');

        expect(consoleWarn).toHaveBeenCalledWith(
            '[ipc] blocked a command from an untrusted sender'
        );
    });

    it('validates arguments before invoking the handler', async () => {
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

        await expect(handlers['saveScreenshot'](trustedEvent, 'not-a-data-url')).rejects.toThrow(
            TypeError
        );
        expect(saveScreenshot).not.toHaveBeenCalled();
        expect(consoleError).toHaveBeenCalled();
    });

    it('forwards valid arguments and returns the handler result', async () => {
        (saveScreenshot as jest.Mock).mockResolvedValue('/tmp/shot.jpg');
        const dataUrl = 'data:image/jpeg;base64,AA==';

        await expect(handlers['saveScreenshot'](trustedEvent, dataUrl)).resolves.toBe(
            '/tmp/shot.jpg'
        );
        expect(saveScreenshot).toHaveBeenCalledWith(dataUrl);
    });

    it('applies the tray menu through the init helpers', async () => {
        const items = [{ key: 'focus', label: 'Focus', enabled: true } as any];

        await handlers['setTrayMenu'](trustedEvent, items);

        expect(setMenuItems).toHaveBeenCalledWith(items);
    });

    it('toggles window size and taskbar state for the mini bar', async () => {
        await handlers['minimizeWindow'](trustedEvent, true);

        expect(mockWin.setAlwaysOnTop).toHaveBeenCalledWith(true);
        expect(setSkipTaskbar).toHaveBeenCalledWith(true);
        expect(mockWin.setContentSize).toHaveBeenCalledWith(200, 90);

        await handlers['minimizeWindow'](trustedEvent, false);
        expect(mockWin.setContentSize).toHaveBeenLastCalledWith(1440, 960);
    });

    it('handles the caption window actions', async () => {
        await handlers['windowAction'](trustedEvent, 'minimize');
        expect(mockWin.minimize).toHaveBeenCalled();

        await handlers['windowAction'](trustedEvent, 'maximize');
        expect(mockWin.maximize).toHaveBeenCalled();

        mockWin.isMaximized.mockReturnValue(true);
        await handlers['windowAction'](trustedEvent, 'maximize');
        expect(mockWin.unmaximize).toHaveBeenCalled();

        await handlers['windowAction'](trustedEvent, 'close');
        expect(mockWin.close).toHaveBeenCalled();
    });

    it('starts and stops the maximized title bar drag', async () => {
        await handlers['windowDrag'](trustedEvent, 'start');
        expect(startWindowDrag).toHaveBeenCalledWith(mockWin);

        await handlers['windowDrag'](trustedEvent, 'end');
        expect(stopWindowDrag).toHaveBeenCalled();
    });

    it('returns the capture source belonging to the display that hosts the window', async () => {
        (screen.getDisplayMatching as jest.Mock).mockReturnValue({ id: 7 });
        (desktopCapturer.getSources as jest.Mock).mockResolvedValue([
            { id: 'other', display_id: '3' },
            { id: 'screen:7:0', display_id: 7 },
        ]);

        await expect(handlers['desktopSource'](trustedEvent)).resolves.toEqual({
            id: 'screen:7:0',
            display_id: 7,
        });

        (desktopCapturer.getSources as jest.Mock).mockResolvedValue([]);
        await expect(handlers['desktopSource'](trustedEvent)).resolves.toBeUndefined();
    });

    it('reports the current maximized state when asked', async () => {
        await expect(handlers['windowState'](trustedEvent)).resolves.toEqual({ maximized: false });
        mockWin.isMaximized.mockReturnValue(true);
        await expect(handlers['windowState'](trustedEvent)).resolves.toEqual({ maximized: true });
    });

    it('registers the login item with the requested visibility', async () => {
        await handlers['openAtLogin'](trustedEvent, true);
        expect(app.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: true });

        await handlers['openAtLogin'](trustedEvent, false);
        expect(app.setLoginItemSettings).toHaveBeenLastCalledWith({ openAtLogin: false });
    });

    it('registers commands with the same sender guard', () => {
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
        const callback = jest.fn();

        handleCommand('test-command', callback, [
            (value) => {
                if (value !== 'ok') {
                    throw new TypeError('bad value');
                }
            },
        ]);
        const channel = onMock().find(([name]: [string]) => name === 'test-command')![1];

        channel(trustedEvent, 'ok');
        expect(callback).toHaveBeenCalledWith('ok');

        channel(trustedEvent, 'bad');
        expect(callback).toHaveBeenCalledTimes(1);
        expect(consoleError).toHaveBeenCalled();
    });

    describe('crash reports and logging', () => {
        const payload = {
            kind: 'react' as const,
            message: 'boom',
            timestamp: '2026-01-01T00:00:00.000Z',
            href: 'file:///app/index.html',
        };

        function report(value: unknown) {
            commands['reportError'](trustedEvent, value);
        }

        it('writes the report to crash.log and makes the window readable again', () => {
            report({ ...payload, scope: 'timer', stack: 'Error: boom\n    at x', tab: 'timer' });

            expect(log).toHaveBeenCalledTimes(1);
            const [scope, level, message] = (log as jest.Mock).mock.calls[0];
            expect(scope).toBe('crash');
            expect(level).toBe('error');
            expect(message).toContain('renderer react (timer): boom');
            expect(message).toContain('tab=timer');
            expect(init.restoreWindowForError).toHaveBeenCalled();
        });

        it('prints how many occurrences an aggregated report stands for', () => {
            report({ ...payload, count: 7 });

            const [, , message] = (log as jest.Mock).mock.calls[0];
            // The renderer folds a repeating failure into one line per minute,
            // so the line has to carry the number it hides.
            expect(message).toContain('renderer react: boom (x7)');
        });

        it('refuses an oversized or malformed report without writing anything', () => {
            const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

            report({ ...payload, message: 'x'.repeat(4097) });
            report({ ...payload, kind: 'not-a-kind' });
            report({ ...payload, stack: 42 });
            report({ ...payload, count: 0 });

            expect(log).not.toHaveBeenCalled();
            expect(init.restoreWindowForError).not.toHaveBeenCalled();
            expect(consoleError).toHaveBeenCalled();
        });

        it('drops a report from an untrusted sender', () => {
            const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

            commands['reportError'](untrustedEvent, payload);

            expect(log).not.toHaveBeenCalled();
            expect(consoleWarn).toHaveBeenCalledWith(
                '[ipc] blocked a command from an untrusted sender'
            );
        });

        it('applies a new log level immediately and rejects an unknown one', () => {
            const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

            commands['setLogLevel'](trustedEvent, 'debug');
            expect(configureLogging).toHaveBeenCalledWith({ level: 'debug' });

            commands['setLogLevel'](trustedEvent, 'verbose');
            expect(configureLogging).toHaveBeenCalledTimes(1);
            expect(consoleError).toHaveBeenCalled();
        });

        it('exposes the log folder and session id to the renderer', async () => {
            await expect(handlers['logInfo'](trustedEvent)).resolves.toEqual({
                dir: '/tmp/logs',
                sessionId: 'sid123',
            });
        });
    });

    describe('user file cleanup', () => {
        it('marks the completion of a delete-all in data.log', async () => {
            await handlers['clearUserFiles'](trustedEvent);

            expect(clearUserFiles).toHaveBeenCalled();
            // The tables are cleared from the renderer, so this is the only
            // trace of the deletion on the main-process side.
            expect(log).toHaveBeenCalledWith('data', 'info', 'all user data cleared');
        });
    });

    describe('data transfer', () => {
        const emptyData = { records: [], cards: {}, lists: {}, boards: {}, move: [] };
        const tempFiles: string[] = [];

        function tempFile(name: string, content?: string) {
            const file = path.join(tmpdir(), `pomodoro-ipc-${process.pid}-${name}.json`);
            tempFiles.push(file);
            if (content !== undefined) {
                writeFileSync(file, content, 'utf8');
            }
            return file;
        }

        afterAll(() => {
            for (const file of tempFiles) {
                rmSync(file, { force: true });
            }
        });

        it('cancels the export without reading or writing data', async () => {
            (dialog.showSaveDialog as jest.Mock).mockResolvedValue({ canceled: true });

            await expect(handlers['exportData'](trustedEvent)).resolves.toEqual({
                status: 'cancelled',
            });
            expect(readAllData).not.toHaveBeenCalled();
        });

        it('writes an export with its header and returns its metadata', async () => {
            const file = tempFile('export');
            (dialog.showSaveDialog as jest.Mock).mockResolvedValue({
                canceled: false,
                filePath: file,
            });
            (readAllData as jest.Mock).mockResolvedValue(emptyData);

            const result = await handlers['exportData'](trustedEvent);

            expect(result.status).toBe('written');
            expect(result.filePath).toBe(file);
            const written = JSON.parse(readFileSync(file, 'utf8'));
            expect(written).toMatchObject({
                format: 'pomodoro-logger-export',
                version: 1,
                data: emptyData,
            });
            expect(result.meta.exportedAt).toBe(written.exportedAt);
            expect(result.meta.exportedAtText).toBe(written.exportedAtText);
        });

        it('cancels the import when the picker returns no file', async () => {
            (dialog.showOpenDialog as jest.Mock).mockResolvedValue({
                canceled: false,
                filePaths: [],
            });

            await expect(handlers['importData'](trustedEvent)).resolves.toEqual({
                status: 'cancelled',
            });
        });

        it('reports a file that is not valid JSON instead of touching the database', async () => {
            const file = tempFile('broken', '{ nope');
            (dialog.showOpenDialog as jest.Mock).mockResolvedValue({
                canceled: false,
                filePaths: [file],
            });

            const result = await handlers['importData'](trustedEvent);

            expect(result.status).toBe('invalid');
            expect(result.issues[0].message).toContain('not valid JSON');
            expect(writeAllFile).not.toHaveBeenCalled();
            // The dialog shows one line; data.log keeps the parser's own
            // message, which is what says where the file broke.
            expect(log).toHaveBeenCalledWith(
                'data',
                'warn',
                expect.stringContaining('import refused (not JSON)'),
                expect.stringContaining('JSON')
            );
        });

        it('refuses a JSON file that is not a data export', async () => {
            const file = tempFile('wrong', JSON.stringify({ hello: 'world' }));
            (dialog.showOpenDialog as jest.Mock).mockResolvedValue({
                canceled: false,
                filePaths: [file],
            });

            const result = await handlers['importData'](trustedEvent);

            expect(result.status).toBe('invalid');
            expect(result.issues.length).toBeGreaterThan(0);
            expect(writeAllFile).not.toHaveBeenCalled();

            const call = (log as jest.Mock).mock.calls.find(([scope]) => scope === 'data');
            expect(call?.[2]).toContain('import refused (validation)');
            expect(call?.[2]).toContain('wrong.json');
            // The whole list, not the shortened one the dialog shows.
            expect(call?.[3]).toContain('records');
        });

        it('merges a valid import and returns the summary counts', async () => {
            const file = tempFile('valid', JSON.stringify(emptyData));
            (dialog.showOpenDialog as jest.Mock).mockResolvedValue({
                canceled: false,
                filePaths: [file],
            });
            (readAllData as jest.Mock).mockResolvedValue(emptyData);
            (sendWorkerMessage as jest.Mock).mockResolvedValue({
                payload: { merged: emptyData, rehomed: [] },
            });

            const result = await handlers['importData'](trustedEvent);

            expect(result).toEqual({
                status: 'imported',
                summary: {
                    counts: {
                        cardsOutsideLists: 0,
                        deadMoves: 0,
                        danglingSessions: 0,
                        unknownBoard: 0,
                        noBoard: 0,
                        rehomed: 0,
                    },
                },
                meta: {},
            });
            expect(sendWorkerMessage).toHaveBeenCalledWith({
                type: expect.any(String),
                payload: { external: emptyData, source: emptyData },
            });
            expect(writeAllFile).toHaveBeenCalledWith(emptyData);

            const call = (log as jest.Mock).mock.calls.find(([scope]) => scope === 'data');
            expect(call?.[1]).toBe('info');
            expect(call?.[2]).toContain('import completed');
            expect(call?.[2]).toContain('orphanCards=0');
            expect(call?.[2]).toContain('rehomed=0');
        });

        it('writes the unknown-project groups to data.log', async () => {
            const file = tempFile('unknown', JSON.stringify(emptyData));
            (dialog.showOpenDialog as jest.Mock).mockResolvedValue({
                canceled: false,
                filePaths: [file],
            });
            (readAllData as jest.Mock).mockResolvedValue(emptyData);
            (sendWorkerMessage as jest.Mock).mockResolvedValue({
                payload: {
                    merged: {
                        ...emptyData,
                        records: [
                            {
                                _id: 'r1',
                                apps: {},
                                spentTimeInHour: 0.5,
                                switchTimes: 0,
                                startTime: 1000,
                            },
                            {
                                _id: 'r2',
                                apps: {},
                                spentTimeInHour: 0.25,
                                switchTimes: 0,
                                startTime: 2000,
                                boardId: 'gone',
                            },
                        ],
                    },
                    rehomed: [],
                },
            });

            const result = await handlers['importData'](trustedEvent);

            expect(result.status).toBe('imported');
            if (result.status !== 'imported') {
                return;
            }
            expect(result.summary.counts.noBoard).toBe(1);
            expect(result.summary.counts.unknownBoard).toBe(1);

            const calls = (log as jest.Mock).mock.calls.filter(([scope]) => scope === 'data');
            const headline = calls.find(([, , message]) =>
                String(message).includes('import completed')
            );
            expect(headline?.[2]).toContain('noBoard=1');
            expect(headline?.[2]).toContain('unknownBoard=1');

            const noProject = calls.find(([, , message]) =>
                String(message).includes('unknown projects - no project')
            );
            expect(noProject?.[2]).toContain('(1)');
            expect(noProject?.[3]).toContain('session=r1');

            const deletedBoard = calls.find(([, , message]) =>
                String(message).includes('unknown projects - deleted board')
            );
            expect(deletedBoard?.[2]).toContain('(1)');
            expect(deletedBoard?.[3]).toContain('session=r2');
            expect(deletedBoard?.[3]).toContain('board=gone');
        });

        it('returns the selected wallpaper path or nothing when cancelled', async () => {
            (dialog.showOpenDialog as jest.Mock).mockResolvedValueOnce({
                canceled: false,
                filePaths: ['C:\\wallpapers\\one.png'],
            });

            await expect(handlers['selectWallpaper'](trustedEvent)).resolves.toBe(
                'C:\\wallpapers\\one.png'
            );

            (dialog.showOpenDialog as jest.Mock).mockResolvedValueOnce({
                canceled: true,
                filePaths: [],
            });
            await expect(handlers['selectWallpaper'](trustedEvent)).resolves.toBeUndefined();
        });
    });
});
