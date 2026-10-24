/**
 * The title bar declares one pane per `APP_TABS` entry, and the Ctrl+Tab hotkeys
 * rotate through the very same list (see `appTabs.ts`). These tests pin that
 * contract down: a page the hotkeys can reach but the bar does not declare shows
 * up as a blank tab, which is what 'setting' + Ctrl+Tab used to do.
 *
 * The tabs are queried through the DOM now (rc-tabs exposes `data-node-key`),
 * so the tests also exercise the real antd rendering instead of inspecting the
 * `Tabs` element through react-test-renderer.
 */
import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { APP_TABS, nextTabKey } from '../appTabs';
import { tabType } from '../Timer/action';
import AppTitleBar from './AppTitleBar';

// The window buttons and the maximized-title-bar drag talk to the main process
// through `window.api`.
(window as any).api = { windowAction: jest.fn(), windowDrag: jest.fn() };

const build = (
    currentTab: tabType,
    onTabChange: (tab: tabType) => void,
    sessionEnding = false,
    maximized = false,
    compact = false
) =>
    render(
        <AppTitleBar
            currentTab={currentTab}
            minimize={false}
            compact={compact}
            maximized={maximized}
            sessionEnding={sessionEnding}
            onTabChange={onTabChange}
            timer={<div>timer page</div>}
            kanban={<div>kanban page</div>}
            history={<div>history page</div>}
            setting={<div>setting page</div>}
            alwaysOnTop={false}
            onToggleAlwaysOnTop={() => undefined}
        />
    );

const tabNodes = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('[data-node-key]')) as HTMLElement[];

const tabButton = (container: HTMLElement, key: string) =>
    container.querySelector(`[data-node-key="${key}"] [role="tab"]`) as HTMLElement | null;

/** The declared pages, in order, read off the rendered tab bar. */
const declaredTabs = (container: HTMLElement) =>
    tabNodes(container).map((tab) => {
        const label = tab.querySelector('[title]');
        const button = tab.querySelector('[role="tab"]');
        return {
            key: tab.getAttribute('data-node-key'),
            title: label?.getAttribute('title'),
            tourKey: label?.getAttribute('data-tour') ?? undefined,
            disabled: button?.getAttribute('aria-disabled') === 'true',
        };
    });

/** A `pointerdown` on the empty part of the bar (not on a tab or a button). */
const pointerDown = (target: HTMLElement, pointerId = 7) => {
    const event = new Event('pointerdown', { bubbles: true, cancelable: true });
    Object.assign(event, { button: 0, pointerId });
    fireEvent(target, event);
    return event;
};

const pointerUp = (target: HTMLElement, pointerId = 7) => {
    const event = new Event('pointerup', { bubbles: true, cancelable: true });
    Object.assign(event, { button: 0, pointerId });
    fireEvent(target, event);
};

