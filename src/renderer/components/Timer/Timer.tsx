import { Button, Divider, Icon, Tooltip } from 'antd';
import * as remote from '@electron/remote';
import { debounce } from 'lodash';
import React, { Component } from 'react';
import ReactHotkeys from 'react-hot-keys';
import styled from 'styled-components';
import { MiniLogger } from '../../../components/common/Mini/MiniLogger';
import { DEBUG_TIME_SCALE, __DEV__ } from '../../../config';
import dingMp3 from '../../../res/ding.mp3';
import AppIcon from '../../../res/icon.png';
import { EfficiencyAnalyser } from '../../../shared/efficiency/efficiency';
import { Monitor } from '../../monitor';
import { getTodaySessions } from '../../monitor/sessionManager';
import { PomodoroRecord } from '../../monitor/type';
import { RootState } from '../../reducers';
import { tabMaxHeight, thinScrollBar } from '../../style/scrollbar';
import { isShallowEqual, isShallowEqualByKeys } from '../../utils';
import { workers } from '../../workers';
import { KanbanActionTypes } from '../Kanban/action';
import Board from '../Kanban/Board';
import { BoardActionTypes } from '../Kanban/Board/action';
import { HelpIcon } from '../UserGuide/HelpIcon';
import backIcon from '../../../res/back.svg';
import { DAY_THEME_ID, NIGHT_THEME_ID } from '../../theme/tokens';
import { PomodoroDualPieChart } from '../Visualization/DualPieChart';
import { AsyncWordCloud } from '../Visualization/WordCloud';
import {
    inferProject,
    LONG_BREAK_INTERVAL,
    resolveSessionProjectId,
    TimerActionTypes as ThisActionTypes,
    uiStateNames,
} from './action';
import { FocusSelector } from './FocusSelector';
import {
    DONT_REMIND_AGAIN_LABEL,
    FocusStartWarning,
    getFocusStartWarningIfEnabled,
} from './focusStartWarning';
import { setTrayImageWithMadeIcon } from './iconMaker';
import { PomodoroNumView } from './PomodoroNumView';
import Progress from './Progress';
import { feedback, FEEDBACK_MESSAGES } from '../feedback';
import { hasSession, namedSessionAction, trayMenuItems, TrayActionKey } from './sessionState';
import { TimerMask } from './SessionEndingMask';
import { waitUntil } from './wait';
import { WorkRestIcon } from './WorkRestIcon';

const setMenuItems: (...args: any) => void = remote.getGlobal('setMenuItems');

const KanbanName = styled.h1`
    position: relative;
    margin: 0;
    padding-left: 12px;
    padding-right: 32px;
    font-size: 1.5em;
    transition: color 0.2s;
    user-select: none;
    cursor: pointer;
    :hover {
        color: rgb(85, 87, 240);
    }
    .kanban-name-arrow {
        position: absolute;
        right: 28px;
        top: 50%;
        transform: translateY(-50%);
        height: 22px;
        width: 22px;
        padding: 0;
        font-size: 16px;
        line-height: 1;
        border: none;
        svg {
            transform: scaleX(-1);
        }
    }
`;

const CompactModeIcon = styled.span<{ compact: boolean }>`
    display: inline-block;
    width: ${({ compact }) => (compact ? '14px' : '8px')};
    height: ${({ compact }) => (compact ? '8px' : '14px')};
    border: 1px solid currentColor;
    border-radius: 1px;
    vertical-align: middle;
`;

const ProgressTextContainer = styled.div`
    user-select: none;
    margin-top: -50px;
    padding: 12px;
    text-align: center;
    transform: translateY(0.4em);
`;

const TimerLayout = styled.div<{ compact: boolean }>`
    position: relative;
    padding: 0 24px 0 24px;
    overflow-y: ${({ compact }) => (compact ? 'hidden' : 'auto')};
    width: 100%;
    height: calc(100vh - 44px);
    ${({ compact }) =>
        compact
            ? `
                height: calc(100vh - 32px);
                padding: 0 8px;
            `
            : ''}
    ${thinScrollBar}
`;

const TimerInnerLayout = styled.div<{ compact: boolean }>`
    overflow-x: hidden;
    min-width: 350px;
    max-width: 850px;
    margin: 0 auto;
    padding-top: ${({ compact }) => (compact ? '16px' : '32px')};
    ${({ compact }) =>
        compact
            ? `
                min-width: 0;
                max-width: 380px;
                padding-top: 36px;
            `
            : ''}
`;

const Layout = styled.div`
    display: flex;
    flex: auto;
    flex-direction: row;
`;

const MySider = styled.aside`
    position: relative;
    flex: 0 0 300px;
    padding: 6px;
    border-right: 1px solid var(--pl-border);
    background-color: var(--pl-bg-sunken);
    float: left;
    box-shadow: 2px 0 6px 0 var(--pl-shadow);
    transition: margin-left 0.2s;
    ${tabMaxHeight}
`;

const ProgressContainer = styled.div`
    max-width: 800px;
    margin: 0 auto;
    width: 100%;
    position: relative;
    padding: 0px;
    display: flex;
    justify-content: center;
`;

const ButtonRow = styled.div`
    width: 100%;
    max-width: 200px;
    display: flex;
    justify-content: space-around;
    font-size: 32px;
    margin: 0 auto 22px auto;
    color: var(--pl-text);

    i {
        transition: transform 0.2s;
    }

    i:hover {
        transform: scale(1.2);
    }
`;

const MoreInfo = styled.div`
    margin: 10px auto;
`;

const ThemeToggleRow = styled.div`
    margin: 0.6em auto 0 auto;
    text-align: center;
    line-height: 1;
`;

const ThemeToggle = styled(Icon)`
    font-size: 18px;
    color: var(--pl-text-secondary);
    cursor: pointer;
    transition: color 0.2s, transform 0.2s;

    :hover {
        color: var(--pl-primary);
        transform: scale(1.15);
    }
`;

