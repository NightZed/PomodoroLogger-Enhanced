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
import TestRenderer, { act } from 'react-test-renderer';
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

const mount = (enabled?: boolean) => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
        renderer = TestRenderer.create(<Search enabled={enabled} setSearchStr={jest.fn()} />);
    });
    return renderer;
};

describe('Search Ctrl+F scoping', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('handles Ctrl+F while its page is active', () => {
        const renderer = mount(true);
        expect(pressCtrlF(window)).toBe(false);
        act(() => renderer.unmount());
    });

    it('registers nothing while its page is not active (grace residue)', () => {
        const renderer = mount(false);
        expect(pressCtrlF(window)).toBe(true);
        act(() => renderer.unmount());
    });

    it('does not hijack Ctrl+F while the user is typing', () => {
        const renderer = mount(true);
        const textarea = document.createElement('textarea');
        document.body.appendChild(textarea);

        // Typing: the editable-target guard returns before preventDefault.
        expect(pressCtrlF(textarea)).toBe(true);
        // Positive control: the same render still handles a free target.
        expect(pressCtrlF(window)).toBe(false);

        act(() => renderer.unmount());
    });
});
