/**
 * What the timer state means for the UI and for the "start the session I name"
 * commands.
 *
 * `TimerState` (see `action.ts`) is read through the small snapshot below, so
 * these predicates stay pure and unit testable; they used to be open coded in
 * the large `Timer` component, where the mode-switch guard, the three layouts
 * and the tray menu drifted apart one bug at a time.
 */
export interface SessionState {
    isRunning: boolean;
    isFocusing: boolean;
    targetTime?: number;
}

/**
 * Whether a session exists -- the timer is running, or it is paused with time
 * left (`stopTimer` keeps `targetTime`, see the reducer in `action.ts`).
 *
 * This is the single predicate the three window layouts and the mode-switch
 * guard share, so "the buttons say Finish" and "the mode cannot be switched" can
 * never disagree. It must never be derived from `Timer.state.percent`: that
 * value is committed in 2% steps (see `Timer.updateLeftTime`), so it stays 0
 * during the first 2% of a session -- 30 seconds of a 25 minute focus session --
 * and such a check answers "no session" for a session that plainly exists, which
 * used to let Tab silently drop a session that had just been paused.
 */
export function hasSession(timer: SessionState): boolean {
    // `Boolean` rather than `!= null`: a stray 0/NaN counts as "no session",
    // which is how the layouts have always read the value.
    return timer.isRunning || Boolean(timer.targetTime);
}

/**
 * What a "start the session I name" request must do to the current timer. The
 * callers are the two tray items (and the ending mask's own button), which name
 * the session they want in `wantsFocusing`.
 */
export type NamedSessionAction =
    /** That session already runs: nothing to do. */
    | 'nothing'
    /** The other one runs: refuse, a recording session is not thrown away. */
    | 'refuse'
    /** The named session is paused: pick it up where it stopped. */
    | 'resume'
    /** Nothing to resume: start the named session (the caller switches first
        when the mode differs, which discards a paused session of the other
        type -- exactly what Clear does). */
    | 'start';

/**
 * Decides the action above for the current state.
 *
 * `resume` and `start` are what a plain `!isRunning` fallback cannot tell apart:
 * with a *paused break* in the way, "Start Focusing" therefore used to resume
 * that break under a warning instead of starting the session the menu item
 * names.
 */
export function namedSessionAction(
    timer: SessionState,
    wantsFocusing: boolean
): NamedSessionAction {
    if (timer.isRunning) {
        return timer.isFocusing === wantsFocusing ? 'nothing' : 'refuse';
    }

    if (timer.isFocusing === wantsFocusing && hasSession(timer)) {
        return 'resume';
    }

    return 'start';
}

/** The timer state a tray menu is built from. */
export interface TrayState extends SessionState {
    /** The ending mask is up: a finished session awaits confirmation. */
    sessionEnding: boolean;
}

/** Identity of a tray entry; the owner maps it to the click handler. */
export type TrayActionKey = 'startFocusing' | 'startBreak' | 'pauseOrContinue' | 'finish' | 'stop';

export interface TrayMenuItem {
    key: TrayActionKey;
    label: string;
    /**
     * `false` renders the entry greyed out. A blocked action is greyed instead
     * of staying clickable with a toast: the tray menu is all the user sees
     * while the window is out of the way, so an entry that cannot do anything
     * must not look like it can -- and the entry that *can* solve the situation
     * (`Continue`, `Finish`, `Stop`) is right next to it.
     */
    enabled: boolean;
}

/**
 * The tray menu for the current state, in order.
 *
 * A session owns itself: while one exists (running, or paused with time left)
 * only its own entries are live -- `Pause`/`Continue`, `Finish` and `Stop` --
 * and the two Start entries are greyed, exactly like the Timer page, which
 * replaces its "Switch Mode" button with "Finish" at that point. Starting
 * something else stays possible the deliberate way: `Continue` it, `Finish` it,
 * or `Stop` it first.
 */
export function trayMenuItems(timer: TrayState): TrayMenuItem[] {
    // A session that is still worth acting on: running or paused, and not
    // already over. The ending mask keeps `targetTime` (see `onDone`), so
    // without this check a paused session would look alive under the mask.
    const liveSession = hasSession(timer) && !timer.sessionEnding;

    // Under the mask the tray is the only channel that can confirm the finished
    // session without restoring the window, so the Start entries stay live
    // there: they confirm it first and then start what they name (see
    // `Timer.confirmMaskAndStart`).
    const mayStart = !hasSession(timer) || timer.sessionEnding;

    return [
        { key: 'startFocusing', label: 'Start Focusing', enabled: mayStart },
        { key: 'startBreak', label: 'Start Break', enabled: mayStart },
        {
            key: 'pauseOrContinue',
            label: timer.isRunning ? 'Pause' : 'Continue',
            // Never under the mask: resuming a timer that already expired is
            // the ghost session the mask exists to prevent.
            enabled: liveSession,
        },
        { key: 'finish', label: 'Finish', enabled: liveSession },
        {
            key: 'stop',
            // Also disabled under the mask: the record is already written down
            // and waiting, so a "Stop" that cannot throw it away would lie.
            enabled: liveSession,
            label: 'Stop',
        },
    ];
}
