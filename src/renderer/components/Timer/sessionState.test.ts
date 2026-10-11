import {
    effectiveMinFinishDuration,
    focusedSeconds,
    hasSession,
    isFinishTooEarly,
    namedSessionAction,
    trayMenuItems,
    TrayActionKey,
    TrayMenuItem,
    TrayState,
} from './sessionState';

const state = (over: Partial<TrayState> = {}): TrayState => ({
    isRunning: false,
    isFocusing: true,
    targetTime: undefined,
    sessionEnding: false,
    ...over,
});

describe('hasSession', () => {
    it('is true while the timer is running', () => {
        expect(hasSession(state({ isRunning: true }))).toBe(true);
        expect(hasSession(state({ isRunning: true, targetTime: 1560000000000 }))).toBe(true);
    });

    it('stays true while a paused session still has time left', () => {
        // Pausing keeps `targetTime`, which is what makes the Finish button and
        // the mode-switch guard agree at any point of a session.
        expect(hasSession(state({ targetTime: 1560000000000 }))).toBe(true);
    });

    it('is false only once the session was cleared or finished', () => {
        expect(hasSession(state())).toBe(false);
        expect(hasSession(state({ targetTime: 0 }))).toBe(false);
    });
});

describe('isFinishTooEarly', () => {
    it('blocks a focus session that is younger than the configured minimum', () => {
        // The guard the settings page configures (`minFinishDuration`), which
        // used to be a hard coded 10 minutes in `Timer.onFinishButtonClick`.
        expect(isFinishTooEarly(0, 600)).toBe(true);
        expect(isFinishTooEarly(599, 600)).toBe(true);
    });

    it('lets a session finish once it reached the minimum, boundary included', () => {
        expect(isFinishTooEarly(600, 600)).toBe(false);
        expect(isFinishTooEarly(601, 600)).toBe(false);
    });

    it('never blocks when the minimum is 0', () => {
        // "Finish at any time" is the settings page's off switch; it must not
        // need a special case at the call site.
        expect(isFinishTooEarly(0, 0)).toBe(false);
        expect(isFinishTooEarly(1, 0)).toBe(false);
    });
});

describe('effectiveMinFinishDuration', () => {
    it('keeps a minimum that fits the focus session it guards', () => {
        expect(effectiveMinFinishDuration(5 * 60, 25 * 60)).toBe(5 * 60);
        // The focus session itself is a legal minimum: only the natural end of
        // the session can finish it then.
        expect(effectiveMinFinishDuration(25 * 60, 25 * 60)).toBe(25 * 60);
    });

    it('caps a minimum that is longer than the focus session', () => {
        // 30 minutes can never be reached before a 25 minute session ends by
        // itself, so the focus duration is what applies -- the stored setting
        // is not rewritten, it applies again once the focus duration allows it.
        expect(effectiveMinFinishDuration(30 * 60, 25 * 60)).toBe(25 * 60);
        // A 50 minute focus session allows a 40 minute minimum after all.
        expect(effectiveMinFinishDuration(40 * 60, 50 * 60)).toBe(40 * 60);
    });
});

describe('focusedSeconds', () => {
    it('is the plain elapsed time while the session was never extended', () => {
        expect(focusedSeconds(0, 0)).toBe(0);
        expect(focusedSeconds(5 * 60, 0)).toBe(5 * 60);
    });

    it('adds back the minutes the +5/+10 extension rewound the clock by', () => {
        // A 25 minute session extended by 5 on the ending mask: the elapsed
        // formula reports 25 - 5 = 20 minutes (the extension only grows
        // `remaining`), while the session really focused 25 -- the very value
        // `onSessionConfirmed` writes into `spentTimeInHour`.
        expect(focusedSeconds(20 * 60, 5)).toBe(25 * 60);
        // Extensions accumulate over several rounds of the ending mask: once
        // the second extension (+10 after the +5) runs out, the elapsed
        // formula is back at the full 25 minutes and the session has focused
        // 40 in total.
        expect(focusedSeconds(25 * 60, 5 + 10)).toBe(40 * 60);
    });
});

