import { shouldBlockQuit } from './quitGuard';

/** Keeps the failing input in the assertion value, so the message names it. */
function refusal(hasUnconfirmedSession: boolean, windowAlive: boolean) {
    return {
        hasUnconfirmedSession,
        windowAlive,
        blocked: shouldBlockQuit(hasUnconfirmedSession, windowAlive),
    };
}

describe('shouldBlockQuit', () => {
    it('refuses while a finished session awaits confirmation', () => {
        expect(refusal(true, true)).toEqual({
            hasUnconfirmedSession: true,
            windowAlive: true,
            blocked: true,
        });
    });

    it('lets the quit through once the session is confirmed', () => {
        expect(refusal(false, true)).toEqual({
            hasUnconfirmedSession: false,
            windowAlive: true,
            blocked: false,
        });
    });

    it('never blocks a quit whose window is already gone', () => {
        // `InstallUpdate` clears the window reference before handing over to
        // electron-updater; a refusal here would keep the process alive with
        // nothing on screen.
        expect(refusal(true, false)).toEqual({
            hasUnconfirmedSession: true,
            windowAlive: false,
            blocked: false,
        });
    });
});