export interface Props extends ThisActionTypes, KanbanActionTypes, RootState, BoardActionTypes {}

function to2digits(num: number) {
    if (num < 10) {
        return `0${num}`;
    }

    return num;
}

function _joinDict<T>(maps: { [key: string]: T }[]): { [key: string]: T } {
    const dict: { [key: string]: T } = {};
    for (const d of maps) {
        for (const key in d) {
            dict[key] = d[key];
        }
    }

    return dict;
}

interface State {
    leftTime: string;
    percent: number;
    showSider: boolean;
    more: boolean;
    pomodorosToday: PomodoroRecord[];
    pomodoroNum: number;
    focusStartWarning?: FocusStartWarning;
    /** Board explicitly selected by the current start request, if any. */
    focusStartWarningBoardId?: string;
    /** Reflects the "Don't remind me again" check box of the warning dialog. */
    focusStartWarningDontRemind: boolean;
    /**
     * Project inferred for the staged session (see `onFocusingSessionDone`).
     * The ending mask shows it so a wrong guess can still be corrected; it is
     * the project the record gets unless the user picks another one there.
     */
    stagedProjectId?: string;
}

class Timer extends Component<Props, State> {
    interval?: any;
    monitor?: Monitor;
    /**
     * What to start automatically once the ending mask is confirmed. The
     * mask's own "Start" button queues the cycle's next session (`onStart`);
     * the tray items and F5 queue the session they name instead. Always
     * consumed (and cleared) by `onSessionConfirmed` once the record is in.
     */
    private nextSessionStarter?: () => void;
    mainDiv: React.RefObject<HTMLDivElement>;
    sound: React.RefObject<HTMLAudioElement>;
    extendedTimeInMinute: number;
    efficiencyAnalyser: EfficiencyAnalyser;
    private stagedSession?: PomodoroRecord;
    /**
     * Prediction of the staged session's project. Started when the session ends
     * and awaited when the ending mask is confirmed, so the attribution does not
     * depend on how fast the user clicks. `undefined` when a project was already
     * selected, i.e. when there is nothing to predict.
     */
    private projectInference?: Promise<string | undefined>;
    selfRef: React.RefObject<HTMLDivElement> = React.createRef();
    private componentGone = false;
    /**
     * The open "no project / no cards" confirmation, if any. A new start request
     * destroys the previous dialog instead of stacking another one on top.
     */
    private focusStartWarningModal?: ReturnType<typeof feedback.confirm>;

    constructor(props: Props) {
        super(props);
        this.state = {
            leftTime: '',
            percent: 0,
            more: false,
            pomodorosToday: [],
            pomodoroNum: 0,
            showSider: true,
            focusStartWarningDontRemind: false,
            stagedProjectId: undefined,
        };
        this.mainDiv = React.createRef<HTMLDivElement>();
        this.sound = React.createRef<HTMLAudioElement>();
        this.extendedTimeInMinute = 0;
        this.efficiencyAnalyser = new EfficiencyAnalyser([]);
    }

    onResize = () => {
        if (!this.selfRef.current) {
            return;
        }

        if (this.selfRef.current.clientWidth < 700) {
            if (this.state.showSider) {
                this.setState({ showSider: false });
            }
        }
    };

    componentDidMount(): void {
        this.efficiencyAnalyser = new EfficiencyAnalyser(this.props.timer.distractingList);
        this.interval = setInterval(this.updateLeftTime, 500);
        this.updateLeftTime();
        this.selfRef.current!.addEventListener('resize', this.onResize);
        this.selfRef.current!.addEventListener('keydown', this.handleNativeKeydown);
        this.props.setTimerManager({
            pause: this.onPause,
            start: this.startFocusing,
        });
        getTodaySessions()
            .then((finishedSessions) => {
                // 组件可能已在查询完成前卸载，此时不再更新状态
                if (this.componentGone) {
                    return;
                }

                finishedSessions.sort((a, b) => a.startTime - b.startTime);
                this.setState({
                    pomodorosToday: finishedSessions,
                    pomodoroNum: finishedSessions.length,
                });
            })
            .catch((err) => {
                // The timer page still works without the list, so a failed query
                // is logged instead of surfacing as an unhandled rejection.
                console.error('[Timer] failed to load today sessions', err);
            });

        this.addMenuItems();
        workers.dbWorkers.sessionDB
            .count({})
            .then((size) => workers.knn.loadModel(size))
            .catch((err) => {
                console.error('[Timer] failed to load the knn model', err);
            });
    }

    handleNativeKeydown = (event: KeyboardEvent) => {
        if (event.key === 'Tab' || event.which === 9 || event.keyCode === 9) {
            event.preventDefault();
        }
    };

    shouldComponentUpdate(
        nextProps: Readonly<Props>,
        nextState: Readonly<State>,
        _nextContext: any
    ): boolean {
        if (!isShallowEqual(this.state, nextState)) {
            return true;
        }

        const next = nextProps.timer;
        const _this = this.props.timer;
        return !isShallowEqualByKeys(next, _this, uiStateNames);
    }

