/**
 * Regression: the spent/left detail used to start on mouseenter and animate a
 * paint-only `clip-path` for 0.6s. Sweeping across a board card flipped it back
 * and forth on every crossing. It now waits for a 200ms dwell and snaps once.
 */
import * as React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { TIME_BADGE_HOVER_DELAY_MS, TimeBadge } from './Badge';

const transforms = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('clipPath path')).map((path) =>
        path.getAttribute('transform')
    );

describe('TimeBadge hover detail', () => {
    afterEach(cleanup);

    it('only reveals the spent/left detail after the pointer dwells', () => {
        jest.useFakeTimers();
        try {
            const { container } = render(<TimeBadge spentTime={1} leftTime={1} />);
            const svg = container.querySelector('svg')!;
            expect(transforms(container)).toEqual(['translate(0 0)', 'translate(0 0)']);

            fireEvent.mouseEnter(svg, { clientX: 10 });
            fireEvent.mouseMove(svg, { clientX: 10 });

            act(() => {
                jest.advanceTimersByTime(TIME_BADGE_HOVER_DELAY_MS - 1);
            });
            expect(transforms(container)).toEqual(['translate(0 0)', 'translate(0 0)']);

            act(() => {
                jest.advanceTimersByTime(1);
            });
            // Left quarter: show the spent half.
            expect(transforms(container)).toEqual(['translate(168 0)', 'translate(168 0)']);
        } finally {
            jest.useRealTimers();
        }
    });

    it('does not start the detail when the pointer only sweeps past', () => {
        jest.useFakeTimers();
        try {
            const { container } = render(<TimeBadge spentTime={1} leftTime={1} />);
            const svg = container.querySelector('svg')!;

            fireEvent.mouseEnter(svg, { clientX: 10 });
            fireEvent.mouseMove(svg, { clientX: 10 });
            act(() => {
                jest.advanceTimersByTime(TIME_BADGE_HOVER_DELAY_MS / 2);
            });
            fireEvent.mouseLeave(svg);
            act(() => {
                jest.advanceTimersByTime(TIME_BADGE_HOVER_DELAY_MS * 2);
            });

            expect(transforms(container)).toEqual(['translate(0 0)', 'translate(0 0)']);
        } finally {
            jest.useRealTimers();
        }
    });

    it('resets after leaving the badge', () => {
        jest.useFakeTimers();
        try {
            const { container } = render(<TimeBadge spentTime={1} leftTime={1} />);
            const svg = container.querySelector('svg')!;

            fireEvent.mouseEnter(svg, { clientX: 10 });
            act(() => {
                jest.advanceTimersByTime(TIME_BADGE_HOVER_DELAY_MS);
            });
            expect(transforms(container)).toEqual(['translate(168 0)', 'translate(168 0)']);

            fireEvent.mouseLeave(svg);
            act(() => {
                jest.advanceTimersByTime(110);
            });
            expect(transforms(container)).toEqual(['translate(0 0)', 'translate(0 0)']);
        } finally {
            jest.useRealTimers();
        }
    });
});
