/**
 * The title bar declares one pane per `APP_TABS` entry, and the Ctrl+Tab hotkeys
 * rotate through the very same list (see `appTabs.ts`). These tests pin that
 * contract down: a page the hotkeys can reach but the bar does not declare shows
 * up as a blank tab, which is what 'setting' + Ctrl+Tab used to do.
 *
 * They run on a bare react-test-renderer rather than on the DOM: antd 3 has no
 * `data-node-key` attribute to query, and the tab bar reads pixel geometry off
 * its host refs while it mounts (jsdom reports nothing for that). The panes are
 * read off the `Tabs` element instead, which is the declaration the hotkeys have
 * to stay within anyway.
 */
import { Tabs } from 'antd';
import * as React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { APP_TABS, nextTabKey } from '../appTabs';
import { tabType } from '../Timer/action';
import AppTitleBar from './AppTitleBar';

// The window buttons talk to the main process through `window.api`.
(window as any).api = { windowAction: jest.fn() };

/**
 * Fake DOM node for antd 3's tab bar.
 *
 * `react-test-renderer` hands `null` to host-element refs unless a
 * `createNodeMock` is supplied, and rc-tabs (the tabs implementation behind
 * antd 3) reads geometry off those refs while it mounts: it measures the ink bar
 * (`style`, `offsetWidth`), the scroll container and the tab nodes. All zeros
 * here are enough for it to render, and they keep the test about which pages the
 * bar declares instead of about pixel measurements.
 */
const fakeNode = {
    style: {},
    focus: () => undefined,
    blur: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    getBoundingClientRect: () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 }),
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementsByClassName: () => [],
    offsetWidth: 0,
    offsetHeight: 0,
    offsetLeft: 0,
    offsetTop: 0,
    clientWidth: 0,
    clientHeight: 0,
    scrollWidth: 0,
    scrollHeight: 0,
    scrollLeft: 0,
    scrollTop: 0,
};

const build = (currentTab: tabType, onTabChange: (tab: tabType) => void, sessionEnding = false) =>
    TestRenderer.create(
        <AppTitleBar
            currentTab={currentTab}
            minimize={false}
            compact={false}
            sessionEnding={sessionEnding}
            onTabChange={onTabChange}
            timer={<div>timer page</div>}
            kanban={<div>kanban page</div>}
            history={<div>history page</div>}
            setting={<div>setting page</div>}
            alwaysOnTop={false}
            onToggleAlwaysOnTop={() => undefined}
        />,
        { createNodeMock: () => fakeNode }
    );

/**
 * The panes the bar declares, in order.
 *
 * Read off the `Tabs` element's own `TabPane` children -- not off the rendered
 * tree and not off the DOM. The rendered tree keeps the `TabPane` *element
 * types* (not element instances), and an inactive pane without `forceRender`
 * renders `null`, so the DOM would only show the active page plus the Timer.
 * What the hotkeys have to stay within is the set of *declared* pages.
 */
const declaredTabs = (renderer: TestRenderer.ReactTestRenderer) => {
    const panes = React.Children.toArray(renderer.root.findByType(Tabs).props.children) as Array<
        React.ReactElement<{
            tab: React.ReactElement<{ title: string; 'data-tour'?: string }>;
            forceRender?: boolean;
            disabled?: boolean;
        }>
    >;

    return panes.map((pane) => ({
        // `React.Children.toArray` prefixes the key of a child element ('.$timer'),
        // so strip it back to the page name the hotkeys rotate through.
        key: String(pane.key).replace(/^\.\$/, ''),
        title: pane.props.tab.props.title,
        tourKey: pane.props.tab.props['data-tour'],
        forceRender: pane.props.forceRender,
        disabled: pane.props.disabled,
    }));
};

const unmount = (renderer: TestRenderer.ReactTestRenderer) => {
    act(() => {
        renderer.unmount();
    });
};

describe('AppTitleBar', () => {
    APP_TABS.forEach(({ key, title, forceRender, tourKey }) => {
        it(`renders the ${key} page with its title`, () => {
            const renderer = build(key, () => undefined);

            const pane = declaredTabs(renderer).find((tab) => tab.key === key);
            expect(pane).toBeDefined();
            expect(pane?.title).toBe(title);
            // The marker attributes of the guided tour and the mounted-ness of
            // the page travel with the tab, so both come from the same list.
            expect(pane?.tourKey).toBe(tourKey);
            expect(pane?.forceRender).toBe(forceRender);

            unmount(renderer);
        });
    });

    it('declares exactly the pages the Ctrl+Tab rotation walks through', () => {
        // The invariant behind the "blank tab" bug: no entry of the list is
        // missing from the bar, and the hotkeys never step onto a page the bar
        // does not declare. The rotation used to walk a separate list (`TABS`
        // in the timer actions) which a removed dev-only page ('analyser') had
        // left one entry longer, so 'setting' + Ctrl+Tab landed on that blank
        // page first.
        const renderer = build('timer', () => undefined);
        expect(declaredTabs(renderer).map((tab) => tab.key)).toEqual(
            APP_TABS.map((tab) => tab.key)
        );

        let current: tabType = 'setting';
        for (let step = 0; step < APP_TABS.length; step++) {
            current = nextTabKey(current, 1);
            expect(declaredTabs(renderer).map((tab) => tab.key)).toContain(current);
        }

        unmount(renderer);
    });

    it('hands the tab the user picked to onTabChange', () => {
        const onTabChange = jest.fn();
        const renderer = build('timer', onTabChange);
        const tabs = renderer.root.findByType(Tabs);

        act(() => {
            tabs.props.onChange('setting');
        });
        expect(onTabChange).toHaveBeenLastCalledWith('setting');

        // The arrow keys of the tab bar (rc-tabs `onNavKeyDown`) end up here as
        // well, which is why they navigate by page, and now by the same
        // page-switch routine the Ctrl+Tab hotkeys use.
        act(() => {
            tabs.props.onChange('kanban');
        });
        expect(onTabChange).toHaveBeenLastCalledWith('kanban');

        unmount(renderer);
    });

    it('refuses to switch pages while the ending mask is up', () => {
        const onTabChange = jest.fn();
        const renderer = build('timer', onTabChange, true);
        const tabs = renderer.root.findByType(Tabs);

        act(() => {
            tabs.props.onChange('kanban');
        });
        expect(onTabChange).not.toHaveBeenCalled();

        // The entries are greyed out as well, so the arrow keys of the tab bar
        // cannot sneak past the mask either.
        expect(declaredTabs(renderer).every((tab) => tab.disabled)).toBe(true);

        unmount(renderer);
    });

    it('keeps the Timer page mounted while another tab is active', () => {
        // The running session and its interval live there: a page switch must
        // not tear them down.
        const renderer = build('kanban', () => undefined);
        expect(declaredTabs(renderer).find((tab) => tab.key === 'timer')?.forceRender).toBe(true);

        const texts = renderer.root
            .findAll((node) => typeof node.type === 'string')
            .flatMap((node) => node.children.filter((child) => typeof child === 'string'));
        expect(texts).toContain('timer page');

        unmount(renderer);
    });
});
