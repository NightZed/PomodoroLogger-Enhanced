import { shouldBlockQuit } from './quitGuard';

describe('shouldBlockQuit', () => {
    it('refuses while a finished session awaits confirmation', () => {
        expect({ blocked: shouldBlockQuit(true, true) }).toEqual({ blocked: true });
    });

    it('lets the quit through once the session is confirmed', () => {
        expect({ blocked: shouldBlockQuit(false, true) }).toEqual({ blocked: false });
    });

    it('never blocks a quit whose window is already gone', () => {
        // `InstallUpdate` clears the window reference before handing over to
        // electron-updater; a refusal here would keep the process alive with
        // nothing on screen.
        expect({ blocked: shouldBlockQuit(true, false) }).toEqual({ blocked: false });
    });
});
