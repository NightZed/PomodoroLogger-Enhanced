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

interface StyledProps {
    minimize: boolean;
    compact: boolean;
}

const Main = styled.div<StyledProps>`
    height: 100vh;
    overflow: hidden;

    ${({ minimize, compact }) => (minimize || compact ? 'overflow: hidden; height: 100vh;' : '')}
    /* While minimized the window is a 90px strip; dialogs of the feedback layer
       are rendered into the body (outside this container), so their mask has to
       be hidden as well -- otherwise the strip would be covered by a mask that
       cannot be clicked away (maskClosable is false for blocking dialogs).
       The tabs bar is hidden too: only its 1px bottom border would remain, and
       the strip's content height (MiniLogger 90px) must match the window
       content size exactly (see ipc.ts setContentSize). */
    .ant-tabs-bar,
    .ant-tabs-nav-container,
    .ant-modal-content,
    .ant-modal-mask {
        ${({ minimize }) => (minimize ? 'display: none;' : '')}
    }
    .ant-btn-icon-only > i {
        transform: translateY(-0.5px);
    }

    * {
        outline: none;
    }
`;

interface Props extends TimerActionTypes, HistoryActionCreatorTypes {
    currentTab: string;
    minimize: boolean;
    compact: boolean;

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
                this.props.switchTab(1);
                break;
            case 'ctrl+shift+tab':
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
        const { currentTab, changeAppTab, minimize, compact, setCompact } = this.props;
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
                <AppTitleBar
                    currentTab={currentTab}
                    minimize={minimize}
                    compact={compact}
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
            </Main>
        );
    }
}

const ApplicationContainer = connect(
    (state: RootState) => ({
        currentTab: state.timer.currentTab,
        minimize: state.timer.minimize,
        compact: state.timer.compact,
    }),
    genMapDispatchToProp<TimerActionTypes & HistoryActionCreatorTypes>({
        ...timerActions,
        ...historyActions,
        fetchKanban: kanbanActions.boardActions.fetchBoards,
    })
)(Application);

export default hot(ApplicationContainer);