describe('AppTitleBar', () => {
    APP_TABS.forEach(({ key, title, tourKey }) => {
        it(`renders the ${key} page with its title`, () => {
            const { container } = build(key, () => undefined);

            const pane = declaredTabs(container).find((tab) => tab.key === key);
            expect(pane).toBeDefined();
            expect(pane?.title).toBe(title);
            // The marker attributes of the guided tour travel with the tab, so
            // both come from the same list.
            expect(pane?.tourKey).toBe(tourKey);
        });
    });

    it('declares exactly the pages the Ctrl+Tab rotation walks through', () => {
        // The invariant behind the "blank tab" bug: no entry of the list is
        // missing from the bar, and the hotkeys never step onto a page the bar
        // does not declare. The rotation used to walk a separate list (`TABS`
        // in the timer actions) which a removed dev-only page ('analyser') had
        // left one entry longer, so 'setting' + Ctrl+Tab landed on that blank
        // page first.
        const { container } = build('timer', () => undefined);
        expect(declaredTabs(container).map((tab) => tab.key)).toEqual(
            APP_TABS.map((tab) => tab.key)
        );

        let current: tabType = 'setting';
        for (let step = 0; step < APP_TABS.length; step++) {
            current = nextTabKey(current, 1);
            expect(declaredTabs(container).map((tab) => tab.key)).toContain(current);
        }
    });

    it('centers each compact icon without an individual offset', () => {
        const { container } = build('timer', () => undefined, false, false, true);
        const labels = Array.from(container.querySelectorAll('[title]')) as HTMLElement[];
        const timerLabel = labels.find((label) => label.getAttribute('title') === 'Pomodoro');
        const kanbanLabel = labels.find((label) => label.getAttribute('title') === 'Kanban');

        expect(timerLabel?.style.justifyContent).toBe('center');
        expect(kanbanLabel?.style.justifyContent).toBe('center');
        const icons = Array.from(timerLabel?.querySelectorAll('.anticon') ?? []);
        expect(icons.length).toBeGreaterThan(0);
        icons.forEach((icon) => expect(icon.getAttribute('style')).toBeNull());
    });

    it('hands the tab the user picked to onTabChange', () => {
        const onTabChange = jest.fn();
        const { container } = build('timer', onTabChange);

        fireEvent.click(tabButton(container, 'setting') as HTMLElement);
        expect(onTabChange).toHaveBeenLastCalledWith('setting');

        fireEvent.click(tabButton(container, 'kanban') as HTMLElement);
        expect(onTabChange).toHaveBeenLastCalledWith('kanban');
    });

    it('refuses to switch pages while the ending mask is up', () => {
        const onTabChange = jest.fn();
        const { container } = build('timer', onTabChange, true);

        expect(declaredTabs(container).every((tab) => tab.disabled)).toBe(true);
        fireEvent.click(tabButton(container, 'kanban') as HTMLElement);
        expect(onTabChange).not.toHaveBeenCalled();
    });

    it('keeps the Timer page mounted while another tab is active', () => {
        // The running session and its interval live there: a page switch must
        // not tear them down. `forceRender` on the Timer entry is what keeps
        // the pane in the DOM; the other inactive pages are not mounted.
        build('kanban', () => undefined);
        expect(screen.getByText('timer page')).not.toBeNull();
        expect(screen.queryByText('history page')).toBeNull();
        expect(screen.queryByText('setting page')).toBeNull();
    });

    it('turns a press on the maximized bar into a window drag', () => {
        // On Windows a maximized *transparent* window is not a really maximized
        // one: Electron emulates the state by resizing to the work area, so the
        // OS never runs its "dragging a maximized window restores it" move and
        // the window would be carried away at full size. The bar therefore keeps
        // the press and reports the gesture to the main process, which restores
        // and moves the window (see src/main/ipc/windowDrag.ts).
        const windowDrag = jest.fn();
        (window as any).api = { windowAction: jest.fn(), windowDrag };

        const { container } = build('timer', () => undefined, false, true);
        const bar = container.querySelector('.ant-tabs-nav') as HTMLElement;
        const root = container.firstElementChild as HTMLElement;
        const setPointerCapture = jest.fn();
        root.setPointerCapture = setPointerCapture;

        pointerDown(bar);

        expect(windowDrag).toHaveBeenCalledWith('start');
        // The release is only guaranteed to arrive through the capture: the
        // window shrinks out from under the cursor while the button is held.
        expect(setPointerCapture).toHaveBeenCalledWith(7);

        pointerUp(bar);
        expect(windowDrag).toHaveBeenLastCalledWith('end');
    });

    it('leaves a press on a normal window to the native drag region', () => {
        // Not maximized: Chromium's drag region moves the window itself -- and
        // keeps Aero Snap working -- so the renderer must not start a second,
        // competing drag.
        const windowDrag = jest.fn();
        (window as any).api = { windowAction: jest.fn(), windowDrag };

        const { container } = build('timer', () => undefined);
        const bar = container.querySelector('.ant-tabs-nav') as HTMLElement;
        const root = container.firstElementChild as HTMLElement;
        const setPointerCapture = jest.fn();
        root.setPointerCapture = setPointerCapture;

        pointerDown(bar);

        expect(windowDrag).not.toHaveBeenCalled();
        expect(setPointerCapture).not.toHaveBeenCalled();
    });
});
