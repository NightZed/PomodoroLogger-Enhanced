/**
 * Regression tests for the shared `Hotkeys` wrapper (see Hotkeys.tsx).
 *
 * react-hot-keys@3.0.0 only drains the internal "already down" set it uses to
 * swallow key-repeat when an `onKeyUp` prop is passed, and no call site of the
 * app listens to keyup -- so after the 3.0.0 bump every binding (Ctrl+Tab,
 * Ctrl+Shift+Tab, Tab, F5, ...) fired exactly once per mount and then went
 * dead. The wrapper supplies that prop; these tests pin the behaviour down.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Hotkeys } from './Hotkeys';

const dispatch = (type: 'keydown' | 'keyup', key: string, init: KeyboardEventInit = {}) => {
    document.dispatchEvent(
        new KeyboardEvent(type, { key, bubbles: true, cancelable: true, ...init })
    );
};

/**
 * The wrapper's release path lives in a `setTimeout(0)` behind the library's
 * document-level keyup listener, so a press is only "finished" after it ran.
 */
const flushRelease = () =>
    act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });

/** Press and release a combination, modifier included, and let the wrapper react. */
const press = async (key: string, init: KeyboardEventInit = {}) => {
    const modifiers = init.ctrlKey
        ? ['Control']
        : init.shiftKey
        ? ['Shift']
        : init.altKey
        ? ['Alt']
        : [];
    await act(async () => {
        dispatch('keydown', key, init);
    });
    await act(async () => {
        dispatch('keyup', key, init);
    });
    for (const modifier of modifiers) {
        await act(async () => {
            dispatch('keyup', modifier, {});
        });
    }
    await flushRelease();
};

const mount = (keyName: string, onKeyDown: (shortcut: string) => void) => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
        renderer = TestRenderer.create(<Hotkeys keyName={keyName} onKeyDown={onKeyDown} />);
    });
    return renderer;
};

const unmount = async (renderer: TestRenderer.ReactTestRenderer) => {
    await act(async () => {
        renderer.unmount();
    });
    await flushRelease();
};

describe('Hotkeys wrapper (react-hot-keys 3.0.0 release tracking)', () => {
    it('fires a combination again on every press', async () => {
        const onKeyDown = jest.fn();
        const renderer = mount('ctrl+tab', onKeyDown);

        await press('Tab', { ctrlKey: true });
        await press('Tab', { ctrlKey: true });
        await press('Tab', { ctrlKey: true });
        await unmount(renderer);

        expect(onKeyDown).toHaveBeenCalledTimes(3);
        expect(onKeyDown.mock.calls.map((call) => call[0])).toEqual([
            'ctrl+tab',
            'ctrl+tab',
            'ctrl+tab',
        ]);
    });

    it('fires once while the combination stays held (key-repeat is swallowed)', async () => {
        const onKeyDown = jest.fn();
        const renderer = mount('ctrl+tab', onKeyDown);

        await act(async () => {
            dispatch('keydown', 'Control', { ctrlKey: true });
            dispatch('keydown', 'Tab', { ctrlKey: true });
            dispatch('keydown', 'Tab', { ctrlKey: true });
            dispatch('keydown', 'Tab', { ctrlKey: true });
        });
        expect(onKeyDown).toHaveBeenCalledTimes(1);

        // Let go of the combination, the way the keys are actually released...
        await act(async () => {
            dispatch('keyup', 'Tab', { ctrlKey: true });
            dispatch('keyup', 'Control', {});
        });
        await flushRelease();

        // ...and the next press fires again.
        await press('Tab', { ctrlKey: true });
        await unmount(renderer);

        expect(onKeyDown).toHaveBeenCalledTimes(2);
    });

    it('keeps the shortcuts of one keyName independent and repeatable', async () => {
        const onKeyDown = jest.fn();
        const renderer = mount('f5,f6,tab', onKeyDown);

        await press('Tab', {});
        await press('Tab', {});
        await press('F5', {});
        await press('F6', {});
        await press('F5', {});
        await unmount(renderer);

        expect(onKeyDown.mock.calls.map((call) => call[0])).toEqual([
            'tab',
            'tab',
            'f5',
            'f6',
            'f5',
        ]);
    });

    it('leaves the repeat matching of a modified combination intact', async () => {
        const onKeyDown = jest.fn();
        const renderer = mount('ctrl+shift+tab', onKeyDown);

        await press('Tab', { ctrlKey: true, shiftKey: true });
        await press('Tab', { ctrlKey: true, shiftKey: true });
        await unmount(renderer);

        expect(onKeyDown).toHaveBeenCalledTimes(2);
        expect(onKeyDown.mock.calls.map((call) => call[0])).toEqual([
            'ctrl+shift+tab',
            'ctrl+shift+tab',
        ]);
    });
});
