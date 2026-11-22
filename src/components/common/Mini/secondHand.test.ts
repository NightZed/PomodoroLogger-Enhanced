import {
    DEGREES_PER_SECOND,
    SECOND_HAND_START,
    SecondHandState,
    advanceSecondHand,
    isSecondHandVisible,
} from './secondHand';

/** Feed a sequence of countdown values and collect the angle painted each time. */
const walk = (values: (number | undefined)[]): (number | undefined)[] => {
    let state: SecondHandState = SECOND_HAND_START;
    return values.map((value) => {
        const next = advanceSecondHand(state, value);
        state = next.state;
        return next.angle;
    });
};

describe('advanceSecondHand', () => {
    it('starts a round at 12 o clock', () => {
        expect(walk([125])).toEqual([0]);
    });

    it('adds one tick per elapsed second', () => {
        expect(walk([125, 124, 123])).toEqual([0, DEGREES_PER_SECOND, DEGREES_PER_SECOND * 2]);
    });

    // Regression: `secondsLeft % 60 * 6` walked counter-clockwise, and the
    // minute wrap (354deg -> 0deg) was interpolated by the CSS transition as a
    // full clockwise sweep -- the "spin then walk backwards" report. The
    // cumulative angle must keep growing across the wrap.
    it('keeps growing across the minute wrap', () => {
        expect(walk([65, 60, 59])).toEqual([0, DEGREES_PER_SECOND * 5, DEGREES_PER_SECOND * 6]);
    });

    it('advances by the whole gap when renders are throttled', () => {
        expect(walk([125, 122])).toEqual([0, DEGREES_PER_SECOND * 3]);
    });

    it('holds the detent while the value repeats (paused)', () => {
        expect(walk([125, 124, 124, 124, 123])).toEqual([
            0,
            DEGREES_PER_SECOND,
            DEGREES_PER_SECOND,
            DEGREES_PER_SECOND,
            DEGREES_PER_SECOND * 2,
        ]);
    });

    it('snaps back to 12 o clock when the countdown jumps up for a new round', () => {
        expect(walk([125, 120, 300, 299])).toEqual([
            0,
            DEGREES_PER_SECOND * 5,
            0,
            DEGREES_PER_SECOND,
        ]);
    });

    it('drops the hand and the bookkeeping when the countdown disappears', () => {
        expect(walk([125, 124, undefined])).toEqual([0, DEGREES_PER_SECOND, undefined]);
        // The next round starts clean even if it begins at the same value.
        expect(walk([125, 124, undefined, 124])[3]).toBe(0);
    });
});

describe('isSecondHandVisible', () => {
    it('shows for a running or paused session', () => {
        expect(isSecondHandVisible(false, true, 125)).toBe(true);
    });

    it('hides in every other state', () => {
        expect({
            confirming: isSecondHandVisible(true, true, undefined),
            noSession: isSecondHandVisible(false, false, undefined),
            noCountdown: isSecondHandVisible(false, true, undefined),
        }).toEqual({ confirming: false, noSession: false, noCountdown: false });
    });
});
