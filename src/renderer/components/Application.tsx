import 'antd/dist/antd.css';
import { ipcRenderer } from 'electron';
import * as React from 'react';
import ReactHotkeys from 'react-hot-keys';
import { hot } from 'react-hot-loader/root';
import { connect } from 'react-redux';
import styled from 'styled-components';
import { IpcEventName } from '../../main/ipc/type';
import { loadDBs } from '../dbs';
import { RootState } from '../reducers';
import { genMapDispatchToProp } from '../utils';
import { DestroyOnTimeoutWrapper } from './DestroyOnTimeoutWrapper';
import History from './History';
import { actions as historyActions, HistoryActionCreatorTypes } from './History/action';
import Kanban from './Kanban';
import { CardInDetail } from './Kanban/Card/CardEditor';
import { kanbanActions } from './Kanban/reducer';
import Setting from './Setting';
import Timer from './Timer';
import { actions as timerActions, TimerActionTypes } from './Timer/action';
import { setTrayImageWithMadeIcon } from './Timer/iconMaker';
import { UpdateController } from './UpdateController';
import { UserGuide } from './UserGuide/UserGuide';
import { ConnectedPomodoroSankey } from './Visualization/PomodoroSankey';
import AppTitleBar from './AppTitleBar/AppTitleBar';
import { titleBarBandHeight } from './AppTitleBar/tokens';
import { POPUP_CONTAINER_ID } from './popupLayer';

/**
 * Window layer stack, bottom to top, and the setting that sizes each layer:
 *
 * | layer              | element        | setting                  |
 * | ------------------ | -------------- | ------------------------ |
 * | window surfaces    | `Main::before` | `themeBackgroundOpacity` |
 * | wallpaper          | `Wallpaper`    | `wallpaperOpacity`       |
 * | content + overlays | `Content`      | `contentOpacity`         |
 *
 * `Main::before` paints the two window surfaces -- the elevated band behind the
 * tab bar, then the page -- as ONE layer split into two non overlapping bands.
 * The background opacity is therefore applied exactly once per band, and the
 * title bar differs from the page below it only in its base color. The wallpaper
 * sits above both bands, which is what keeps it visible through the title bar.
 *
 * The three settings are independent on purpose (a translucent background must
 * not dim the text, and vice versa) and each has exactly one output path: the
 * surfaces travel as the `--pl-theme-bg-opacity` custom property written by
 * `ThemeController`, the other two are plain element opacities.
 */
interface StyledProps {
    minimize: boolean;
    compact: boolean;
}

