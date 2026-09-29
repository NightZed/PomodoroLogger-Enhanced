/**
 * Whether a session exists -- the timer is running, or it is paused with time
 * left (`stopTimer` keeps `targetTime`, see the reducer in `action.ts`).
 *
 * This is the single predicate the three window layouts and the mode-switch
 * guard share, so "the buttons say Finish" and "the mode cannot be switched"
 * can never disagree again. It must never be derived from `Timer.state.percent`:
 * that value is committed in 2% steps (see `Timer.updateLeftTime`), so it stays
 * 0 during the first 2% of a session -- 30 seconds of a 25 minute focus session
 * -- and such a check answers "no session" for a session that plainly exists,
 * which used to let Tab silently drop a session that had just been paused.
 */
export function hasSession(isRunning: boolean, targetTime?: number): boolean {
    // `Boolean` rather than `!= null`: a stray 0/NaN counts as "no session",
    // which is how the layouts have always read the value.
    return isRunning || Boolean(targetTime);
}
