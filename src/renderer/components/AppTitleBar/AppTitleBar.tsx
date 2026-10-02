import { Icon, Tabs } from 'antd';
import * as React from 'react';
import styled from 'styled-components';
import WindowControls from '../WindowControls';
import { COMPACT_TITLE_BAR_HEIGHT, TITLE_BAR_HEIGHT } from './tokens';

interface Props {
    currentTab: string;
    minimize: boolean;
    compact: boolean;
    /** The ending mask is up: the pages must not be switched away from it. */
    sessionEnding: boolean;
    onTabChange: (tab: string) => void;
    timer: React.ReactNode;
    kanban: React.ReactNode;
    history: React.ReactNode;
    setting: React.ReactNode;
    alwaysOnTop: boolean;
    onToggleAlwaysOnTop: () => void;
}

const TitleBar = styled.div<{ compact: boolean; sessionEnding: boolean }>`
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
        -webkit-app-region: drag;
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
    sessionEnding,
    onTabChange,
    timer,
    kanban,
    history,
    setting,
    alwaysOnTop,
    onToggleAlwaysOnTop,
}) => {
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

    return (
        <TitleBar compact={compact} sessionEnding={sessionEnding}>
            <Tabs
                activeKey={minimize ? 'timer' : currentTab}
                onChange={(tabKey) => {
                    // Guarded, not only greyed: the tab entries are already
                    // disabled while the mask is up (see below), and this keeps
                    // every other path into `activeKey` honest as well. See
                    // `TimerState.sessionEnding` for why.
                    if (!sessionEnding) {
                        onTabChange(tabKey);
                    }
                }}
                tabBarExtraContent={
                    minimize ? null : (
                        <WindowControls
                            compact={compact}
                            alwaysOnTop={alwaysOnTop}
                            onToggleAlwaysOnTop={onToggleAlwaysOnTop}
                        />
                    )
                }
            >
                <TabPane
                    tab={tab('Pomodoro', 'clock-circle', 'pomodoro-tab')}
                    forceRender={true}
                    key="timer"
                    disabled={sessionEnding}
                >
                    {timer}
                </TabPane>
                <TabPane
                    tab={tab('Kanban', 'project', 'kanban-tab')}
                    forceRender={false}
                    key="kanban"
                    disabled={sessionEnding}
                >
                    {kanban}
                </TabPane>
                <TabPane
                    tab={tab('History', 'history')}
                    forceRender={false}
                    key="history"
                    disabled={sessionEnding}
                >
                    {history}
                </TabPane>
                <TabPane tab={tab('Setting', 'setting')} key="setting" disabled={sessionEnding}>
                    {setting}
                </TabPane>
            </Tabs>
        </TitleBar>
    );
};

export default AppTitleBar;
