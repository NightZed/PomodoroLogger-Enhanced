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
    /**
     * The remaining wall-clock ms frozen by `pauseTimer` (see the reducer in
     * `action.ts`). `targetTime` is NOT rewritten while paused, so against the
     * moving wall clock it goes stale -- this snapshot is the remainder the
     * pause actually left, and what `continueTimer` re-anchors on resume.
     */
    leftTime?: number;
}

/**
 * Whether a session exists -- the timer is running, or it is paused with time
 * left (`pauseTimer` keeps `targetTime`, see the reducer in `action.ts`).
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
 * Whether a focus session is still too young for the Finish button.
 *
 * The limit comes from `Setting.minFinishDuration` (set on the settings page,
 * default 10 minutes) and only guards focus sessions -- breaks are finished
 * without asking, see `Timer.onFinishButtonClick`. `0` turns it off, which
 * this comparison answers anyway: a non-negative elapsed time is never below
 * zero, so "no minimum" needs no special case at the call site.
 *
 * `>=` passes, i.e. a session that has run exactly the configured minimum can
 * be finished; that is the boundary the old hard coded `eTime < 600` had.
 */
export function isFinishTooEarly(elapsedSeconds: number, minFinishSeconds: number): boolean {
    return elapsedSeconds < minFinishSeconds;
}

/**
 * The minimum that actually applies to a session: never longer than the focus
 * session it guards (`Setting.focusDuration`).
 *
 * A longer minimum cannot be reached -- the session ends by itself before it,
 * and the elapsed time cannot overshoot the focus duration any more (it is
 * frozen while the clock is paused, see `sessionRemainingMs`), so the focus
 * duration wins. The stored setting is
 * deliberately NOT rewritten when that happens: it is the user's intention,
 * which applies again once the focus duration allows it. Both the Finish guard
 * and the settings page therefore clamp on read, through this one function.
 */
export function effectiveMinFinishDuration(
    minFinishSeconds: number,
    focusDurationSeconds: number
): number {
    return Math.min(minFinishSeconds, focusDurationSeconds);
}

/**
 * The focused time a session has actually produced -- the value the Finish
 * guard compares with the minimum.
 *
 * `Timer.getElapsedTimeInSecond()` is `focusDuration - remaining`, which
 * rewinds by the minutes the ending mask's +5/+10 extension added: an
 * extension only grows `remaining`, never the duration. The finished record
 * counts those minutes though (`Timer.onSessionConfirmed` adds
 * `extendedTimeInMinute` back into `spentTimeInHour`), so this undoes the
 * rewind and puts the guard on the same footing as the statistics -- without
 * it, Finish would be refused right after extending although the session has
 * already focused longer than the minimum.
 */
export function focusedSeconds(elapsedSeconds: number, extendedMinutes: number): number {
    return elapsedSeconds + extendedMinutes * 60;
}

/**
 * Raw wall-clock milliseconds left on the session at `now`.
 *
 * While the timer runs this is the plain `targetTime - now`. While it is
 * PAUSED, `targetTime` is stale -- it keeps its pre-pause value while the wall
 * clock moves on -- so the raw difference would keep shrinking (and go
 * negative) for as long as the pause lasts, reporting paused time as elapsed.
 * That "paused-clock quirk" let a Finish after a long pause pass the
 * minimum-time guard and even write the paused minutes into a rotten record's
 * `spentTimeInHour`. `pauseTimer` freezes the true remainder into `leftTime`;
 * that is what a paused session answers with, so the clock reads frozen until
 * `continueTimer` re-anchors `targetTime` on resume.
 *
 * The consumer is `Timer.getElapsedTimeInSecond` (the Finish guard and the
 * rotten record). The countdown display does not need it: `updateLeftTime`
 * already refuses to tick while `isRunning` is false.
 *
 * (Named `sessionRemainingMs`, not `rawRemainingMs`, so it cannot shadow the
 * `rawRemainingMs` *parameter* of the three dev-clock helpers below.)
 */
export function sessionRemainingMs(timer: SessionState, now: number): number {
    if (timer.isRunning) {
        return timer.targetTime != null ? timer.targetTime - now : 0;
    }

    if (timer.leftTime != null) {
        return timer.leftTime;
    }

    // Defensive: a paused session normally always has `leftTime` (`pauseTimer`
    // sets it whenever `targetTime` exists), so this only covers a foreign or
    // stale state shape -- answer with the wall clock rather than invent one.
    return timer.targetTime != null ? timer.targetTime - now : 0;
}

/**
 * The clock side of the dev time scale (see `timeScale` in `config.ts`).
 *
 * `TimerState.targetTime` counts down in WALL time: outside production the
 * whole span is compressed by `DEBUG_TIME_SCALE`, so a 25 minute session ends
 * after 12.5 seconds. Everything the user configured -- durations, the Finish
 * minimum, the statistics -- is NOMINAL time. The three functions below are
 * the one place where a raw `targetTime - now` span becomes a nominal value,
 * so the countdown, the progress ring and the Finish guard cannot drift apart
 * again; they used to divide the compressed span by the nominal duration
 * directly, which pinned the dev progress ring at ~99% and made a fresh
 * session look almost fully elapsed the moment it started. `scale` is passed
 * in explicitly (production passes 1), keeping these helpers pure.
 */

/** Nominal seconds left on the clock, rounded to the nearest second. */
export function countdownSeconds(rawRemainingMs: number, scale: number): number {
    return Math.floor((rawRemainingMs * scale) / 1000 + 0.5);
}

/**
 * How much of a session of `totalSeconds` -- the nominal duration plus any
 * extension already applied -- is behind us, from 0% at the start to 100%
 * when the clock runs out.
 */
export function progressPercent(
    rawRemainingMs: number,
    scale: number,
    totalSeconds: number
): number {
    return 100 - (rawRemainingMs * scale) / 10 / totalSeconds;
}

/** Nominal seconds a session of `durationSeconds` has been running. */
export function elapsedSeconds(
    rawRemainingMs: number,
    scale: number,
    durationSeconds: number
): number {
    return durationSeconds - countdownSeconds(rawRemainingMs, scale);
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
        type -- exactly what Stop does). */
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
