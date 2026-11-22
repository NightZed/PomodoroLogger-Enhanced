/**
 * Cumulative second-hand angle for the mini strip's dial.
 *
 * The countdown prop DECREASES, and `secondsLeft % 60 * 6deg` would walk
 * counter-clockwise; worse, each minute wrap (0deg -> 354deg) was interpolated
 * by the CSS transition as a full clockwise sweep -- the "spin then walk
 * backwards" bug. The hand therefore starts at 12 o'clock and adds 6deg per
 * elapsed second: the dial position is the same modulo 60, but the rendered
 * angle never decreases.
 *
 * The state is two numbers plus the anchor:
 * - `last` is the countdown value seen on the previous render;
 * - `elapsed` counts seconds since the current round started;
 * - `base` is the value that round started at, kept only so the state is
 *   readable when debugging.
 *
 * A countdown that jumps UP by more than one tick means a new round (start,
 * mode switch, +5/+10 re-anchor), so the hand snaps back to 12 o'clock instead
 * of spinning forward from the old total. The same value repeated means a
 * paused or throttled render: the hand holds its detent.
 */
export interface SecondHandState {
    base: number | undefined;
    last: number | undefined;
    elapsed: number;
}

export const SECOND_HAND_START: SecondHandState = {
    base: undefined,
    last: undefined,
    elapsed: 0,
};

/** Degrees per second on a 60-tick dial. */
export const DEGREES_PER_SECOND = 6;

/**
 * The hand exists only for a running or paused session. Confirmation has its
 * own sweep, and without a session the dial is idle.
 */
export const isSecondHandVisible = (
    isConfirming: boolean,
    hasSession: boolean,
    secondsLeft: number | undefined
): boolean => !isConfirming && hasSession && secondsLeft !== undefined;

/**
 * Advance the state by one render and return the angle to paint (in degrees),
 * or `undefined` when the hand should not be mounted.
 *
 * Pure: the caller owns the state and replaces it with the returned one. A
 * `undefined` countdown resets the bookkeeping so the next round starts at
 * zero even if it begins at the same value.
 */
export const advanceSecondHand = (
    state: SecondHandState,
    secondsLeft: number | undefined
): { state: SecondHandState; angle: number | undefined } => {
    if (secondsLeft === undefined) {
        return { state: SECOND_HAND_START, angle: undefined };
    }

    const { last, elapsed } = state;

    if (last === undefined || secondsLeft > last + 1) {
        return {
            state: { base: secondsLeft, last: secondsLeft, elapsed: 0 },
            angle: 0,
        };
    }

    if (secondsLeft < last) {
        const next = {
            base: state.base ?? secondsLeft,
            last: secondsLeft,
            elapsed: elapsed + (last - secondsLeft),
        };
        return { state: next, angle: next.elapsed * DEGREES_PER_SECOND };
    }

    // Same value: paused, or a throttled render that did not move. Keep the
    // detent instead of resetting it.
    return { state: { ...state, last: secondsLeft }, angle: elapsed * DEGREES_PER_SECOND };
};

export const resetSecondHand = (): SecondHandState => SECOND_HAND_START;
