import * as React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Hint, HINT_ENTER_DELAY_SECONDS } from './Hint';

describe('Hint', () => {
    afterEach(cleanup);

    it('shows the label once the pointer has settled', () => {
        jest.useFakeTimers();
        try {
            render(
                <Hint label="Open settings">
                    <button>gear</button>
                </Hint>
            );

            fireEvent.mouseEnter(screen.getByRole('button'));
            act(() => {
                jest.advanceTimersByTime(HINT_ENTER_DELAY_SECONDS * 1000);
            });

            expect(screen.getByText('Open settings')).toBeTruthy();
        } finally {
            jest.useRealTimers();
        }
    });

    it('leaves the child alone when the label is empty', () => {
        render(
            <Hint label="   ">
                <button>gear</button>
            </Hint>
        );

        fireEvent.mouseEnter(screen.getByRole('button'));

        expect(screen.queryByRole('tooltip')).toBeNull();
        expect(screen.getByRole('button')).toBeTruthy();
    });
});
