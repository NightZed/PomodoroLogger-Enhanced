/**
 * Page switching from the window's two navigation paths: the title bar (clicks)
 * and the Ctrl+Tab / Ctrl+Shift+Tab hotkeys.
 *
 * The two used to disagree in compact (small window) mode. Both call
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
import * as ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { Provider } from 'react-redux';
import { applyMiddleware, createStore, Store } from 'redux';
import thunk from 'redux-thunk';

// The pages are content, not the subject: they drag in echarts, the monitor and
// the worker threads, none of which the navigation depends on.
jest.mock('./Timer', () => ({ __esModule: true, default: () => null }));
jest.mock('./Kanban', () => ({ __esModule: true, default: () => null }));
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
jest.mock('electron', () => ({
    ipcRenderer: { send: jest.fn(), addListener: jest.fn(), removeListener: jest.fn() },
}));
jest.mock('@electron/remote', () => ({ getGlobal: () => undefined }));
jest.mock('react-hot-loader/root', () => ({ hot: (component: unknown) => component }));

import { ipcRenderer } from 'electron';
import { WindowEventName } from '../../main/ipc/type';
import { rootReducer, RootState } from '../reducers';
import { setCompact } from './Timer/action';
import ConnectedApplication from './Application';

// The compact thunk resizes the real window through the preload bridge, and the
// title bar asks for the window state on mount.
(window as any).api = {
    compactWindow: jest.fn(),
    minimizeWindow: jest.fn(),
    openDevTools: jest.fn(),
    notify: jest.fn(),
    windowAction: jest.fn(),
    windowDrag: jest.fn(),
    windowState: jest.fn().mockResolvedValue({ maximized: false }),
};

/**
 * The listener `Application` registered for a window event. The mock records the
 * (name, listener) pairs, so the test can fire the event exactly like the main
 * process does.
 */
const windowEventListener = (event: string) => {
    const calls = (ipcRenderer.addListener as jest.Mock).mock.calls.filter(
        ([name]) => name === event
    );
    return calls[calls.length - 1]?.[1] as (e: unknown, maximized: boolean) => void;
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
    // The Hotkeys wrapper releases its "already down" state in a timeout.
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
    let store: Store<RootState | undefined>;

    const state = () => store.getState()!.timer;

    beforeEach(async () => {
        jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
            if (typeof args[0] === 'string' && args[0].includes('not wrapped in act')) {
                return;
            }
            originalConsoleError(...args);
        });

        container = document.createElement('div');
        document.body.appendChild(container);
        store = createStore(rootReducer, applyMiddleware(thunk));

        await act(async () => {
            ReactDOM.render(
                <Provider store={store}>
                    {/* `fetchKanban` is the one prop connect does not supply:
                        it is passed to `genMapDispatchToProp` as an extra key,
                        outside the action types the prop is typed with. */}
                    <ConnectedApplication fetchKanban={jest.fn()} />
                </Provider>,
                container
            );
            // Let `componentDidMount` settle: the DB work it kicks off must not
            // finish after the test does.
            await new Promise((resolve) => setTimeout(resolve, 50));
        });

        act(() => {
            store.dispatch(setCompact(true));
        });
        expect(state().compact).toBe(true);
        expect(state().currentTab).toBe('timer');
    });

    afterEach(() => {
        act(() => {
            ReactDOM.unmountComponentAtNode(container);
        });
        container.remove();
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
        // render cleared the `returnToCompact` memory, so the small window never
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
        // that follow must not bring the small window back.
        await press('F11');
        expect(state().compact).toBe(false);

        await clickTab(1);
        await clickTab(0);
        expect(state().currentTab).toBe('timer');
        expect(state().compact).toBe(false);
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
            windowEventListener(WindowEventName.MaximizedChanged)(null, true);
        });
        expect(captionButton()?.title).toBe('Restore Down');

        act(() => {
            windowEventListener(WindowEventName.MaximizedChanged)(null, false);
        });
        expect(captionButton()?.title).toBe('Maximize');
    });

    // The popup layer lives inside the Content div (opacity: contentOpacity),
    // while antd portals overlays to <body> by default -- which sits outside
    // the opacity, so a Select dropdown / Tooltip / DatePicker calendar would
    // stay fully opaque while the page fades. Application wraps the whole tree
    // in a ConfigProvider whose getPopupContainer resolves to popupLayer.ts,
    // and every context-driven overlay (Tooltip, Dropdown, Select, DatePicker,
    // AutoComplete, Modal) falls back to it.
    //
    // Asserted through the live fiber tree rather than a purpose-built
    // overlay: a second ReactDOM tree cannot inherit React context anyway,
    // and every heavy page is stubbed here. Drop the provider and
    // `ConfigProvider` stops appearing above Main (the LabelEditor.test.tsx
    // dropdown-placement test is the live-overlay proof for one such
    // component).
    it('keeps the antd overlay default inside the shared popup layer', async () => {
        // The tree is already mounted above inside act(); walk the live
        // fibers from the host root (`_reactRootContainer` is how React 16
        // links a container to its root -- this suite pins react 16.14). The
        // suite imports no ConfigProvider of its own, so every match below
        // is the one Application renders.
        const { ConfigProvider: ExpectedProvider } = require('antd') as typeof import('antd');
        const root = (container as any)._reactRootContainer?._internalRoot?.current;
        expect(root).toBeDefined();

        const providers: any[] = [];
        const walk = (fiber: any): void => {
            if (fiber == null) {
                return;
            }

            if (fiber.elementType === ExpectedProvider) {
                providers.push(fiber);
            }

            let child = fiber.child;
            while (child != null) {
                walk(child);
                child = child.sibling;
            }
        };
        walk(root);

        expect(providers).toHaveLength(1);
        // The context carries the resolver through, not a snapshot of the
        // node: invoke it the way an opening overlay would.
        expect(providers[0].pendingProps.getPopupContainer()).toBe(
            document.getElementById('pl-popup-container')
        );
    });
});