    /**
     * (Re)builds the tray menu for the current state.
     *
     * The menu is state dependent -- `Pause` becomes `Continue`, and the entries
     * a session owns are greyed while it runs (the matrix lives in
     * `sessionState.trayMenuItems`) -- so this runs again whenever that state
     * changes, see `componentDidUpdate`. Every entry reuses the handler the
     * window would use, so the tray cannot drift away from the page again.
     */
    addMenuItems(): void {
        const clickHandlers: { [key in TrayActionKey]: () => void } = {
            startFocusing: () => {
                // While the ending mask is up, first dismiss the mask and then
                // start exactly what this label names — not the cycle's next
                // session. Starting (or resuming the expired timer) before the
                // mask is confirmed would corrupt the staged session; see
                // `confirmMaskAndStart`.
                if (this.props.timer.sessionEnding) {
                    this.confirmMaskAndStart(true);
                    return;
                }

                // The label names the session, so the named session wins (or
                // the request is refused out loud); see `startNamedSession` for
                // the whole decision table.
                this.startNamedSession(true);
            },
            startBreak: () => {
                if (this.props.timer.sessionEnding) {
                    this.confirmMaskAndStart(false);
                    return;
                }

                this.startNamedSession(false);
            },
            // One handler for both labels: it pauses while the session runs and
            // resumes it while it is paused, exactly like the page's play button.
            pauseOrContinue: this.onPauseResumeOrStart,
            // The page's Finish button, as a menu entry: end the session now and
            // keep what it recorded.
            finish: () => this.onFinishButtonClick(),
            stop: this.onStop,
        };

        setMenuItems(
            trayMenuItems(this.props.timer).map(({ key, label, enabled }) => ({
                label,
                type: 'normal',
                enabled,
                click: clickHandlers[key],
            }))
        );
    }

    componentDidUpdate(prevProps: Props): void {
        // The tray menu says which actions are available, so it has to be
        // rebuilt when that changes. Only the fields `trayMenuItems` reads are
        // compared: rebuilding on anything else would call into the main
        // process twice a second for nothing.
        const trayStateKeys = ['isRunning', 'isFocusing', 'targetTime', 'sessionEnding'];
        if (!isShallowEqualByKeys(prevProps.timer, this.props.timer, trayStateKeys)) {
            this.addMenuItems();
        }

        // The focusing project (`timer.boardId`) can be deleted on the kanban
        // page while it is still selected here. Deleting a board only removes
        // it from `kanban.boards`, so the selection would keep pointing at a
        // board that no longer exists (a dangling entry in `FocusSelector` and
        // a focus target that can never be resolved). Clear it as soon as the
        // referenced board disappears.
        const { boardId } = this.props.timer;
        if (boardId !== undefined && this.props.kanban.boards[boardId] === undefined) {
            this.props.setBoardId(undefined);
        }
    }

    componentWillUnmount(): void {
        this.componentGone = true;
        if (this.monitor) {
            this.monitor.stop();
            this.monitor.clear();
        }

        if (this.interval) {
            clearInterval(this.interval);
        }

        this.selfRef.current?.removeEventListener('resize', this.onResize);
        this.selfRef.current?.removeEventListener('keydown', this.handleNativeKeydown);
    }

    updateLeftTime = () => {
        // TODO: refactor this and add small tests
        const { targetTime, isRunning } = this.props.timer;
        if (!isRunning || !targetTime) {
            return;
        }

        const now = new Date().getTime();
        const timeSpan = targetTime - now;
        const sec = Math.floor(timeSpan / 1000 + 0.5);
        if (sec < 0) {
            this.onDone().catch(console.error);
            return;
        }

        const leftTime = `${to2digits(Math.floor(sec / 60))}:${to2digits(sec % 60)}`;
        const percent = 100 - timeSpan / 10 / (this.getDuration() + this.extendedTimeInMinute * 60);
        if (leftTime.slice(0, 2) !== this.state.leftTime.slice(0, 2)) {
            setTrayImageWithMadeIcon(
                leftTime.slice(0, 2),
                percent / 100,
                this.props.timer.isFocusing
            ).catch(console.error);
        }

        if (leftTime !== this.state.leftTime) {
            this.setState({ leftTime });
        }

        if (Math.abs(percent - this.state.percent) > 2 || percent === 0) {
            this.setState({ percent });
        }
    };

    onPauseResumeOrStart = () => {
        if (this.props.timer.isRunning) {
            this.onPause();
        } else {
            this.startOrResume();
        }
    };

    startFocusing = async (boardId?: string) => {
        // The ending mask owns this transition while it is up: it records the
        // finished session and flips the mode itself, and a session started now
        // would either be killed by `timerFinished` on confirmation or resume the
        // expired timer (double prompt). Switching to the Kanban page is blocked
        // while the mask is up (see `AppTitleBar`), so this is the second line of
        // defence rather than a user facing refusal.
        if (this.props.timer.sessionEnding) {
            return;
        }

        if (boardId !== undefined && this.props.timer.boardId !== boardId) {
            // Kanban dispatches SET_BOARD_ID before invoking this manager, but
            // the connected Timer props can still contain the previous value
            // until React processes the store update. Keep the request
            // explicit and apply the selection here as a safeguard.
            this.props.setBoardId(boardId);
        }

        if (this.props.timer.isRunning) {
            if (this.props.timer.isFocusing) {
                return;
            }

            this.onStop();
            await new Promise((r) => requestAnimationFrame(r));
        }

        if (!this.props.timer.isFocusing) {
            // A board's own "Start Focusing" makes the session it names win,
            // paused break included, and a switch drops whatever it replaces
            // (the running case above was cleared already). Going through the
            // guarded `switchMode` used to toast and then leave the `waitUntil`
            // below to time out, so the board was never focused on at all.
            this.performModeSwitch();
            await waitUntil(() => this.props.timer.isFocusing);
        }

        this.startOrResume(boardId);
    };

    startOrResume = (boardId?: string) => {
        if (this.props.timer.isRunning) {
            return;
        }

        if (this.props.timer.targetTime == null) {
            return this.onStart(boardId);
        }

        this.onResume();
    };

    private onResume() {
        this.props.continueTimer();
        setTrayImageWithMadeIcon(
            this.state.leftTime.slice(0, 2),
            this.state.percent / 100,
            this.props.timer.isFocusing,
            false
        ).catch(console.error);
        if (this.monitor) {
            this.monitor.resume();
        } else {
            this.monitor = new Monitor(() => {}, 1000, this.props.timer.screenShotInterval);
            this.monitor.start();
        }
    }

