import { Icon, Tabs } from 'antd';
import * as React from 'react';
import styled from 'styled-components';
import { tabType } from '../Timer/action';
import { APP_TABS } from '../appTabs';
import WindowControls from '../WindowControls';
import { isDragSurface } from './dragRegion';
import { COMPACT_TITLE_BAR_HEIGHT, TITLE_BAR_HEIGHT } from './tokens';

interface Props {
    currentTab: string;
    minimize: boolean;
    compact: boolean;
    /**
     * The window is maximized. The bar then hands its presses to the renderer
     * instead of Chromium's drag region, see the `no-drag` note in `TitleBar`
     * below, and the caption buttons show restore instead of maximize.
     */
    maximized: boolean;
    /** The ending mask is up: the pages must not be switched away from it. */
    sessionEnding: boolean;
    onTabChange: (tab: tabType) => void;
    timer: React.ReactNode;
    kanban: React.ReactNode;
    history: React.ReactNode;
    setting: React.ReactNode;
    alwaysOnTop: boolean;
    onToggleAlwaysOnTop: () => void;
}

const TitleBar = styled.div<{ compact: boolean; maximized: boolean; sessionEnding: boolean }>`
    .ant-tabs-bar {
        position: relative;
        border-bottom: 0 !important;
    }

    /* Keep the divider independent from antd's tab/extra-content layout so it
       spans the complete window width, including below the window controls. */
    .ant-tabs-bar::after {
        content: '';
        position: absolute;
        right: 0;
        bottom: 0;
        left: 0;
        height: 1px;
        background-color: var(--pl-border);
        pointer-events: none;
    }

    .ant-tabs-content,
    .ant-tabs-tabpane {
        -webkit-app-region: no-drag;
    }

    /* The bar paints no surface of its own. The window background layer draws
       the elevated band behind it, at exactly this height (see Application.tsx),
       so the title bar and the page below it each receive the background
       opacity once and differ only in their base color. Painting it here as
       well would apply the opacity a second time on top of the band and make
       the header denser than the page. */
    .ant-tabs-bar {
        margin: 0;
        height: ${TITLE_BAR_HEIGHT}px;
        box-sizing: border-box;
        background-color: transparent !important;

        /* While the window is maximized the press has to reach the renderer, so
           the bar gives up the native drag region (drag -> no-drag) and the
           pointer handlers on the bar drive the window instead.

           The reason is Windows-specific: a transparent window is never a real
           maximized window -- Electron emulates the state by resizing it to the
           display work area, and it swallows the system's maximize command for
           such windows. Windows' own "dragging a maximized window restores it
           and carries it along" move therefore never runs, and the window would
           be carried away at full size. See src/main/ipc/windowDrag.ts for the
           move itself and dragRegion.ts for what counts as a press on the bar.
           Normal windows keep drag, i.e. the native move and its Aero Snap. */
        -webkit-app-region: ${({ maximized }) => (maximized ? 'no-drag' : 'drag')};
    }

    .ant-tabs-nav,
    .ant-tabs-nav-container,
    .ant-tabs-nav-wrap,
    .ant-tabs-nav-scroll {
        background-color: transparent !important;
    }

    /* The tabs component also contains the page content. Keep that outer
       wrapper transparent so the main window surface remains --pl-bg. */
    .ant-tabs,
    .ant-tabs-content,
    .ant-tabs-tabpane {
        background-color: transparent !important;
    }

    .ant-tabs-nav-container,
    .ant-tabs-nav-wrap,
    .ant-tabs-nav-scroll {
        height: ${TITLE_BAR_HEIGHT}px;
    }

    .ant-tabs-nav-container {
        line-height: ${TITLE_BAR_HEIGHT}px;
    }

    .ant-tabs-nav {
        height: ${TITLE_BAR_HEIGHT}px;
    }

    .ant-tabs-nav-wrap {
        margin-bottom: 0;
    }

    .ant-tabs-nav .ant-tabs-tab {
        height: ${TITLE_BAR_HEIGHT}px;
        padding: 0 16px;
        line-height: ${TITLE_BAR_HEIGHT}px;
    }

    .ant-tabs-nav .ant-tabs-tab > span {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: ${TITLE_BAR_HEIGHT}px;
    }

    .ant-tabs-nav .ant-tabs-tab .anticon {
        margin: 0;
    }

    .ant-tabs-ink-bar {
        bottom: 0 !important;
        height: 2px !important;
        z-index: 2;
        display: block !important;
    }

    .ant-tabs-tab,
    .ant-tabs-nav-more,
    .ant-tabs-extra-content {
        -webkit-app-region: no-drag;
    }

    .ant-tabs-extra-content {
        display: flex;
        align-items: center;
        height: ${TITLE_BAR_HEIGHT}px;
    }

    ${({ compact }) =>
        compact
            ? `
                .ant-tabs-bar {
                    height: ${COMPACT_TITLE_BAR_HEIGHT}px !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    box-sizing: border-box;
                }
                .ant-tabs-nav-container,
                .ant-tabs-nav-wrap,
                .ant-tabs-nav-scroll {
                    height: ${COMPACT_TITLE_BAR_HEIGHT}px !important;
                }
                .ant-tabs-nav-container {
                    margin: 0 !important;
                    line-height: ${COMPACT_TITLE_BAR_HEIGHT}px !important;
                }
                .ant-tabs-nav {
                    height: ${COMPACT_TITLE_BAR_HEIGHT}px;
                }
                .ant-tabs-extra-content {
                    height: ${COMPACT_TITLE_BAR_HEIGHT}px !important;
                }
                .ant-tabs-nav .ant-tabs-tab {
                    margin: 0;
                    width: ${COMPACT_TITLE_BAR_HEIGHT}px;
                    height: ${COMPACT_TITLE_BAR_HEIGHT}px;
                    padding: 0;
                    line-height: ${COMPACT_TITLE_BAR_HEIGHT}px;
                    text-align: center;
                    box-sizing: border-box;
                }
                .ant-tabs-ink-bar {
                    bottom: 0 !important;
                    height: 2px !important;
                }
                .ant-tabs-nav .ant-tabs-tab > span {
                    width: ${COMPACT_TITLE_BAR_HEIGHT}px;
                    height: ${COMPACT_TITLE_BAR_HEIGHT}px;
                }
                .ant-tabs-nav .ant-tabs-tab .anticon {
                    margin: 0;
                }
            `
            : ''}

    /* While the ending mask is up the finished session has to be confirmed
       first: a session started from another page (the Kanban board buttons)
       would be killed by that very confirmation. The mask already swallows the
       clicks; dimming the tab row says so instead of looking broken, and the
       pointer guard also covers the case where the mask sits behind another
       tab. The window controls stay live, they are not page switches. */
    ${({ sessionEnding }) =>
        sessionEnding
            ? `
                .ant-tabs-nav-container {
                    pointer-events: none;
                    opacity: 0.4;
                }
            `
            : ''}
`;

