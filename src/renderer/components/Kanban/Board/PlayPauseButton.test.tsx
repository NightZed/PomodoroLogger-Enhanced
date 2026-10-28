import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { PlayPauseButton } from './PlayPauseButton';

describe('PlayPauseButton', () => {
    afterEach(cleanup);

    it('shows play when no session is running and pause otherwise', () => {
        const view = render(<PlayPauseButton showPlay onClick={jest.fn()} />);
        expect(view.getByRole('img', { name: 'caret-right' })).toBeTruthy();

        view.rerender(<PlayPauseButton showPlay={false} onClick={jest.fn()} />);
        expect(view.getByRole('img', { name: 'pause' })).toBeTruthy();
    });

    it('forwards clicks and a custom icon', () => {
        const onClick = jest.fn();
        const view = render(
            <PlayPauseButton showPlay icon={<span data-testid="custom" />} onClick={onClick} />
        );

        expect(view.getByTestId('custom')).toBeTruthy();
        fireEvent.click(view.container.querySelector('button')!);
        expect(onClick).toHaveBeenCalledTimes(1);
    });
});
