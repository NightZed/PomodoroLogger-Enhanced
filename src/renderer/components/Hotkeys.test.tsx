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
import { Hotkeys, WINDOW_FOCUS_GRACE_MS } from './Hotkeys';

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

/**
 * The input / window-focus guards added to the wrapper (see the file comment
 * in Hotkeys.tsx): the two reported misfires of the Timer's bare `tab`
 * binding -- mode switching while typing in the card editor, and Alt+Tab
 * residue firing on the way into the window.
 */
describe('Hotkeys wrapper (input / window-focus guards)', () => {
    it('never fires from a keyup alone (focus moved between keydown and keyup)', async () => {
        const onKeyDown = jest.fn();
        const renderer = mount('tab', onKeyDown);

        // keydown inside a textarea is filtered out, so no "already down"
        // state is recorded -- and the browser's default moves focus.
        const textarea = document.createElement('textarea');
        document.body.appendChild(textarea);
        await act(async () => {
            textarea.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
            );
        });
        expect(onKeyDown).not.toHaveBeenCalled();

        // The keyup arrives at document (focus has already moved). The stock
        // filter only inspects this event's target, so this used to fire the
        // binding -- the card-editor mode switch.
        await act(async () => {
            dispatch('keyup', 'Tab', {});
        });
        await flushRelease();
        expect(onKeyDown).not.toHaveBeenCalled();

        await unmount(renderer);
        textarea.remove();
    });

    it('ignores keys typed into editable elements but still fires outside them', async () => {
        const onKeyDown = jest.fn();
        const renderer = mount('tab', onKeyDown);

        const textarea = document.createElement('textarea');
        document.body.appendChild(textarea);
        await act(async () => {
            textarea.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
            );
        });
        expect(onKeyDown).not.toHaveBeenCalled();

        await press('Tab', {});
        expect(onKeyDown).toHaveBeenCalledTimes(1);

        await unmount(renderer);
        textarea.remove();
    });

    it('stays silent during the window-focus grace period, then fires again', async () => {
        const onKeyDown = jest.fn();
        const renderer = mount('tab', onKeyDown);

        // Alt+Tab residue arrives right after the window regains focus...
        await act(async () => {
            window.dispatchEvent(new Event('focus'));
        });
        await act(async () => {
            dispatch('keydown', 'Tab', {});
        });
        expect(onKeyDown).not.toHaveBeenCalled();

        // ...while a deliberate press once the grace period has passed works.
        // Waiting it out here also restores the clock for any later test.
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, WINDOW_FOCUS_GRACE_MS + 50));
        });
        await press('Tab', {});
        expect(onKeyDown).toHaveBeenCalledTimes(1);

        await unmount(renderer);
    });
});