const { TabPane } = Tabs;

const AppTitleBar: React.FC<Props> = ({
    currentTab,
    minimize,
    compact,
    maximized,
    sessionEnding,
    onTabChange,
    timer,
    kanban,
    history,
    setting,
    alwaysOnTop,
    onToggleAlwaysOnTop,
}) => {
    /**
     * Pointer that started a drag on the bar, or null while none is running.
     * Only the maximized window gets here; the main process moves the window
     * (see `src/main/ipc/windowDrag.ts`), this side only reports the gesture.
     */
    const dragPointerId = React.useRef<number | null>(null);

    const endWindowDrag = React.useCallback(() => {
        if (dragPointerId.current === null) {
            return;
        }

        dragPointerId.current = null;
        window.api.windowDrag('end');
    }, []);

    /**
     * Turns a press on the maximized bar into a window drag.
     *
     * Deliberately does nothing on a normal window: there the bar keeps
     * Chromium's drag region, which moves the window natively and keeps Aero
     * Snap working (see the `no-drag` note in `TitleBar`).
     */
    const startWindowDrag = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!maximized || event.button !== 0 || !isDragSurface(event.target as Element)) {
            return;
        }

        // Keeps the press from selecting text. Activation is not affected: the
        // OS raises and focuses the window before the page sees the event.
        event.preventDefault();
        dragPointerId.current = event.pointerId;
        // The window shrinks out from under the cursor while the button is held,
        // so the release is only guaranteed to arrive through the capture.
        event.currentTarget.setPointerCapture(event.pointerId);
        window.api.windowDrag('start');
    };

    React.useEffect(() => {
        // A gesture the window loses focus on (alt+tab in the middle of it) must
        // end: until it does, the main process keeps the window on the cursor.
        const onWindowBlur = () => endWindowDrag();
        window.addEventListener('blur', onWindowBlur);
        return () => window.removeEventListener('blur', onWindowBlur);
    }, [endWindowDrag]);

    const tab = (title: string, icon: string, tourKey?: string) => (
        <span
            title={title}
            data-tour={tourKey}
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
            }}
        >
            <Icon type={icon} />
            {!compact && title}
        </span>
    );

    /**
     * The page rendered inside each pane. The nodes arrive as props (the Timer
     * page has to stay mounted, see `APP_TABS.forceRender`), and this map makes
     * the pairing exhaustive: `tabType` is exactly the set of keys of
     * `APP_TABS`, so adding a page to the list fails the type check here until
     * the page is supplied too. That is the other half of the "blank tab" bug --
     * a tab the hotkeys can reach but the bar cannot fill.
     */
    const pages: { [key in tabType]: React.ReactNode } = { timer, kanban, history, setting };

    return (
        <TitleBar
            compact={compact}
            maximized={maximized}
            sessionEnding={sessionEnding}
            onPointerDown={startWindowDrag}
            onPointerUp={endWindowDrag}
            onPointerCancel={endWindowDrag}
        >
            <Tabs
                activeKey={minimize ? 'timer' : currentTab}
                onChange={(tabKey) => {
                    // Guarded, not only greyed: the tab entries are already
                    // disabled while the mask is up (see below), and this keeps
                    // every other path into `activeKey` honest as well. See
                    // `TimerState.sessionEnding` for why.
                    if (!sessionEnding) {
                        onTabChange(tabKey as tabType);
                    }
                }}
                tabBarExtraContent={
                    minimize ? null : (
                        <WindowControls
                            compact={compact}
                            maximized={maximized}
                            alwaysOnTop={alwaysOnTop}
                            onToggleAlwaysOnTop={onToggleAlwaysOnTop}
                        />
                    )
                }
            >
                {APP_TABS.map(({ key, title, icon, tourKey, forceRender }) => (
                    <TabPane
                        key={key}
                        tab={tab(title, icon, tourKey)}
                        forceRender={forceRender}
                        disabled={sessionEnding}
                    >
                        {pages[key]}
                    </TabPane>
                ))}
            </Tabs>
        </TitleBar>
    );
};

export default AppTitleBar;