    onPause = () => {
        this.props.pauseTimer();
        setTrayImageWithMadeIcon(
            this.state.leftTime.slice(0, 2),
            this.state.percent / 100,
            this.props.timer.isFocusing,
            true
        ).catch(console.error);
        if (this.monitor) {
            this.monitor.stop();
        }
    };

    onStart = (boardId?: string) => {
        if (!this.props.timer.isFocusing) {
            return this.startResting();
        }

        // Warn once before a fresh focus session when there is no project to
        // link it to, or the selected project's "In Progress" list is empty.
        return this.startFocusingSession(false, boardId);
    };

    private startResting = () => {
        this.props.startTimer();
        requestAnimationFrame(this.updateLeftTime);
    };

    private startFocusingSession = (acknowledged: boolean, boardId?: string) => {
        if (this.props.timer.isRunning || this.props.timer.targetTime != null) {
            return;
        }

        if (!acknowledged) {
            // Warn only while the user still wants to be reminded.
            // Prefer the board explicitly selected by a Kanban start
            // request. The Redux-connected props may not have received
            // SET_BOARD_ID yet when this method is called.
            const focusBoardId = boardId !== undefined ? boardId : this.props.timer.boardId;
            const warning = getFocusStartWarningIfEnabled(
                this.props.timer.warnBeforeFocusStart,
                focusBoardId,
                this.props.kanban.boards,
                this.props.kanban.lists,
                this.props.kanban.cards
            );
            if (warning) {
                // Ask through the feedback layer's blocking dialog so the other
                // decisions of the app look and behave the same way. Keep the
                // request's board as well: the user may confirm before the
                // connected Timer has rendered the SET_BOARD_ID update.
                this.showFocusStartWarning(warning, focusBoardId);
                return;
            }
        }

        this.setState({
            focusStartWarning: undefined,
            focusStartWarningBoardId: undefined,
            focusStartWarningDontRemind: false,
        });
        this.monitor = new Monitor(() => {}, 1000, this.props.timer.screenShotInterval);
        this.monitor.start();

        this.props.startTimer();
        requestAnimationFrame(this.updateLeftTime);
    };

    private confirmFocusStart = () => {
        this.applyDontRemindSetting();
        this.startFocusingSession(true, this.state.focusStartWarningBoardId);
    };

    private cancelFocusStart = () => {
        this.applyDontRemindSetting();
        this.setState({
            focusStartWarning: undefined,
            focusStartWarningBoardId: undefined,
            focusStartWarningDontRemind: false,
        });
    };

    /**
     * Asks whether a fresh focus session should start although it cannot be
     * linked to a project / to any In Progress card.
     *
     * The dialog comes from the feedback layer, so this decision looks and
     * behaves like every other one in the app: centered, masked, Escape or the
     * cross cancels. The "Don't remind me again" box is answered through
     * `state`, which both `confirmFocusStart` and `cancelFocusStart` read.
     */
    private showFocusStartWarning = (warning: FocusStartWarning, boardId?: string) => {
        if (this.focusStartWarningModal) {
            // A newer request wins: replace the pending dialog instead of
            // stacking a second one on top of it.
            this.focusStartWarningModal.destroy();
        }

        this.setState({
            focusStartWarning: warning,
            focusStartWarningBoardId: boardId,
            focusStartWarningDontRemind: false,
        });
        this.focusStartWarningModal = feedback.confirm({
            kind: 'warning',
            title: warning.title,
            content: warning.content,
            checkbox: {
                label: DONT_REMIND_AGAIN_LABEL,
                checked: false,
                onChange: this.onToggleDontRemind,
            },
            okText: 'OK',
            cancelText: 'Cancel',
            onOk: this.confirmFocusStart,
            onCancel: this.cancelFocusStart,
        });
    };

    private onToggleDontRemind = (checked: boolean) => {
        this.setState({ focusStartWarningDontRemind: checked });
    };

    /**
     * Persist the "Don't remind me again" check box. It is honoured both when
     * the user starts the session anyway and when the start is cancelled.
     */
    private applyDontRemindSetting = () => {
        if (this.state.focusStartWarningDontRemind && this.props.timer.warnBeforeFocusStart) {
            this.props.setWarnBeforeFocusStart(false);
        }
    };

    private getDuration = (isFocusing?: boolean) => {
        if (isFocusing === undefined) {
            // tslint:disable-next-line:no-parameter-reassignment
            isFocusing = this.props.timer.isFocusing;
        }

        const isLongBreak = this.props.timer.iBreak % LONG_BREAK_INTERVAL === 0;
        return isFocusing
            ? this.props.timer.focusDuration
            : isLongBreak
            ? this.props.timer.longBreakDuration
            : this.props.timer.restDuration;
    };

    private defaultLeftTime = (isFocusing?: boolean) => {
        return `${to2digits(this.getDuration(isFocusing) / 60)}:00`;
    };

    /**
     * Reset the display only: default left time, zero progress, tray icon. The
     * session itself is untouched -- `onPause` keeps it, `onStop` discards it.
     */
    private resetStat = () => {
        setTrayImageWithMadeIcon(undefined).catch(console.error);
        this.setState((_, props) => ({
            leftTime: this.defaultLeftTime(props.timer.isFocusing),
            percent: 0,
        }));
    };

    /**
     * Discard the current session: stop the timer, drop what the monitor
     * collected for it and reset the display. This is what the "Stop" button,
     * the tray entry and the mini window call; pausing is `onPause`.
     */
    onStop = () => {
        this.props.stopTimer();
        if (this.monitor) {
            this.monitor.stop();
            this.monitor.clear();
        }

        this.resetStat();
        this.extendedTimeInMinute = 0;
    };

