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
    setMenuItems: jest.fn(),
    setSkipTaskbar: jest.fn(),
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
    loadKnnModel: jest.fn(),
    saveKnnModel: jest.fn(),
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
import { saveScreenshot } from '../userFiles';
import { startWindowDrag, stopWindowDrag } from './windowDrag';
import { readAllData } from '../io/read';
import { writeAllFile } from '../io/write';
import { sendWorkerMessage } from '../worker/fork';

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
        });

        it('merges a valid import and returns the merge warnings per line', async () => {
            const file = tempFile('valid', JSON.stringify(emptyData));
            (dialog.showOpenDialog as jest.Mock).mockResolvedValue({
                canceled: false,
                filePaths: [file],
            });
            (readAllData as jest.Mock).mockResolvedValue(emptyData);
            (sendWorkerMessage as jest.Mock).mockResolvedValue({
                payload: { merged: emptyData, warning: 'lost a card\n\nlost a list\n' },
            });

            const result = await handlers['importData'](trustedEvent);

            expect(result).toEqual({
                status: 'imported',
                warnings: [
                    { path: 'merge', message: 'lost a card' },
                    { path: 'merge', message: 'lost a list' },
                ],
                meta: {},
            });
            expect(sendWorkerMessage).toHaveBeenCalledWith({
                type: expect.any(String),
                payload: { external: emptyData, source: emptyData },
            });
            expect(writeAllFile).toHaveBeenCalledWith(emptyData);
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
