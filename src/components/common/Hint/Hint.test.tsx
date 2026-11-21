import * as React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Hint } from './Hint';

describe('Hint', () => {
    afterEach(cleanup);

    it('opens the label in the event that enters the trigger', () => {
        render(
            <Hint label="Open settings">
                <button>gear</button>
            </Hint>
        );

        fireEvent.mouseEnter(screen.getByRole('button'));

        expect(screen.getByText('Open settings')).toBeTruthy();
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