    onDone = async (shouldRemind: boolean = true, isRotten?: boolean) => {
        if (this.props.timer.isFocusing) {
            await this.onFocusingSessionDone(shouldRemind, isRotten);
        } else if (shouldRemind) {
            window.api.notify(
                'Resting session ended',
                `Completed ${this.state.pomodoroNum} sessions today. \n\n`,
                `${__dirname}/${AppIcon}`
            );
        }

        // The mask is app-wide state (see `TimerState.sessionEnding`): while the
        // finished session waits for its confirmation, the pages must not be
        // switched either, so this cannot live in the component.
        this.props.setSessionEnding(true);
        this.props.pauseTimer();
        this.props.changeAppTab('timer');
        this.resetStat();
        if (shouldRemind) {
            this.focusOnCurrentWindow();
            this.remindUserTimeout(0);
            this.remindUserTimeout(60 * 1000, 1.0);
        }
    };

    private onFocusingSessionDone = async (shouldRemind = true, isRotten = false) => {
        if (!this.monitor) {
            throw new Error('No monitor');
        }

        if (shouldRemind) {
            window.api.notify(
                'Focusing finished. Start resting.',
                `Completed ${this.state.pomodoroNum + 1} sessions today. \n\n`,
                `${__dirname}/${AppIcon}`
            );
        }

        const thisSession = this.monitor.sessionData;
        if (!isRotten) {
            thisSession.spentTimeInHour = this.props.timer.focusDuration / 3600;
        } else {
            const elapsedTimeInSec = this.getElapsedTimeInSecond();
            thisSession.spentTimeInHour = elapsedTimeInSec / 3600;
            thisSession.isRotten = true;
        }

        this.stagedSession = thisSession;

        if (__DEV__) {
            for (const app in this.stagedSession.apps) {
                this.stagedSession.apps[app].spentTimeInHour *= DEBUG_TIME_SCALE;
            }

            if (this.stagedSession.switchActivities) {
                for (let i = 0; i < this.stagedSession.switchActivities.length; i += 1) {
                    this.stagedSession.stayTimeInSecond![i] *= DEBUG_TIME_SCALE;
                }
            }
        }

        this.calculateSessionEfficiency();
        this.monitor.stop();
        if (this.props.timer.boardId === undefined) {
            // The user did not select a focusing project: ask the model which
            // project this session probably belongs to. The answer is written
            // into the session record when the mask is confirmed (see
            // `onSessionConfirmed`) and never into `timer.boardId`, so a guess
            // cannot silently become the focusing selection of later sessions.
            this.projectInference = inferProject(thisSession).then((projectId) => {
                this.stageInferredProject(thisSession, projectId);
                return projectId;
            });
        }
    };

    /**
     * Surface the inferred project on the ending mask, where it is still
     * correctable. Ignored when the session is no longer staged, e.g. the user
     * confirmed the mask before the worker answered.
     */
    private stageInferredProject(session: PomodoroRecord, projectId?: string) {
        if (projectId === undefined || this.componentGone || this.stagedSession !== session) {
            return;
        }

        this.setState({ stagedProjectId: projectId });
    }

    /**
     * Resolve the prediction started when the session ended. `onSessionConfirmed`
     * awaits it, so which project the record (and therefore the project pies of
     * the Timer/History pages) gets does not depend on when the user clicked.
     */
    private async getInferredProjectId(): Promise<string | undefined> {
        if (!this.projectInference) {
            return undefined;
        }

        return this.projectInference.catch((err) => {
            console.error('[Timer] failed to infer the project of a session', err);
            return undefined;
        });
    }

    private calculateSessionEfficiency() {
        if (this.stagedSession != null) {
            const boardDistractionList = this.props.timer.boardId
                ? this.props.kanban.boards[this.props.timer.boardId]?.distractionList || []
                : [];
            this.efficiencyAnalyser.update(
                this.props.timer.distractingList.concat(boardDistractionList)
            );
            this.stagedSession.efficiency = this.efficiencyAnalyser.analyse(this.stagedSession);
        }
    }

    private getElapsedTimeInSecond() {
        const { targetTime, isFocusing } = this.props.timer;
        const now = new Date().getTime();
        const timeSpan = targetTime! - now;
        const leftTimeInSec = Math.floor(timeSpan / 1000 + 0.5);
        const duration = this.getDuration(isFocusing);
        return duration - leftTimeInSec;
    }

    /**
     * `confirmedBoardId` is the focusing project snapshotted when the user
     * clicked the ending mask (see `onMaskClick`), not the live selection: what
     * the record is credited to must not change while this debounced handler
     * runs, and an explicit choice wins over the inferred project.
     */
    private onSessionConfirmed = debounce(async (confirmedBoardId?: string) => {
        if (this.monitor) {
            this.monitor.clear();
            this.monitor = undefined;
        }

        if (this.stagedSession === undefined) {
            // Resting session
            await this.props.timerFinished();
        } else {
            this.setState({ pomodoroNum: this.state.pomodoroNum + 1 });
            this.stagedSession.spentTimeInHour += this.extendedTimeInMinute / 60;
            this.extendedTimeInMinute = 0;
            // Wait for the prediction made when the session ended: a worker that
            // answers late must not turn an attributed session into "Unknown"
            // (or the other way around) just because the user clicked quickly.
            const inferredProjectId = await this.getInferredProjectId();
            const boardId = resolveSessionProjectId(confirmedBoardId, inferredProjectId);
            // `boardId` may point to a board that no longer exists (e.g. deleted
            // right after a session, or a corrupted value persisted by older
            // builds). Fall back to an unattributed session instead of crashing
            // on `kanban.boards[boardId].focusedList`.
            const focusedListId =
                boardId === undefined ? undefined : this.props.kanban.boards[boardId]?.focusedList;
            if (boardId !== undefined && focusedListId !== undefined) {
                this.stagedSession.boardId = boardId;
                const cards: string[] = this.props.kanban.lists[focusedListId]?.cards ?? [];
                await this.props.timerFinished(this.stagedSession, cards, boardId);
            } else {
                await this.props.timerFinished(this.stagedSession);
            }

            const finishedSessions = this.state.pomodorosToday.concat([this.stagedSession]);
            this.setState({
                pomodorosToday: finishedSessions,
                leftTime: '',
                stagedProjectId: undefined,
            });
            this.stagedSession = undefined;
            this.projectInference = undefined;
        }

        const startNextSession = this.nextSessionStarter;
        this.nextSessionStarter = undefined;
        if (startNextSession !== undefined) {
            await new Promise((r) => setTimeout(r, 30));
            startNextSession();
        }
    }, 50);

