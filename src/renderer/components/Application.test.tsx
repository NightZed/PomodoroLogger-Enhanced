/**
 * Page switching from the window's two navigation paths: the title bar (clicks)
 * and the Ctrl+Tab / Ctrl+Shift+Tab hotkeys.
 *
 * The two used to disagree in compact mode. Both call
 * `Application.changeTab`, which writes TWO pieces of state -- the compact flag
 * and the tab -- but the hotkeys run from a native `document` keydown listener,
 * i.e. outside React's event batching: each dispatch rendered on its own, and
 * the half-written render (`compact` already off, `currentTab` still 'timer')
 * hit the clearing rule in `componentDidUpdate` and dropped the
 * `returnToCompact` memory. So Ctrl+Tab out of compact mode never restored the
 * window, while a click (React batches the event) did; see `changeTab`.
 *
 * These tests run the real connected component against the real reducer, so the
 * batching question is actually exercised.
 */
import * as React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { applyMiddleware, createStore, Store } from 'redux';
import { thunk } from 'redux-thunk';

// The pages are content, not the subject: they drag in echarts, the monitor and
// the worker threads, none of which the navigation depends on.
jest.mock('./Timer', () => ({ __esModule: true, default: () => null }));
jest.mock('./Kanban', () => {
    const React = require('react');
    return {
        __esModule: true,
        default: () => React.createElement('div', { 'data-testid': 'kanban-page' }),
    };
});
jest.mock('./History', () => ({ __esModule: true, default: () => null }));
jest.mock('./Setting', () => ({ __esModule: true, default: () => null }));
jest.mock('./UserGuide/UserGuide', () => ({ __esModule: true, UserGuide: () => null }));
jest.mock('./UpdateController', () => ({ __esModule: true, UpdateController: () => null }));
jest.mock('./Kanban/Card/CardEditor', () => ({ __esModule: true, CardInDetail: () => null }));
jest.mock('./Visualization/PomodoroSankey', () => ({
    __esModule: true,
    ConnectedPomodoroSankey: () => null,
}));
jest.mock('./Timer/iconMaker', () => ({
    setTrayImageWithMadeIcon: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../dbs', () => {
    const dbs = {
        sessionDB: {},
        settingDB: {},
        kanbanDB: {},
        cardsDB: {},
        listsDB: {},
        moveDB: {},
    };
    return {
        __esModule: true,
        dbs,
        default: dbs,
        loadDBs: jest.fn(() => new Promise(() => undefined)),
    };
});
jest.mock('../workers', () => ({
    workers: {
        dbWorkers: {
            sessionDB: {},
            settingDB: {},
            kanbanDB: {},
            cardsDB: {},
            listsDB: {},
            moveDB: {},
        },
        tokenizer: { tokenize: jest.fn().mockResolvedValue([]) },
    },
}));
import { rootReducer, RootState } from '../reducers';
import { setCompact, setUnloadOnCloseToTray } from './Timer/action';
import { feedback } from './feedback';
import ConnectedApplication from './Application';

let windowMaximizedListener: ((maximized: boolean) => void) | undefined;

// The compact thunk resizes the real window through the preload bridge, and the
// title bar asks for the window state on mount.
(window as any).api = {
    compactWindow: jest.fn(),
    minimizeWindow: jest.fn(),
    openDevTools: jest.fn(),
    notify: jest.fn(),
    quit: jest.fn(),
    restart: jest.fn(),
    onWindowMaximizedChanged: jest.fn((listener: (maximized: boolean) => void) => {
        windowMaximizedListener = listener;
        return jest.fn();
    }),
    windowAction: jest.fn(),
    windowDrag: jest.fn(),
    windowState: jest.fn().mockResolvedValue({ maximized: false }),
};

/** Fires the pushed window-state event exactly like the preload bridge does. */
const fireWindowMaximized = (maximized: boolean) => windowMaximizedListener?.(maximized);

/**
 * jsdom has no window manager, so fake the visibility Chromium reports once the
 * window is minimized or hidden -- which is exactly what `closeToTray()` does
 * (`minimize()`), and why the renderer needs no IPC to learn about it.
 */
const setVisibility = (state: 'visible' | 'hidden') => {
    Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => state,
    });
    document.dispatchEvent(new Event('visibilitychange'));
};

