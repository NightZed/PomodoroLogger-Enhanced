import { Icon, Tabs } from 'antd';
import * as React from 'react';
import styled from 'styled-components';
import WindowControls from '../WindowControls';
import { COMPACT_TITLE_BAR_HEIGHT, TITLE_BAR_HEIGHT } from './tokens';

interface Props {
    currentTab: string;
    minimize: boolean;
    compact: boolean;
    onTabChange: (tab: string) => void;
    timer: React.ReactNode;
    kanban: React.ReactNode;
    history: React.ReactNode;
    setting: React.ReactNode;
    alwaysOnTop: boolean;
    onToggleAlwaysOnTop: () => void;
}

const TitleBar = styled.div<{ compact: boolean }>`
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
`;

const { TabPane } = Tabs;

const AppTitleBar: React.FC<Props> = ({
    currentTab,
    minimize,
    compact,
    onTabChange,
    timer,
    kanban,
    history,
    setting,
    alwaysOnTop,
    onToggleAlwaysOnTop,
}) => {
    const tab = (title: string, icon: string) => (
        <span
            title={title}
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
        <TitleBar compact={compact}>
            <Tabs
                activeKey={minimize ? 'timer' : currentTab}
                onChange={onTabChange}
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
                <TabPane tab={tab('Pomodoro', 'clock-circle')} forceRender={true} key="timer">
                    {timer}
                </TabPane>
                <TabPane tab={tab('Kanban', 'project')} forceRender={false} key="kanban">
                    {kanban}
                </TabPane>
                <TabPane tab={tab('History', 'history')} forceRender={false} key="history">
                    {history}
                </TabPane>
                <TabPane tab={tab('Setting', 'setting')} key="setting">
                    {setting}
                </TabPane>
            </Tabs>
        </TitleBar>
    );
};

export default AppTitleBar;
