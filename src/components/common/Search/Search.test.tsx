/**
 * The shared Search bar's window-level Ctrl+F listener (see Search.tsx).
 *
 * The bar is rendered by the Kanban page, which stays mounted for
 * DestroyOnTimeoutWrapper's 10-minute grace after the tab is left -- hidden
 * DOM does not stop window-level listeners -- so `enabled` is what keeps the
 * keystroke working only on the page that owns it, and the editable-target
 * guard keeps it from stealing focus while the user types somewhere else.
 *
 * The handler announces itself through `preventDefault`: a dispatch that
 * comes back un-prevented means no handler ran (disabled) or the guard
 * returned first (typing).
 */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { Search } from './Search';

/** Dispatch a real Ctrl+F keydown on `target`; false = the handler ran. */
const pressCtrlF = (target: EventTarget): boolean => {
    let notPrevented = true;
    act(() => {
        notPrevented = target.dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'f',
                ctrlKey: true,
                bubbles: true,
                cancelable: true,
            })
        );
    });
    return notPrevented;
};

const mount = (enabled?: boolean) => render(<Search enabled={enabled} setSearchStr={jest.fn()} />);

/** Open the collapsed bar; returns the input it reveals. */
const expandBar = (view: ReturnType<typeof render>) => {
    fireEvent.click(view.getByRole('button', { name: 'Search' }));
    return view.getByRole('textbox', { name: 'Search' }) as HTMLInputElement;
};

describe('Search Ctrl+F scoping', () => {
    it('handles Ctrl+F while its page is active', () => {
        const view = mount(true);
        expect(pressCtrlF(window)).toBe(false);
        view.unmount();
    });

    it('registers nothing while its page is not active (grace residue)', () => {
        const view = mount(false);
        expect(pressCtrlF(window)).toBe(true);
        view.unmount();
    });

    it('does not hijack Ctrl+F while the user is typing', () => {
        const view = mount(true);
        const textarea = document.createElement('textarea');
        document.body.appendChild(textarea);

        // Typing: the editable-target guard returns before preventDefault.
        expect(pressCtrlF(textarea)).toBe(true);
        // Positive control: the same render still handles a free target.
        expect(pressCtrlF(window)).toBe(false);

        view.unmount();
        textarea.remove();
    });

    it('clears its local query when its page becomes inactive', () => {
        const setSearchStr = jest.fn();
        const view = render(<Search enabled={true} setSearchStr={setSearchStr} />);
        const input = expandBar(view);

        fireEvent.change(input, { target: { value: 'old query' } });
        expect(input.value).toBe('old query');

        view.rerender(<Search enabled={false} setSearchStr={setSearchStr} />);
        view.rerender(<Search enabled={true} setSearchStr={setSearchStr} />);

        // Coming back must not show the query from before the page was left.
        expect(expandBar(view).value).toBe('');
        view.unmount();
    });

    it('computes the tag panel once per open, not on every keystroke', () => {
        const tags = jest.fn(() => ['#one']);
        const view = render(<Search enabled={true} setSearchStr={jest.fn()} tags={tags} />);

        // Expand the bar, then the suggestion panel.
        const input = expandBar(view);
        fireEvent.click(view.getByRole('button', { name: 'Expand search panel' }));

        expect(tags).toHaveBeenCalledTimes(1);

        fireEvent.change(input, { target: { value: 'one' } });

        // The board data did not change, so typing must reuse the computed
        // tag list instead of walking every card again.
        expect(tags).toHaveBeenCalledTimes(1);

        view.unmount();
    });

    it('offers no suggestion toggle when it has nothing to suggest', () => {
        // The overview's bar only filters board names; a toggle there would
        // open an empty panel.
        const view = render(<Search enabled={true} setSearchStr={jest.fn()} />);

        expect(view.queryByRole('button', { name: 'Expand search panel' })).toBeNull();

        view.unmount();
    });

    it('exposes the collapsed bar as a button with an accessible name', () => {
        const view = render(<Search enabled={true} setSearchStr={jest.fn()} />);

        // Mouse users click the circle; the keyboard reaches the same control
        // through the tab order.
        expect(view.getByRole('button', { name: 'Search' })).toBeTruthy();

        view.unmount();
    });

    // Regression: SearchPanel defaulted `tags` to ['#TAG'], so a bar without
    // suggestions (the overview's board-name filter) opened a panel showing a
    // fake tag the user could click, which then searched for "#TAG".
    it('does not invent a placeholder tag when the tag list is empty', () => {
        const view = render(<Search enabled={true} setSearchStr={jest.fn()} tags={() => []} />);

        expandBar(view);
        fireEvent.click(view.getByRole('button', { name: 'Expand search panel' }));

        expect(view.queryByText('#TAG')).toBeNull();

        view.unmount();
    });
});