const Main = styled.div<StyledProps>`
    position: relative;
    height: 100vh;
    overflow: hidden;
    /* Keep a barely visible hit-test surface so transparent Windows do not
       pass pointer events through to the desktop. */
    background-color: rgba(0, 0, 0, 0.01);
    border-radius: ${({ minimize, compact }) => (minimize ? '10px' : compact ? '16px' : '12px')};
    border: 1px solid var(--pl-border);
    box-sizing: border-box;

    /* Height of the elevated band, i.e. the tab bar that doubles as the window
       title bar. Mini mode hides that bar, so the band collapses and the whole
       window is page surface. The numbers come from AppTitleBar/tokens.ts so
       the band and the bar can never disagree. */
    --pl-titlebar-height: ${({ minimize, compact }) => titleBarBandHeight({ minimize, compact })};
    --pl-header-surface: color-mix(
        in srgb,
        var(--pl-bg-elevated) var(--pl-theme-bg-opacity),
        transparent
    );
    --pl-body-surface: color-mix(in srgb, var(--pl-bg) var(--pl-theme-bg-opacity), transparent);

    &::before {
        content: '';
        position: absolute;
        inset: 0;
        z-index: 0;
        pointer-events: none;
        /* Both window surfaces painted as ONE layer in two non overlapping
           bands, so themeBackgroundOpacity is applied exactly once per band and
           the title bar differs from the page below it only in its base color.
           A separate band painted on top of this layer would apply the opacity
           a second time there (the header used to end up at 2t - t squared).
           The layer sits below the wallpaper, so the wallpaper keeps showing
           through the bar. The consequence is that a fully opaque wallpaper
           hides both bands equally, leaving the 1px border under the bar as the
           separator. */
        background-image: linear-gradient(
            to bottom,
            var(--pl-header-surface) 0 var(--pl-titlebar-height),
            var(--pl-body-surface) var(--pl-titlebar-height) 100%
        );
    }

    ${({ minimize, compact }) => (minimize || compact ? 'overflow: hidden; height: 100vh;' : '')}
    /* While minimized the window is a 90px strip; dialogs are now mounted
       inside this container (see popupLayer.ts), so they have to be hidden
       while the strip is up -- otherwise a blocking dialog (maskClosable is
       false) would cover the strip and could not be clicked away. The whole
       ant-modal-root is hidden rather than just its mask and content: the
       ant-modal-wrap element is a full-viewport position:fixed box, and leaving
       it behind would keep swallowing every click on the strip.
       The tabs bar is hidden too: only its 1px bottom border would remain, and
       the strip's content height (MiniLogger 90px) must match the window
       content size exactly (see ipc.ts setContentSize). */
    .ant-tabs-bar,
    .ant-tabs-nav-container,
    .ant-modal-root {
        ${({ minimize }) => (minimize ? 'display: none;' : '')}
    }
    .ant-btn-icon-only > i {
        transform: translateY(-0.5px);
    }

    * {
        outline: none;
    }
`;

const Wallpaper = styled.div<{ path?: string; opacity: number }>`
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: none;

    &::before {
        content: '';
        position: absolute;
        inset: 0;
        background-image: ${({ path }) => (path ? `url("${path}")` : 'none')};
        background-position: center;
        background-size: cover;
        background-repeat: no-repeat;
        opacity: ${({ opacity }) => opacity};
    }
`;

const Content = styled.div<{ contentOpacity: number }>`
    position: relative;
    z-index: 2;
    height: 100%;
    opacity: ${({ contentOpacity }) => contentOpacity};
`;

interface Props extends TimerActionTypes, HistoryActionCreatorTypes {
    currentTab: string;
    minimize: boolean;
    compact: boolean;
    compactAlwaysOnTop: boolean;
    contentOpacity: number;
    wallpaperDataUrl?: string;
    wallpaperOpacity: number;
    /** The ending mask is up: the pages must not be switched away from it. */
    sessionEnding: boolean;

    fetchKanban: () => void;
}

class Application extends React.Component<Props> {
    private timer = (<Timer />);
    private returnToCompact = false;

    componentDidUpdate(prevProps: Props): void {
        if (!prevProps.compact && this.props.compact) {
            this.returnToCompact = true;
        } else if (prevProps.compact && !this.props.compact && this.props.currentTab === 'timer') {
            this.returnToCompact = false;
        }
    }

    componentDidMount(): void {
        loadDBs(['settingDB']).then(() => {
            this.props.fetchSettings();
            this.props.fetchKanban();
        });

        setTrayImageWithMadeIcon(undefined).then();
        window.addEventListener('error', this.onError);
    }

    onKeyDown = (keyname: string) => {
        switch (keyname) {
            case 'ctrl+tab':
                // The ending mask owns the window until the finished session is
                // confirmed: switching pages there would reach the Kanban board
                // buttons, which start a session that the confirmation then
                // kills. See `TimerState.sessionEnding`.
                if (this.props.sessionEnding) {
                    break;
                }

                this.props.switchTab(1);
                break;
            case 'ctrl+shift+tab':
                if (this.props.sessionEnding) {
                    break;
                }

                this.props.switchTab(-1);
                break;
            case 'ctrl+f12':
                window.api.openDevTools();
                break;
            case 'ctrl+q':
                ipcRenderer.send(IpcEventName.Quit, 'quit');
                break;
            case 'f11':
                this.returnToCompact = !this.props.compact;
                this.props.setCompact(!this.props.compact);
                break;
            case 'f12':
                this.props.setMinimize(!this.props.minimize);
                break;
        }
    };