// React asks every update to be wrapped in `act`. Wrapping the *keydown*
// dispatch, though, would defeat this whole suite: `act` batches updates, and
// in the real app the event comes from a native `document` listener, i.e.
// unbatched -- which is precisely how `changeTab` used to expose its half
// written state (see the file comment). The events are therefore fired raw and
// only React's nagging about it is filtered.
const originalConsoleError = console.error.bind(console);

const dispatchKey = (key: string, init: KeyboardEventInit = {}) => {
    const event = { key, bubbles: true, cancelable: true, ...init };
    document.dispatchEvent(new KeyboardEvent('keydown', event));
    document.dispatchEvent(new KeyboardEvent('keyup', event));
};

const press = async (key: string, init: KeyboardEventInit = {}) => {
    dispatchKey(key, init);
    // Let React flush the wrapper's keyup bookkeeping.
    await new Promise((resolve) => setTimeout(resolve, 0));
};

const clickTab = async (index: number) => {
    await act(async () => {
        document
            .querySelectorAll('.ant-tabs-tab')
            [index].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
};

describe('Application page switching', () => {
    let container: HTMLDivElement;
    let store: Store<RootState>;

    const state = () => store.getState()!.timer;

    beforeEach(() => {
        jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
            if (typeof args[0] === 'string' && args[0].includes('not wrapped in act')) {
                return;
            }
            originalConsoleError(...args);
        });

        container = document.createElement('div');
        document.body.appendChild(container);
        store = createStore(rootReducer, applyMiddleware(thunk));

        render(
            <Provider store={store}>
                <ConnectedApplication />
            </Provider>,
            { container }
        );

        act(() => {
            store.dispatch(setCompact(true));
        });
        expect(state().compact).toBe(true);
        expect(state().currentTab).toBe('timer');
    });

    afterEach(() => {
        cleanup();
        container.remove();
        document.documentElement.removeAttribute('data-theme');
        (console.error as jest.Mock).mockRestore();
    });

    it('leaves compact mode with Ctrl+Tab and comes back with Ctrl+Shift+Tab', async () => {
        await press('Tab', { ctrlKey: true });
        expect(state().currentTab).toBe('kanban');
        expect(state().compact).toBe(false);

        await press('Tab', { ctrlKey: true, shiftKey: true });
        expect(state().currentTab).toBe('timer');
        // Regression: the two writes of `changeTab` used to render one after the
        // other (a native keydown listener is not batched), and the intermediate
        // render cleared the `returnToCompact` memory, so the compact window never
        // came back.
        expect(state().compact).toBe(true);
    });

    it('leaves compact mode with a click and comes back with Ctrl+Shift+Tab', async () => {
        await clickTab(1);
        expect(state().currentTab).toBe('kanban');
        expect(state().compact).toBe(false);

        await press('Tab', { ctrlKey: true, shiftKey: true });
        expect(state().currentTab).toBe('timer');
        expect(state().compact).toBe(true);
    });

    it('leaves compact mode with a click and comes back with a click', async () => {
        await clickTab(1);
        await clickTab(0);
        expect(state().currentTab).toBe('timer');
        expect(state().compact).toBe(true);
    });

    it('walks the four pages the title bar shows, in both directions', async () => {
        const walk = async (direction: 1 | -1) => {
            const keys = [state().currentTab];
            for (let step = 0; step < 4; step++) {
                await press('Tab', {
                    ctrlKey: true,
                    ...(direction === -1 ? { shiftKey: true } : {}),
                });
                keys.push(state().currentTab);
            }
            return keys;
        };

        expect(await walk(1)).toEqual(['timer', 'kanban', 'history', 'setting', 'timer']);
        expect(await walk(-1)).toEqual(['timer', 'setting', 'history', 'kanban', 'timer']);
    });

    it('forgets the compact memory when the user leaves compact mode themselves', async () => {
        // F11 out of compact mode on the timer page is a deliberate exit -- the
        // Application writes the memory itself there -- so the page switches
        // that follow must not bring the compact window back.
        await press('F11');
        expect(state().compact).toBe(false);

        await clickTab(1);
        await clickTab(0);
        expect(state().currentTab).toBe('timer');
        expect(state().compact).toBe(false);
    });

    it('unloads the background pages 30s after the window goes to the tray by default', async () => {
        await clickTab(1);
        expect(screen.queryByTestId('kanban-page')).not.toBeNull();

        await clickTab(0);
        // Back on the timer, the board is only inside its regular 120s grace.
        expect(screen.queryByTestId('kanban-page')).not.toBeNull();

        // No dispatch: this is the default the user gets on a fresh install.
        jest.useFakeTimers();
        try {
            act(() => setVisibility('hidden'));

            act(() => {
                jest.advanceTimersByTime(29_999);
            });
            expect(screen.queryByTestId('kanban-page')).not.toBeNull();

            act(() => {
                jest.advanceTimersByTime(1);
            });
            expect(screen.queryByTestId('kanban-page')).toBeNull();
        } finally {
            jest.useRealTimers();
            delete (document as any).visibilityState;
            act(() => {
                document.dispatchEvent(new Event('visibilitychange'));
            });
        }
    });

    it('leaves the grace periods alone while the option is off', async () => {
        await clickTab(1);
        await clickTab(0);

        act(() => {
            store.dispatch(setUnloadOnCloseToTray(false));
        });

        jest.useFakeTimers();
        try {
            act(() => setVisibility('hidden'));

            act(() => {
                jest.advanceTimersByTime(30_000);
            });
            // Off means off: hiding the window must not shorten anything.
            expect(screen.queryByTestId('kanban-page')).not.toBeNull();
        } finally {
            jest.useRealTimers();
            delete (document as any).visibilityState;
            act(() => {
                document.dispatchEvent(new Event('visibilitychange'));
            });
        }
    });

    it('swaps the caption button to restore while the window is maximized', async () => {
        // Nothing in the renderer can read the state: a maximized *transparent*
        // window is not a real OS maximized window (Electron emulates it by
        // resizing to the work area), so the main process pushes the state and
        // the title bar mirrors it.
        const captionButtons = () =>
            document.querySelectorAll<HTMLButtonElement>('.ant-tabs-extra-content button');
        // Picked by caption instead of by position: the cluster also carries the
        // always-on-top pin in compact mode, and the window mode leaks in from
        // the persisted settings (the suite stores them in the DB).
        const captionButton = () =>
            Array.from(captionButtons()).find((b) => /^(Maximize|Restore Down)$/.test(b.title));

        expect(captionButton()?.title).toBe('Maximize');

        act(() => {
            fireWindowMaximized(true);
        });
        expect(captionButton()?.title).toBe('Restore Down');

        act(() => {
            fireWindowMaximized(false);
        });
        expect(captionButton()?.title).toBe('Maximize');
    });

    it('mounts feedback modals in the shared popup layer using the app context', () => {
        let modal: ReturnType<typeof feedback.confirm>;
        act(() => {
            modal = feedback.confirm({ title: 'Confirm action' });
        });

        const popupLayer = document.getElementById('pl-popup-container');
        expect(popupLayer).not.toBeNull();
        expect(popupLayer?.querySelector('.ant-modal')).not.toBeNull();

        act(() => {
            modal.destroy();
        });
    });

    // The window is transparent and Main draws the rounded corners (54f3df7).
    // position: fixed portals -- antd's modal wrap/mask above all -- take the
    // viewport as their containing block, so `overflow: hidden` + border-radius
    // never clipped them: opening a dialog painted its full-viewport mask over
    // the transparent corners and the window looked square again (the board /
    // card editors are both antd Modals). Main carries an identity transform,
    // which makes it the containing block for fixed descendants and brings
    // every portal mounted inside it back under the rounded clip -- and the
    // radius travels as one CSS variable so nothing has to copy the number.
    it('keeps fixed portals under the rounded clip of Main', () => {
        // ConfigProvider renders no DOM of its own, so Main is the first
        // element Application puts into the container.
        const main = container.firstElementChild as HTMLElement;
        expect(main).not.toBeNull();

        const classes = Array.from(main.classList);
        const css = Array.from(document.querySelectorAll('style[data-styled]'))
            .map((style) => style.textContent || '')
            .filter((text) => classes.some((cls) => text.includes(`.${cls}`)))
            .join('\n');

        expect(css).toContain('translateZ(0)');
        expect(css).toContain('var(--pl-window-radius)');
    });
});
