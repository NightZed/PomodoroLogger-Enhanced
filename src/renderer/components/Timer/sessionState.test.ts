import { hasSession } from './sessionState';

describe('hasSession', () => {
    it('is true while the timer is running', () => {
        expect(hasSession(true, undefined)).toBe(true);
        expect(hasSession(true, 1560000000000)).toBe(true);
    });

    it('stays true while a paused session still has time left', () => {
        // Pausing keeps `targetTime`, which is what makes the Finish button and
        // the mode-switch guard agree at any point of a session.
        expect(hasSession(false, 1560000000000)).toBe(true);
    });

    it('is false only once the session was cleared or finished', () => {
        expect(hasSession(false, undefined)).toBe(false);
        expect(hasSession(false, 0)).toBe(false);
    });
});