    private focusOnCurrentWindow() {
        window.api.focusOnWindow();
    }

    toggleMode = () => {
        if (this.props.timer.compact) {
            this.props.setCompact(false);
        }
        this.setState((state) => {
            // TODO: need better control
            const more = !state.more;
            return { more };
        });
    };

    /**
     * Flip focus/rest and drop what the previous session held -- the timer, the
     * display stats, the monitor and the extension it was carrying. A mode
     * switch never carries a session over.
     *
     * `switchMode` guards this for the user's gestures (Tab, the two swap
     * buttons, the work/rest icon). The paths that start a *named* session call
     * it directly (`startNamedSession`, `startFocusing`), because there the
     * named session has to win over a paused one; see `startNamedSession`.
     */
    private performModeSwitch = () => {
        this.props.switchFocusRestMode();
        this.resetStat();
        // The extension only ever belonged to the session being dropped.
        this.extendedTimeInMinute = 0;
        if (this.monitor) {
            this.monitor.stop();
            this.monitor.clear();
        }
    };

    switchMode = () => {
        if (this.props.timer.sessionEnding) {
            // Checked first: the ending mask owns this transition -- it confirms
            // the staged session and flips the mode itself -- and it keeps
            // `targetTime` until then, so the guard below would answer "a
            // session exists" and toast while the mask is already explaining
            // what is going on. Switching (or complaining) here would be noise.
            return;
        }

        // A session exists as soon as it started, not as soon as its first 2%
        // elapsed: `state.percent` is committed in 2% steps, so the old
        // `percent !== 0` guard let Tab (or the work/rest icon) silently drop a
        // session that had just been paused. Same predicate as the buttons
        // (see `sessionState.ts`), so the toast now matches what the user sees.
        if (hasSession(this.props.timer)) {
            feedback.toast({
                kind: 'warning',
                content: FEEDBACK_MESSAGES.timer.cannotSwitchMode(
                    this.props.timer.isFocusing,
                    this.props.timer.isRunning
                ),
            });
            return;
        }

        this.performModeSwitch();
    };

    private onMaskClick = () => {
        this.props.setSessionEnding(false);
        // Snapshot the focusing project: the session keeps the project it was
        // confirmed with, even if the selection changes right after (or if the
        // prediction arrives late).
        this.onSessionConfirmed(this.props.timer.boardId);
    };

    private onMaskButtonClick = async () => {
        this.props.setSessionEnding(false);
        // The mask button starts the session it names: the cycle's next one.
        this.nextSessionStarter = () => this.onStart();
        this.onSessionConfirmed(this.props.timer.boardId);
    };

    /**
     * While the ending mask is up, the tray items and F5 must not reuse the
     * mask button's auto-start: they name their own session (e.g. "Start
     * Focusing" skips the pending break). So first dismiss the mask — which
     * only confirms the staged session and flips the mode — and queue this
     * item's start for the moment the confirmation clears the expired timer.
     */
    private confirmMaskAndStart = (wantsFocusing: boolean) => {
        this.nextSessionStarter = () => this.startNamedSession(wantsFocusing);
        this.onMaskClick();
    };

    /**
     * Start (or resume) the session the caller names: the two tray items, and
     * the ending mask's own button once the confirmation is in.
     *
     * The decision itself lives in `namedSessionAction` (see `sessionState.ts`),
     * so the menu, the mask and the guard cannot drift apart again. What is left
     * here is the orchestration: a `start` for the other type has to switch
     * first, and that switch drops a paused session of that other type -- which
     * is why it cannot go through the guarded `switchMode` (that refusal used to
     * leave the paused session running, so "Start Focusing" resumed a break).
     *
     * After a mask confirmation the timer is already stopped and clean, so this
     * cannot resume the expired session (the ghost-session bug).
     */
    private startNamedSession = async (wantsFocusing: boolean) => {
        const action = namedSessionAction(this.props.timer, wantsFocusing);

        if (action === 'nothing') {
            return;
        }

        if (action === 'refuse') {
            // Safety net: the tray greys the Start entries out while a session
            // is live (see `trayMenuItems`), so this should not be reachable.
            feedback.toast({
                kind: 'warning',
                content: FEEDBACK_MESSAGES.timer.cannotSwitchMode(
                    this.props.timer.isFocusing,
                    this.props.timer.isRunning
                ),
            });
            return;
        }

        if (this.props.timer.isFocusing !== wantsFocusing) {
            this.performModeSwitch();
            try {
                // The switch dispatches asynchronously; wait for the flip to
                // become visible before reading the mode again, so a `start`
                // cannot pick up (or a `resume` cannot miss) the session the
                // switch just discarded.
                await waitUntil(() => this.props.timer.isFocusing === wantsFocusing);
            } catch (err) {
                console.error('[Timer] mode switch timed out; not starting', err);
                return;
            }
        }

        if (action === 'resume') {
            this.onResume();
        } else {
            this.onStart();
        }
    };

    private switchToKanban = () => {
        if (this.props.timer.boardId) {
            this.props.switchToKanban(this.props.timer.boardId);
        }
    };

