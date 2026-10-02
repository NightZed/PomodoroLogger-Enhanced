import { existsSync, readFileSync, unlinkSync } from 'fs';
import path from 'path';
import { dbBaseDir } from '../config';

// active-win loads a native addon; jest runs in plain Node, so the module is
// replaced by a controllable stub.
jest.mock('active-win', () => jest.fn());

const statusLogPath = path.join(dbBaseDir, 'active-win.log');

type ActiveWinModule = typeof import('./activeWin');

/**
 * Loads a fresh copy of the module for each test: `available` is module state
 * that must not leak between the success and the failure case.
 */
function loadModule(): { activeWinMock: jest.Mock } & ActiveWinModule {
    jest.resetModules();
    const activeWinMock = require('active-win') as jest.Mock;
    const activeWinModule = require('./activeWin') as ActiveWinModule;
    return Object.assign({ activeWinMock }, activeWinModule);
}

describe('active-win status log', () => {
    beforeEach(() => {
        if (existsSync(statusLogPath)) {
            unlinkSync(statusLogPath);
        }
    });

    it('records a successful init so packaged runs can be verified', async () => {
        const { activeWinMock, initActiveWin, activeWin } = loadModule();
        const result = { title: 'editor', owner: { name: 'Code' } };
        activeWinMock.mockResolvedValue(result);

        await initActiveWin();

        expect(await activeWin()).toEqual(result);
        // The decisive line when activity data is missing: a packaged build
        // with `available=false` records nothing at all.
        expect(readFileSync(statusLogPath, 'utf8')).toContain(
            'initialized: available=true, titlePermission=true'
        );
    });

    it('explains a failed init instead of recording empty sessions silently', async () => {
        const { activeWinMock, initActiveWin, activeWin } = loadModule();
        activeWinMock.mockRejectedValue(new Error("Cannot find module '@mapbox/node-pre-gyp'"));

        await initActiveWin();

        expect(await activeWin()).toBeUndefined();
        const log = readFileSync(statusLogPath, 'utf8');
        expect(log).toContain("init failed: Error: Cannot find module '@mapbox/node-pre-gyp'");
        expect(log).toContain('initialized: available=false, titlePermission=false');
        expect(log).toContain('skipped: active-win is unavailable');
    });

    it('keeps one failing poll from breaking the renderer and logs it once', async () => {
        const { activeWinMock, initActiveWin, activeWin } = loadModule();
        activeWinMock.mockResolvedValue({});
        await initActiveWin();

        activeWinMock.mockRejectedValue(new Error('access is denied'));
        expect(await activeWin()).toBeUndefined();
        expect(await activeWin()).toBeUndefined();

        const log = readFileSync(statusLogPath, 'utf8');
        expect(log).toContain('active-win call failed: Error: access is denied');
        expect(log.match(/active-win call failed/g)).toHaveLength(1);
    });
});