    componentWillUnmount() {
        window.removeEventListener('error', this.onError);
    }

    onError = (event: ErrorEvent) => this.handleError(event.error);
    handleError = (err: Error) => {
        console.error(err);
        setTimeout(() => {
            if (process.env.NODE_ENV === 'production') {
                ipcRenderer.send(IpcEventName.Restart, 'error');
            }
        }, 3000);
    };

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
        if (process.env.NODE_ENV === 'production') {
            this.handleError(error);
        }
    }

    render() {
        const {
            currentTab,
            changeAppTab,
            minimize,
            compact,
            compactAlwaysOnTop,
            contentOpacity,
            wallpaperDataUrl,
            wallpaperOpacity,
            sessionEnding,
            setCompact,
            setCompactAlwaysOnTop,
        } = this.props;
        const handleTabChange = (tab: string) => {
            if (tab === 'timer') {
                if (this.returnToCompact && !compact) {
                    setCompact(true);
                }
            } else if (compact) {
                this.returnToCompact = true;
                setCompact(false);
            }
            changeAppTab(tab as any);
        };
        return (
            <Main minimize={minimize} compact={compact}>
                <Wallpaper path={wallpaperDataUrl} opacity={wallpaperOpacity} />
                <Content contentOpacity={contentOpacity}>
                    {/* Mount point of every antd overlay (dialogs, toasts,
                        notifications, popovers). It lives inside the content
                        layer so those surfaces fade with the page instead of
                        escaping to <body>, see popupLayer.ts. */}
                    <div id={POPUP_CONTAINER_ID} />
                    <AppTitleBar
                        currentTab={currentTab}
                        minimize={minimize}
                        compact={compact}
                        sessionEnding={sessionEnding}
                        alwaysOnTop={compactAlwaysOnTop}
                        onToggleAlwaysOnTop={() => setCompactAlwaysOnTop(!compactAlwaysOnTop)}
                        onTabChange={handleTabChange}
                        timer={this.timer}
                        kanban={
                            <DestroyOnTimeoutWrapper
                                isVisible={currentTab === 'kanban'}
                                timeout={600000}
                            >
                                <Kanban />
                            </DestroyOnTimeoutWrapper>
                        }
                        history={
                            <DestroyOnTimeoutWrapper
                                isVisible={currentTab === 'history'}
                                timeout={600000}
                            >
                                <History />
                            </DestroyOnTimeoutWrapper>
                        }
                        setting={<Setting />}
                    />
                    {!minimize && (
                        <>
                            <UserGuide />
                            <UpdateController />
                            <CardInDetail />
                            <ConnectedPomodoroSankey />
                        </>
                    )}
                    <ReactHotkeys
                        keyName={'ctrl+tab,ctrl+shift+tab,ctrl+f12,ctrl+q,f11,f12'}
                        onKeyDown={this.onKeyDown}
                    />
                </Content>
            </Main>
        );
    }
}

const ApplicationContainer = connect(
    (state: RootState) => ({
        currentTab: state.timer.currentTab,
        minimize: state.timer.minimize,
        compact: state.timer.compact,
        compactAlwaysOnTop: state.timer.compactAlwaysOnTop,
        contentOpacity: state.timer.contentOpacity,
        wallpaperDataUrl: state.timer.wallpaperDataUrl,
        wallpaperOpacity: state.timer.wallpaperOpacity,
        sessionEnding: state.timer.sessionEnding,
    }),
    genMapDispatchToProp<TimerActionTypes & HistoryActionCreatorTypes>({
        ...timerActions,
        ...historyActions,
        fetchKanban: kanbanActions.boardActions.fetchBoards,
    })
)(Application);

export default hot(ApplicationContainer);