    private remindUserTimeout = (timeout = 0, volume = 0.5) => {
        setTimeout(() => {
            if (this.props.timer.sessionEnding) {
                this.focusOnCurrentWindow();
                if (this.sound.current) {
                    this.sound.current.volume = volume;
                    this.sound.current.play().catch((err) => console.error(err));
                }
            }
        }, timeout);
    };

    private extendCurrentSession = (minutes: number) => {
        if (this.monitor) {
            this.monitor.resume();
        } else if (__DEV__) {
            throw new Error();
        } else {
            this.monitor = new Monitor(() => {}, 1000, this.props.timer.screenShotInterval);
            this.monitor.start();
        }

        if (__DEV__) {
            minutes = 1 / 60;
        }

        this.extendedTimeInMinute += minutes;
        this.props.extendCurrentSession(minutes * 60);
        this.props.setSessionEnding(false);
    };

    private onFinishButtonClick = async () => {
        const { isFocusing } = this.props.timer;
        if (!isFocusing) {
            return this.onDone(false);
        }

        const eTime = this.getElapsedTimeInSecond();
        if (eTime < 600) {
            feedback.toast({ kind: 'warning', content: FEEDBACK_MESSAGES.timer.finishTooEarly });
            return;
        }

        await this.onDone(false, true);
    };

    switchSider = () => {
        this.setState((state) => ({ showSider: !state.showSider }));
    };

    onKeyDown = (keyName: string) => {
        switch (keyName) {
            case 'f5':
                // While the ending mask is up, F5 follows the mask button: it
                // confirms the staged session and starts the next session of
                // the cycle (the one the button names). The start is deferred
                // until the confirmation has flipped the mode; starting
                // earlier would resume the expired timer (ghost session,
                // duplicate prompts).
                if (this.props.timer.sessionEnding) {
                    this.onMaskButtonClick();
                    return;
                }

                if (this.props.timer.targetTime == null) {
                    return this.onStart();
                }

                this.onResume();
                break;

            case 'f6':
                this.onPause();
                break;

            case 'tab':
                this.switchMode();
                break;
        }

        return;
    };

    componentDidCatch(error: Error, _errorInfo: React.ErrorInfo): void {
        feedback.toast({ kind: 'error', content: error.toString() });
    }

    minimize = () => {
        this.props.setMinimize(!this.props.timer.minimize);
    };

    toggleTheme = () => {
        const nextThemeId =
            this.props.timer.themeId === NIGHT_THEME_ID ? DAY_THEME_ID : NIGHT_THEME_ID;
        this.props.setThemeId(nextThemeId);
        // Picking a theme explicitly takes over from the OS preference.
        if (this.props.timer.followSystemTheme) {
            this.props.setFollowSystemTheme(false);
        }
    };

