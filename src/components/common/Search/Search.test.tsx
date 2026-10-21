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

    it('computes the tag panel once per open, not on every keystroke', () => {
        const tags = jest.fn(() => ['#one']);
        const view = render(<Search enabled={true} setSearchStr={jest.fn()} tags={tags} />);

        // Expand the bar, then the suggestion panel.
        act(() => {
            (view.container.firstElementChild as HTMLElement).click();
        });
        act(() => {
            const arrow = view.container.querySelector(
                '[aria-label="Expand search panel"]'
            ) as HTMLElement;
            arrow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(tags).toHaveBeenCalledTimes(1);

        fireEvent.change(view.container.querySelector('input') as HTMLInputElement, {
            target: { value: 'one' },
        });

        // The board data did not change, so typing must reuse the computed
        // tag list instead of walking every card again.
        expect(tags).toHaveBeenCalledTimes(1);

        view.unmount();
    });
});
