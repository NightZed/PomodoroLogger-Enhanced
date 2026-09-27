import { Icon, Tabs } from 'antd';
import * as React from 'react';
import styled from 'styled-components';
import WindowControls from '../WindowControls';

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
    .ant-tabs-content,
    .ant-tabs-tabpane {
        -webkit-app-region: no-drag;
    }

    .ant-tabs-bar {
        margin: 0;
        height: 44px;
        box-sizing: border-box;
        background-color: transparent !important;
        -webkit-app-region: drag;
    }

    .ant-tabs,
    .ant-tabs-nav,
    .ant-tabs-nav-container,
    .ant-tabs-nav-wrap,
    .ant-tabs-nav-scroll {
        background-color: transparent !important;
    }

    .ant-tabs-nav-container,
    .ant-tabs-nav-wrap,
    .ant-tabs-nav-scroll {
        height: 44px;
    }

    .ant-tabs-nav-container {
        line-height: 44px;
    }

    .ant-tabs-nav {
        height: 44px;
    }

    .ant-tabs-nav-wrap {
        margin-bottom: 0;
    }

    .ant-tabs-nav .ant-tabs-tab {
        height: 44px;
        padding: 0 16px;
        line-height: 44px;
    }

    .ant-tabs-nav .ant-tabs-tab > span {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 44px;
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
        height: 44px;
    }

    ${({ compact }) =>
        compact
            ? `
                .ant-tabs-bar {
                    height: 32px !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    box-sizing: border-box;
                }
                .ant-tabs-nav-container,
                .ant-tabs-nav-wrap,
                .ant-tabs-nav-scroll {
                    height: 32px !important;
                }
                .ant-tabs-nav-container {
                    margin: 0 !important;
                    line-height: 32px !important;
                }
                .ant-tabs-nav {
                    height: 32px;
                }
                .ant-tabs-extra-content {
                    height: 32px !important;
                }
                .ant-tabs-nav .ant-tabs-tab {
                    margin: 0;
                    width: 32px;
                    height: 32px;
                    padding: 0;
                    line-height: 32px;
                    text-align: center;
                    box-sizing: border-box;
                }
                .ant-tabs-ink-bar {
                    bottom: 0 !important;
                    height: 2px !important;
                }
                .ant-tabs-nav .ant-tabs-tab > span {
                    width: 32px;
                    height: 32px;
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