    render() {
        const { leftTime, percent, more, pomodorosToday } = this.state;
        const { isRunning, minimize, compact, isFocusing, sessionEnding } = this.props.timer;
        // One predicate for "a session exists" (running, or paused with time
        // left), shared with `switchMode` and the mini layout so the three
        // views can never disagree; see `sessionState.ts`.
        const hasActiveSession = hasSession(this.props.timer);
        const shownLeftTime =
            hasActiveSession && leftTime.length ? leftTime : this.defaultLeftTime();
        const boardId = this.props.timer.boardId;

        if (minimize) {
            const name = boardId && this.props.kanban.boards[boardId]?.name;
            // While the ending mask is up, show the project the staged session is
            // going to be credited to (a predicted one included), so the user can
            // still notice a wrong guess before confirming.
            const stagedName =
                this.state.stagedProjectId &&
                this.props.kanban.boards[this.state.stagedProjectId]?.name;
            return (
                <Layout style={{ backgroundColor: 'transparent' }} ref={this.selfRef}>
                    <ReactHotkeys keyName={'f5,f6,tab'} onKeyDown={this.onKeyDown} />
                    <MiniLogger
                        stop={this.onStop}
                        finish={this.onFinishButtonClick}
                        expand={this.minimize}
                        /* One predicate for "a session exists", shared with the
                           normal/compact pages and `switchMode`; see
                           `sessionState.ts`. */
                        hasSession={hasActiveSession}
                        isFocusing={isFocusing}
                        isRunning={isRunning}
                        pause={this.onPause}
                        percentage={percent}
                        play={this.onPauseResumeOrStart}
                        switch={this.switchMode}
                        task={name || stagedName || ''}
                        time={shownLeftTime.slice(0, 2)}
                        style={{ zIndex: 999, overflow: 'hidden' }}
                        isConfirming={sessionEnding}
                        extendCurrentSession={this.extendCurrentSession}
                        stagedPomodoro={this.stagedSession}
                        confirm={this.onMaskClick}
                        confirmAndStartNextSession={this.onMaskButtonClick}
                    />
                    <audio src={dingMp3} ref={this.sound} />
                </Layout>
            );
        }

        const listId =
            boardId !== undefined ? this.props.kanban.boards[boardId]?.focusedList : undefined;

        return (
            <Layout style={{ backgroundColor: 'transparent' }} ref={this.selfRef}>
                <ReactHotkeys keyName={'f5,f6,tab'} onKeyDown={this.onKeyDown} />
                <TimerMask
                    extendCurrentSession={this.extendCurrentSession}
                    newPomodoro={this.stagedSession}
                    stagedProjectId={this.state.stagedProjectId}
                    showMask={sessionEnding}
                    onCancel={this.onMaskClick}
                    onStart={this.onMaskButtonClick}
                    pomodoros={pomodorosToday}
                />
                {!compact &&
                    (listId === undefined || boardId === undefined ? undefined : (
                        <MySider
                            style={{
                                marginLeft: this.state.showSider ? 0 : -300,
                            }}
                        >
                            <KanbanName onClick={this.switchToKanban}>
                                {this.props.kanban.boards[boardId]?.name}
                                <Button className={'kanban-name-arrow'}>
                                    <Icon component={backIcon} />
                                </Button>
                            </KanbanName>
                            <Board
                                boardId={boardId}
                                doesOnlyShowFocusedList={true}
                                showHeader={false}
                            />
                            <Button
                                icon={'more'}
                                style={{
                                    position: 'absolute',
                                    right: 0,
                                    top: 20,
                                    marginRight: -15,
                                    zIndex: 50,
                                    boxShadow: '4px 0 6px -1px rgba(234, 234, 234, 0.6)',
                                }}
                                onClick={this.switchSider}
                            />
                        </MySider>
                    ))}
                <TimerLayout compact={compact} ref={this.mainDiv}>
                    <Tooltip
                        title={compact ? 'Normal-screen (F11)' : 'Small-screen (F11)'}
                        placement="bottom"
                    >
                        <Button
                            onClick={() => this.props.setCompact(!compact)}
                            shape={'circle'}
                            style={{
                                position: 'absolute',
                                zIndex: 50,
                                top: 14,
                                right: 52,
                            }}
                        >
                            <CompactModeIcon compact={compact} />
                        </Button>
                    </Tooltip>
                    <Tooltip title="Minimize (F12)" placement="bottom">
                        <Button
                            icon={'fullscreen-exit'}
                            onClick={this.minimize}
                            shape={'circle'}
                            style={{
                                position: 'absolute',
                                zIndex: 50,
                                top: 14,
                                right: 14,
                            }}
                        />
                    </Tooltip>
                    {!compact && (
                        <HelpIcon
                            storyName={'allStories'}
                            resume={true}
                            style={{
                                position: 'absolute',
                                zIndex: 50,
                                bottom: 14,
                                right: 14,
                            }}
                        />
                    )}
                    <TimerInnerLayout compact={compact}>
                        <ProgressContainer>
                            <Progress
                                type="circle"
                                strokeColor={{
                                    '0%': '#108ee9',
                                    '100%': '#87d068',
                                }}
                                percent={percent}
                                width={compact ? 240 : 300}
                                style={{
                                    margin: '0 auto',
                                }}
                            >
                                <ProgressTextContainer>
                                    <div
                                        style={{ marginBottom: 12 }}
                                        key="leftTime"
                                        id="left-time-text"
                                    >
                                        {shownLeftTime}
                                    </div>
                                    <WorkRestIcon
                                        isWorking={this.props.timer.isFocusing}
                                        isLongBreak={
                                            !(this.props.timer.iBreak % LONG_BREAK_INTERVAL)
                                        }
                                        onClick={this.switchMode}
                                    />
                                </ProgressTextContainer>
                            </Progress>
                        </ProgressContainer>

                        <ThemeToggleRow>
                            <Tooltip title={'Switch Theme'}>
                                <ThemeToggle type="bulb" onClick={this.toggleTheme} />
                            </Tooltip>
                        </ThemeToggleRow>

                        <div
                            style={{
                                margin: compact ? '0.6em auto' : '2em auto',
                                textAlign: 'center',
                            }}
                        >
                            <FocusSelector width={compact ? 200 : 240} />
                        </div>
                        <ButtonRow>
                            <div id="start-timer-button" style={{ lineHeight: 0 }}>
                                {isRunning ? (
                                    <Tooltip title="Pause (F6)">
                                        <Button
                                            icon="pause"
                                            shape={'circle'}
                                            onClick={this.onPauseResumeOrStart}
                                        />
                                    </Tooltip>
                                ) : (
                                    <Tooltip title="Start (F5)">
                                        <Button
                                            icon="caret-right"
                                            shape={'circle'}
                                            onClick={this.onPauseResumeOrStart}
                                        />
                                    </Tooltip>
                                )}
                            </div>
                            {hasActiveSession ? (
                                <Tooltip title="Finish">
                                    <Button
                                        icon="check"
                                        shape={'circle'}
                                        onClick={this.onFinishButtonClick}
                                    />
                                </Tooltip>
                            ) : (
                                <Tooltip title="Switch Mode (Tab)">
                                    <Button
                                        id="mode-switching-button"
                                        icon="swap"
                                        shape="circle"
                                        onClick={this.switchMode}
                                    />
                                </Tooltip>
                            )}
                            <div id="stop-timer-button" style={{ lineHeight: 0 }}>
                                <Tooltip title="Stop">
                                    <Button shape="circle" icon="close" onClick={this.onStop} />
                                </Tooltip>
                            </div>
                            {this.state.pomodorosToday.length ? (
                                <Tooltip title="Show More">
                                    <Button
                                        id="more-timer-button"
                                        icon="more"
                                        shape="circle"
                                        onClick={this.toggleMode}
                                    />
                                </Tooltip>
                            ) : undefined}
                        </ButtonRow>

                        <MoreInfo>
                            <Tooltip title="Pomodoros Today">
                                <PomodoroNumView
                                    pomodoros={this.state.pomodorosToday}
                                    showNum={false}
                                    animation={isRunning}
                                    compact={compact}
                                    chooseRecord={this.props.setChosenRecord}
                                />
                            </Tooltip>
                        </MoreInfo>

                        {more ? (
                            <MoreInfo>
                                <h2>Time Spent</h2>
                                <PomodoroDualPieChart
                                    pomodoros={this.state.pomodorosToday}
                                    width={800}
                                />
                                <Divider />

                                <h2>Word Cloud</h2>
                                <AsyncWordCloud
                                    records={this.state.pomodorosToday}
                                    width={800}
                                    height={400}
                                    style={{ margin: '0 auto' }}
                                />
                            </MoreInfo>
                        ) : undefined}
                    </TimerInnerLayout>
                </TimerLayout>
                <audio src={dingMp3} ref={this.sound} />
            </Layout>
        );
    }
}

export default Timer;
