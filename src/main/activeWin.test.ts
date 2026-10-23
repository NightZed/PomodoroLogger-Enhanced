import { existsSync, readFileSync, unlinkSync } from 'fs';
import path from 'path';
import { dbBaseDir } from './config';

// get-windows is ESM-only and loads a native addon; jest runs in plain Node,
// so the module is replaced by a controllable stub.
jest.mock('get-windows', () => ({ activeWindow: jest.fn() }));

const statusLogPath = path.join(dbBaseDir, 'active-win.log');

type ActiveWinModule = typeof import('./activeWin');

/**
 * Loads a fresh copy of the module for each test: `available` is module state
 * that must not leak between the success and the failure case.
 */
function loadModule(): { activeWindowMock: jest.Mock } & ActiveWinModule {
    jest.resetModules();
    const { activeWindow: activeWindowMock } = require('get-windows') as {
        activeWindow: jest.Mock;
    };
    const activeWinModule = require('./activeWin') as ActiveWinModule;
    return Object.assign({ activeWindowMock }, activeWinModule);
}

describe('get-windows status log', () => {
    let consoleError: jest.SpyInstance;

    beforeEach(() => {
        if (existsSync(statusLogPath)) {
            unlinkSync(statusLogPath);
        }
        // The failed-init test exercises the error path; the log file, not the
        // console, is what it asserts.
        consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        consoleError.mockRestore();
    });

    it('records a successful init so packaged runs can be verified', async () => {
        const { activeWindowMock, initActiveWin, activeWin } = loadModule();
        const result = { title: 'editor', owner: { name: 'Code' } };
        activeWindowMock.mockResolvedValue(result);

        await initActiveWin();

        expect(activeWindowMock).toHaveBeenNthCalledWith(1, {
            screenRecordingPermission: false,
            accessibilityPermission: false,
        });
        expect(activeWindowMock).toHaveBeenNthCalledWith(2, {
            screenRecordingPermission: true,
            accessibilityPermission: true,
        });
        expect(await activeWin()).toEqual(result);
        // The decisive line when activity data is missing: a packaged build
        // with `available=false` records nothing at all.
        expect(readFileSync(statusLogPath, 'utf8')).toContain(
            'initialized: backend=get-windows, available=true, titlePermission=true'
        );
    });

    it('explains a failed init instead of recording empty sessions silently', async () => {
        const { activeWindowMock, initActiveWin, activeWin } = loadModule();
        activeWindowMock.mockRejectedValue(new Error("Cannot find module '@mapbox/node-pre-gyp'"));

        await initActiveWin();

        expect(await activeWin()).toBeUndefined();
        const log = readFileSync(statusLogPath, 'utf8');
        expect(log).toContain("init failed: Error: Cannot find module '@mapbox/node-pre-gyp'");
        expect(log).toContain(
            'initialized: backend=get-windows, available=false, titlePermission=false'
        );
        expect(log).toContain('skipped: get-windows is unavailable');
    });

    it('keeps one failing poll from breaking the renderer and logs it once', async () => {
        const { activeWindowMock, initActiveWin, activeWin } = loadModule();
        activeWindowMock.mockResolvedValue({});
        await initActiveWin();

        activeWindowMock.mockRejectedValue(new Error('access is denied'));
        expect(await activeWin()).toBeUndefined();
        expect(await activeWin()).toBeUndefined();

        const log = readFileSync(statusLogPath, 'utf8');
        expect(log).toContain('get-windows call failed: Error: access is denied');
        expect(log.match(/get-windows call failed/g)).toHaveLength(1);
    });
});