describe('namedSessionAction', () => {
    it('does nothing when the session it names is already running', () => {
        expect(namedSessionAction(state({ isRunning: true }), true)).toBe('nothing');
        expect(namedSessionAction(state({ isRunning: true, isFocusing: false }), false)).toBe(
            'nothing'
        );
    });

    it('refuses to replace a running session of the other type', () => {
        expect(namedSessionAction(state({ isRunning: true, isFocusing: false }), true)).toBe(
            'refuse'
        );
        expect(namedSessionAction(state({ isRunning: true }), false)).toBe('refuse');
    });

    it('resumes the named session while it is paused', () => {
        expect(namedSessionAction(state({ targetTime: 1560000000000 }), true)).toBe('resume');
        expect(
            namedSessionAction(state({ isFocusing: false, targetTime: 1560000000000 }), false)
        ).toBe('resume');
    });

    it('starts the named session when there is nothing to resume', () => {
        expect(namedSessionAction(state(), true)).toBe('start');
        expect(namedSessionAction(state({ isFocusing: false }), false)).toBe('start');
    });

    it('starts the named session instead of resuming the paused other one', () => {
        // The tray bug: a paused break was resumed under a warning when the user
        // asked for a focus session (and the other way round).
        expect(
            namedSessionAction(state({ isFocusing: false, targetTime: 1560000000000 }), true)
        ).toBe('start');
        expect(namedSessionAction(state({ targetTime: 1560000000000 }), false)).toBe('start');
    });
});

describe('trayMenuItems', () => {
    const menuOf = (timer: TrayState) => {
        const byKey: { [key: string]: TrayMenuItem } = {};
        trayMenuItems(timer).forEach((item) => (byKey[item.key] = item));
        return byKey as { [key in TrayActionKey]: TrayMenuItem };
    };

    it('opens both sessions while nothing is running and keeps the order', () => {
        expect(trayMenuItems(state()).map((item) => item.key)).toEqual([
            'startFocusing',
            'startBreak',
            'pauseOrContinue',
            'finish',
            'stop',
        ]);

        const menu = menuOf(state());
        expect(menu.startFocusing.enabled).toBe(true);
        expect(menu.startBreak.enabled).toBe(true);
        expect(menu.pauseOrContinue.enabled).toBe(false);
        expect(menu.finish.enabled).toBe(false);
        expect(menu.stop.enabled).toBe(false);
    });

    it('hands the running session over to its own entries', () => {
        const menu = menuOf(state({ isRunning: true }));
        expect(menu.startFocusing.enabled).toBe(false);
        expect(menu.startBreak.enabled).toBe(false);
        expect(menu.pauseOrContinue.label).toBe('Pause');
        expect(menu.pauseOrContinue.enabled).toBe(true);
        expect(menu.finish.enabled).toBe(true);
        expect(menu.stop.enabled).toBe(true);
    });

    it('offers Continue instead of Pause while the session is paused', () => {
        const menu = menuOf(state({ targetTime: 1560000000000 }));
        expect(menu.pauseOrContinue.label).toBe('Continue');
        expect(menu.pauseOrContinue.enabled).toBe(true);
        // Starting something else stays deliberate: the session owns itself.
        expect(menu.startFocusing.enabled).toBe(false);
        expect(menu.startBreak.enabled).toBe(false);
    });

    it('keeps the Start entries under the ending mask and greys the rest', () => {
        const menu = menuOf(
            state({ isFocusing: false, targetTime: 1560000000000, sessionEnding: true })
        );
        // The tray is the only channel that can confirm the finished session
        // without restoring the window.
        expect(menu.startFocusing.enabled).toBe(true);
        expect(menu.startBreak.enabled).toBe(true);
        // `targetTime` is still set under the mask, so Continue must not look
        // like it could resume the expired session.
        expect(menu.pauseOrContinue.enabled).toBe(false);
        expect(menu.finish.enabled).toBe(false);
        // The record is already waiting: Stop cannot throw it away.
        expect(menu.stop.enabled).toBe(false);
    });
});
