import * as React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { HINT_STATIC_DELAY_MS, Hint } from './Hint';

/**
 * The two kinds differ only in when the overlay opens: a static label is a
 * sentence about a control and waits out the dwell, a live label carries data
 * that changes and must be readable on the first frame.
 */
describe('Hint', () => {
    afterEach(cleanup);

    const renderHint = (props: { label?: string; kind?: 'static' | 'live' }) => {
        render(
            <Hint {...props}>
                <button>gear</button>
            </Hint>
        );
        return screen.getByRole('button');
    };

    it('opens a live label in the event that enters the trigger', () => {
        const button = renderHint({ kind: 'live', label: '21:00 · 84%' });

        fireEvent.mouseEnter(button);

        expect(screen.getByText('21:00 · 84%')).toBeTruthy();
    });

    it('waits out the dwell before opening a static label', () => {
        jest.useFakeTimers();
        try {
            const button = renderHint({ label: 'Open settings' });

            fireEvent.mouseEnter(button);
            expect(screen.queryByText('Open settings')).toBeNull();

            act(() => {
                jest.advanceTimersByTime(HINT_STATIC_DELAY_MS);
            });

            expect(screen.getByText('Open settings')).toBeTruthy();
        } finally {
            jest.useRealTimers();
        }
    });

    it('drops a pending static hint when the pointer leaves early', () => {
        jest.useFakeTimers();
        try {
            const button = renderHint({ label: 'Open settings' });

            fireEvent.mouseEnter(button);
            act(() => {
                jest.advanceTimersByTime(HINT_STATIC_DELAY_MS - 1);
            });
            fireEvent.mouseLeave(button);
            act(() => {
                jest.advanceTimersByTime(HINT_STATIC_DELAY_MS);
            });

            expect(screen.queryByText('Open settings')).toBeNull();
        } finally {
            jest.useRealTimers();
        }
    });

    it('leaves the child alone when the label is empty', () => {
        const button = renderHint({ label: '   ' });

        fireEvent.mouseEnter(button);

        expect(screen.queryByRole('tooltip')).toBeNull();
        expect(screen.getByRole('button')).toBeTruthy();
    });
});
