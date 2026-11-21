/**
 * Regression: the spent/left detail used to start on mouseenter and animate a
 * paint-only `clip-path` for 0.6s. Sweeping across a board card flipped it back
 * and forth on every crossing. It now waits for a 200ms dwell and snaps once.
 */
import * as React from 'react';
import { act, cleanup, render, renderHook } from '@testing-library/react';
import {
    TIME_BADGE_HOVER_DELAY_MS,
    TIME_BADGE_LEAVE_DELAY_MS,
    TimeBadge,
    halfAtOffset,
    resolveVisibleHalf,
    useHoverDwell,
} from './Badge';

afterEach(cleanup);

describe('TimeBadge content', () => {
    // Regression: a half used to be dropped by pixel width, which hid the
    // spent total whenever the remaining estimate was long.
    it('keeps both totals when the estimate dwarfs the spent time', () => {
        expect(resolveVisibleHalf(0.5, 22, 'default')).toBe('default');
    });

    it.each([
        ['spent time is missing', 0, 22, 'left'],
        ['nothing is left', 2, 0, 'spent'],
    ])('drops the remaining half when %s', (_label, spent, left, expected) => {
        expect(resolveVisibleHalf(spent, left, 'default')).toBe(expected);
    });

    it('follows the pointer while both halves have data', () => {
        expect({
            hoveringSpent: resolveVisibleHalf(1, 1, 'spent'),
            hoveringLeft: resolveVisibleHalf(1, 1, 'left'),
        }).toEqual({ hoveringSpent: 'spent', hoveringLeft: 'left' });
    });

    it('reveals the outer quarters and keeps the middle neutral', () => {
        expect({
            leftQuarter: halfAtOffset(10),
            middle: halfAtOffset(84),
            rightQuarter: halfAtOffset(160),
        }).toEqual({
            leftQuarter: 'spent',
            middle: 'default',
            rightQuarter: 'left',
        });
    });

    it('renders both formatted totals', () => {
        const { getByText } = render(<TimeBadge spentTime={0.5} leftTime={22} />);

        expect(getByText('00h 30m', { exact: false })).toBeTruthy();
        expect(getByText('22h 00m', { exact: false })).toBeTruthy();
    });
});

describe('TimeBadge hover detail', () => {
    // Regression: a sweep used to flip the detail on every move; it now waits
    // for a dwell before the pointer can switch halves.
    it('only reveals the detail after the pointer dwells', () => {
        jest.useFakeTimers();
        try {
            const { result } = renderHook(() => useHoverDwell());

            act(() => result.current.onEnter(10));
            act(() => {
                jest.advanceTimersByTime(TIME_BADGE_HOVER_DELAY_MS - 1);
            });
            expect(result.current.half).toBe('default');

            act(() => {
                jest.advanceTimersByTime(1);
            });
            expect(result.current.half).toBe('spent');
        } finally {
            jest.useRealTimers();
        }
    });

    it('ignores a pointer that only sweeps past', () => {
        jest.useFakeTimers();
        try {
            const { result } = renderHook(() => useHoverDwell());

            act(() => result.current.onEnter(10));
            act(() => {
                jest.advanceTimersByTime(TIME_BADGE_HOVER_DELAY_MS / 2);
            });
            act(() => result.current.onLeave());
            act(() => {
                jest.advanceTimersByTime(TIME_BADGE_HOVER_DELAY_MS * 2);
            });

            expect(result.current.half).toBe('default');
        } finally {
            jest.useRealTimers();
        }
    });

    it('resets after the pointer leaves', () => {
        jest.useFakeTimers();
        try {
            const { result } = renderHook(() => useHoverDwell());

            act(() => result.current.onEnter(10));
            act(() => {
                jest.advanceTimersByTime(TIME_BADGE_HOVER_DELAY_MS);
            });
            expect(result.current.half).toBe('spent');

            act(() => result.current.onLeave());
            act(() => {
                jest.advanceTimersByTime(TIME_BADGE_LEAVE_DELAY_MS);
            });
            expect(result.current.half).toBe('default');
        } finally {
            jest.useRealTimers();
        }
    });

    it('follows the pointer once the dwell has elapsed', () => {
        jest.useFakeTimers();
        try {
            const { result } = renderHook(() => useHoverDwell());

            act(() => result.current.onEnter(10));
            act(() => {
                jest.advanceTimersByTime(TIME_BADGE_HOVER_DELAY_MS);
            });

            act(() => result.current.onMove(84));
            expect(result.current.half).toBe('default');

            act(() => result.current.onMove(160));
            expect(result.current.half).toBe('left');
        } finally {
            jest.useRealTimers();
        }
    });
});
