import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { Dialog } from './Dialog';

describe('UserGuide Dialog', () => {
    afterEach(cleanup);

    it('renders the hint and defaults to a single OK button', () => {
        const onConfirm = jest.fn();
        const view = render(<Dialog text="This is the tour" onConfirm={onConfirm} />);

        expect(view.getByText('This is the tour')).toBeTruthy();
        expect(view.queryByText('Back')).toBeNull();
        expect(view.queryByText('Exit tour')).toBeNull();

        fireEvent.click(view.getByRole('button', { name: 'OK' }));
        expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('renders title, back, cancel and exit actions', () => {
        const onBack = jest.fn();
        const onCancel = jest.fn();
        const onExit = jest.fn();
        const view = render(
            <Dialog
                title="Step 2 / 5"
                text="Choose"
                showBack
                onBack={onBack}
                onCancel={onCancel}
                cancelText="Not now"
                showExit
                onExit={onExit}
                confirmText="Continue"
            />
        );

        expect(view.getByText('Step 2 / 5')).toBeTruthy();
        fireEvent.click(view.getByRole('button', { name: 'Back' }));
        fireEvent.click(view.getByRole('button', { name: 'Not now' }));
        fireEvent.click(view.getByRole('button', { name: 'Exit tour' }));
        fireEvent.click(view.getByRole('button', { name: 'Continue' }));

        expect(onBack).toHaveBeenCalledTimes(1);
        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(onExit).toHaveBeenCalledTimes(1);
    });

    it('hides the divider and buttons when no action is shown', () => {
        const view = render(<Dialog text="Look only" hasConfirm={false} />);

        expect(view.getByText('Look only')).toBeTruthy();
        expect(view.queryByRole('button')).toBeNull();
    });

    it('reports the opt-out checkbox state', () => {
        const onCheckboxChange = jest.fn();
        const view = render(
            <Dialog
                text="Quit?"
                checkboxLabel="Do not ask again"
                onCheckboxChange={onCheckboxChange}
            />
        );

        const checkbox = view.getByRole('checkbox');
        expect((checkbox as HTMLInputElement).checked).toBe(false);

        fireEvent.click(checkbox);
        expect(onCheckboxChange).toHaveBeenCalledWith(true);
    });
});
