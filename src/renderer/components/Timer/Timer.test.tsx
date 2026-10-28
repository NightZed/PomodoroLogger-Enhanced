import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import Timer from './Timer';
import { getTodaySessions } from '../../monitor/sessionManager';
import { setTrayImageWithMadeIcon } from './iconMaker';
import { Monitor } from '../../monitor';
import { DAY_THEME_ID, NIGHT_THEME_ID } from '../../theme/tokens';

const mockMonitorInstances: any[] = [];

jest.mock('../../monitor', () => ({
    Monitor: jest.fn().mockImplementation(() => {
        const instance = {
            start: jest.fn(),
            stop: jest.fn(),
            resume: jest.fn(),
            discard: jest.fn(),
            clear: jest.fn(),
        };
        mockMonitorInstances.push(instance);
        return instance;
    }),
}));

jest.mock('../../monitor/sessionManager', () => ({
    getTodaySessions: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../workers', () => ({
    workers: {
        dbWorkers: { sessionDB: { count: jest.fn().mockResolvedValue(0) } },
        knn: { loadModel: jest.fn().mockResolvedValue(undefined) },
    },
}));

jest.mock('./iconMaker', () => ({
    setTrayImageWithMadeIcon: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../feedback', () => ({
    feedback: {
        toast: jest.fn(),
        confirm: jest.fn(() => ({ destroy: jest.fn() })),
    },
    FEEDBACK_MESSAGES: {
        timer: {
            cannotSwitchMode: (focusing: boolean, running: boolean) =>
                `cannot-switch-${focusing}-${running}`,
            finishTooEarly: (minutes: number) => `too-early-${minutes}`,
        },
    },
}));

jest.mock('../Hotkeys', () => ({
    __esModule: true,
    default: ({ keyName }: any) => <div data-testid="hotkeys" data-keys={keyName} />,
    shouldPreventTabDefault: jest.fn(() => false),
}));

jest.mock('../Kanban/Board', () => ({
    __esModule: true,
    default: () => <div data-testid="board" />,
}));
jest.mock('../UserGuide/HelpIcon', () => ({
    HelpIcon: () => <div data-testid="help-icon" />,
}));
jest.mock('../Visualization/PomodoroTimeTreemap', () => ({
    PomodoroTimeTreemap: () => <div data-testid="treemap" />,
}));
jest.mock('../Visualization/WordCloud', () => ({
    AsyncWordCloud: () => <div data-testid="word-cloud" />,
}));
jest.mock('./FocusSelector', () => ({ FocusSelector: () => <div data-testid="focus-selector" /> }));
jest.mock('./PomodoroNumView', () => ({
    PomodoroNumView: ({ pomodoros }: any) => (
        <div data-testid="pomodoro-num">{pomodoros.length}</div>
    ),
}));
jest.mock('./Progress', () => ({
    __esModule: true,
    default: ({ children }: any) => <div data-testid="progress">{children}</div>,
}));
jest.mock('./WorkRestIcon', () => ({
    WorkRestIcon: () => <button data-testid="work-rest" />,
}));
jest.mock('./SessionEndingMask', () => ({
    TimerMask: ({ showMask, pomodoros, onCancel, onStart }: any) => (
        <div data-testid="timer-mask" data-show={String(showMask)} data-count={pomodoros.length}>
            <button data-testid="mask-cancel" onClick={onCancel} />
            <button data-testid="mask-start" onClick={onStart} />
        </div>
    ),
}));
jest.mock('../../../components/common/Mini/MiniLogger', () => ({
    MiniLogger: ({ task, time, isConfirming, expand, confirm }: any) => (
        <div
            data-testid="mini-logger"
            data-task={task}
            data-time={time}
            data-confirm={String(isConfirming)}
        >
            <button data-testid="mini-expand" onClick={expand} />
            <button data-testid="mini-confirm" onClick={confirm} />
        </div>
    ),
}));

const api = {
    onTrayAction: jest.fn(),
    setTrayMenu: jest.fn(),
    setTrayImage: jest.fn(),
    notify: jest.fn(),
    focusOnWindow: jest.fn(),
    platform: 'win32',
};

const boards = {
    b1: {
        _id: 'b1',
        name: 'Board One',
        focusedList: 'l1',
        lists: ['l1'],
        doneList: 'l2',
        spentHours: 0,
        description: '',
        relatedSessions: [],
    },
};

const baseTimer = {
    isFocusing: true,
    isRunning: false,
    sessionEnding: false,
    targetTime: undefined as number | undefined,
    leftTime: undefined as number | undefined,
    iBreak: 0,
    minimize: false,
    compact: false,
    boardId: 'b1' as string | undefined,
    focusDuration: 25 * 60,
    restDuration: 5 * 60,
    longBreakDuration: 15 * 60,
    minFinishDuration: 0,
    warnBeforeFocusStart: false,
    screenShotInterval: undefined,
    followSystemTheme: false,
    themeId: DAY_THEME_ID,
    chosenRecord: undefined,
    distractingList: [],
};

const actionNames = [
    'setTimerManager',
    'setMinimize',
    'setCompact',
    'setThemeId',
    'setFollowSystemTheme',
    'setBoardId',
    'setChosenRecord',
    'setWarnBeforeFocusStart',
    'startTimer',
    'pauseTimer',
    'continueTimer',
    'stopTimer',
    'setSessionEnding',
    'extendCurrentSession',
    'switchFocusRestMode',
    'changeAppTab',
    'switchToKanban',
    'timerFinished',
    'addSession',
];

const makeActions = () =>
    Object.fromEntries(actionNames.map((name) => [name, jest.fn()])) as Record<string, jest.Mock>;

const renderTimer = async (
    timerOverrides: any = {},
    kanbanOverrides: any = {},
    propOverrides: any = {}
) => {
    const actions = makeActions();
    const props: any = {
        timer: { ...baseTimer, ...timerOverrides },
        kanban: { boards, lists: {}, cards: {}, ...kanbanOverrides },
        ...actions,
        ...propOverrides,
    };
    const ref = React.createRef<Timer>();
    let view: any;
    await act(async () => {
        view = render(<Timer {...props} ref={ref} />);
    });
    return { ...view, ref, actions, props };
};

const rerenderTimer = async (view: any, props: any) => {
    await act(async () => {
        view.rerender(<Timer {...props} ref={view.ref} />);
    });
};

describe('Timer page', () => {
    beforeEach(() => {
        jest.useFakeTimers({ now: new Date('2026-01-01T00:00:00Z') });
        mockMonitorInstances.length = 0;
        (getTodaySessions as jest.Mock).mockResolvedValue([]);
        (setTrayImageWithMadeIcon as jest.Mock).mockClear();
        api.onTrayAction.mockReturnValue(jest.fn());
        api.setTrayMenu.mockClear();
        api.setTrayImage.mockClear();
        api.notify.mockClear();
        api.focusOnWindow.mockClear();
        (window as any).api = { ...(window as any).api, ...api };
    });

    afterEach(() => {
        cleanup();
        jest.clearAllTimers();
        jest.useRealTimers();
        jest.clearAllMocks();
    });

    it('shows the configured focus and break durations while idle', async () => {
        const focus = await renderTimer();
        expect(focus.container.textContent).toContain('25:00');

        cleanup();
        const longBreak = await renderTimer({ isFocusing: false, iBreak: 0 });
        expect(longBreak.container.textContent).toContain('15:00');

        cleanup();
        const shortBreak = await renderTimer({ isFocusing: false, iBreak: 1 });
        expect(shortBreak.container.textContent).toContain('05:00');
    });

    it('counts down with wall time and repaints the tray icon', async () => {
        const now = Date.now();
        // The dev clock runs at 120x, so 5s of wall time is one nominal minute.
        const { container } = await renderTimer({ isRunning: true, targetTime: now + 5000 });

        expect(container.textContent).toContain('10:00');

        await act(async () => {
            jest.advanceTimersByTime(500);
        });

        expect(container.textContent).toContain('09:00');
        expect(setTrayImageWithMadeIcon).toHaveBeenCalledWith(
            expect.any(String),
            expect.any(Number),
            true
        );
    });

    it('shows pause while running and a start button while idle', async () => {
        const idle = await renderTimer();
        expect(
            idle.container.querySelector('#start-timer-button [aria-label="caret-right"]')
        ).not.toBeNull();
        expect(idle.container.querySelector('#start-timer-button [aria-label="pause"]')).toBeNull();

        cleanup();
        const running = await renderTimer({ isRunning: true, targetTime: Date.now() + 60000 });
        expect(
            running.container.querySelector('#start-timer-button [aria-label="pause"]')
        ).not.toBeNull();
        expect(running.container.querySelector('#more-timer-button')).toBeNull();
    });

    it('rebuilds the tray menu when the visible session state changes', async () => {
        const view = await renderTimer();
        const initialCalls = api.setTrayMenu.mock.calls.length;
        expect(initialCalls).toBeGreaterThan(0);

        await rerenderTimer(view, {
            ...view.props,
            timer: { ...view.props.timer, isRunning: true },
        });

        expect(api.setTrayMenu.mock.calls.length).toBeGreaterThan(initialCalls);
    });

    it('clears a focusing project that was deleted on the kanban page', async () => {
        const view = await renderTimer();

        await rerenderTimer(view, {
            ...view.props,
            // A timer field has to change as well: shouldComponentUpdate ignores
            // a kanban-only update (see `uiStateNames`).
            timer: { ...view.props.timer, isRunning: true },
            kanban: { ...view.props.kanban, boards: {} },
        });

        expect(view.actions.setBoardId).toHaveBeenCalledWith(undefined);
    });

    it('renders the compact layout without the help and side bar controls', async () => {
        const compact = await renderTimer({ compact: true });

        expect(compact.queryByTestId('help-icon')).toBeNull();
        expect(compact.container.querySelector('aside')).toBeNull();
        expect(compact.queryByTestId('focus-selector')).toBeTruthy();

        cleanup();
        const normal = await renderTimer();
        expect(normal.getByTestId('help-icon')).toBeTruthy();
        expect(normal.container.querySelector('aside')).not.toBeNull();
    });

    it('hides the side bar when the layout gets narrow', async () => {
        const { ref, container } = await renderTimer();
        const aside = container.querySelector('aside') as HTMLElement;
        expect(aside.style.marginLeft).toBe('0px');

        Object.defineProperty(ref.current!.selfRef.current!, 'clientWidth', {
            configurable: true,
            value: 500,
        });
        act(() => ref.current!.onResize());

        expect(container.querySelector('aside')!.style.marginLeft).toBe('-300px');
    });

    it('toggles the theme and turns off following the system theme', async () => {
        const { ref, actions } = await renderTimer({
            themeId: NIGHT_THEME_ID,
            followSystemTheme: true,
        });

        act(() => ref.current!.toggleTheme());

        expect(actions.setThemeId).toHaveBeenCalledWith(DAY_THEME_ID);
        expect(actions.setFollowSystemTheme).toHaveBeenCalledWith(false);
    });

    it('switches between the normal and mini window', async () => {
        const mini = await renderTimer({ minimize: true });

        expect(mini.getByTestId('mini-logger').getAttribute('data-task')).toBe('Board One');
        expect(mini.getByTestId('mini-logger').getAttribute('data-time')).toBe('25');

        fireEvent.click(mini.getByTestId('mini-expand'));
        expect(mini.actions.setMinimize).toHaveBeenCalledWith(false);

        cleanup();
        const normal = await renderTimer();
        fireEvent.click(
            normal.container.querySelector('[aria-label="fullscreen-exit"]')!.closest('button')!
        );
        expect(normal.actions.setMinimize).toHaveBeenCalledWith(true);
    });

    it('shows the ending mask and the staged session count', async () => {
        const view = await renderTimer({ sessionEnding: true });

        expect(view.getByTestId('timer-mask').getAttribute('data-show')).toBe('true');
        expect(view.getByTestId('timer-mask').getAttribute('data-count')).toBe('0');
    });

    it('stops the session when the tray stop entry is used', async () => {
        const { actions } = await renderTimer();
        const trayHandler = api.onTrayAction.mock.calls[0][0];

        act(() => trayHandler('stop'));

        expect(actions.stopTimer).toHaveBeenCalled();
        expect(setTrayImageWithMadeIcon).toHaveBeenCalledWith(undefined);
    });

    it('pauses or resumes from the tray and page hotkeys', async () => {
        const running = await renderTimer({ isRunning: true, targetTime: Date.now() + 60000 });
        const trayHandler = api.onTrayAction.mock.calls[0][0];

        act(() => trayHandler('pauseOrContinue'));
        expect(running.actions.pauseTimer).toHaveBeenCalled();

        act(() => running.ref.current!.onKeyDown('f6'));
        expect(running.actions.pauseTimer).toHaveBeenCalledTimes(2);

        cleanup();
        const idle = await renderTimer();
        act(() => idle.ref.current!.onKeyDown('f5'));

        expect(idle.actions.startTimer).toHaveBeenCalled();
        expect(Monitor).toHaveBeenCalled();
        expect(mockMonitorInstances[0].start).toHaveBeenCalled();
    });

    it('refuses to switch modes while a session exists', async () => {
        const { ref, actions } = await renderTimer({
            isRunning: true,
            targetTime: Date.now() + 60000,
        });
        const { feedback } = require('../feedback');

        act(() => ref.current!.onKeyDown('tab'));

        expect(actions.switchFocusRestMode).not.toHaveBeenCalled();
        expect(feedback.toast).toHaveBeenCalledWith({
            kind: 'warning',
            content: 'cannot-switch-true-true',
        });
    });

    it('extends a running session without dropping it', async () => {
        const { ref, actions } = await renderTimer({
            isRunning: true,
            targetTime: Date.now() + 60000,
        });
        const monitor = {
            resume: jest.fn(),
            start: jest.fn(),
            stop: jest.fn(),
            discard: jest.fn(),
            clear: jest.fn(),
        };
        (ref.current as any).monitor = monitor;

        act(() => (ref.current as any).extendCurrentSession(10));

        expect(monitor.resume).toHaveBeenCalled();
        expect(actions.extendCurrentSession).toHaveBeenCalledWith(600);
        expect(actions.setSessionEnding).toHaveBeenCalledWith(false);
    });

    it('shows today sessions and opens the more panel', async () => {
        (getTodaySessions as jest.Mock).mockResolvedValue([
            { _id: 's1', startTime: 1, boardId: 'b1' },
            { _id: 's2', startTime: 2, boardId: 'b1' },
        ]);
        const { container, getByText, queryByTestId } = await renderTimer();

        expect(queryByTestId('treemap')).toBeNull();
        expect(container.querySelector('#more-timer-button')).not.toBeNull();

        fireEvent.click(container.querySelector('#more-timer-button')!);

        expect(getByText('Time Spent')).toBeTruthy();
        expect(queryByTestId('treemap')).toBeTruthy();
        expect(queryByTestId('word-cloud')).toBeTruthy();
    });

    it('shows the staged project in the mini window name while confirming', async () => {
        const view = await renderTimer({ minimize: true });

        expect(view.getByTestId('mini-logger').getAttribute('data-confirm')).toBe('false');

        cleanup();
        const confirming = await renderTimer({ minimize: true, sessionEnding: true });
        expect(confirming.getByTestId('mini-logger').getAttribute('data-confirm')).toBe('true');
    });

    it('resumes a paused session instead of starting a new one', async () => {
        const { ref, actions } = await renderTimer({
            isRunning: false,
            targetTime: Date.now() + 5000,
        });

        act(() => ref.current!.onPauseResumeOrStart());

        expect(actions.continueTimer).toHaveBeenCalled();
        expect(actions.startTimer).not.toHaveBeenCalled();
        expect(mockMonitorInstances[0].start).toHaveBeenCalled();
    });

    it('switches modes only when no session is alive', async () => {
        const { ref, actions } = await renderTimer();

        act(() => ref.current!.switchMode());

        expect(actions.switchFocusRestMode).toHaveBeenCalled();
        expect(setTrayImageWithMadeIcon).toHaveBeenCalledWith(undefined);
    });

    it('finishes a break without asking for a confirmation', async () => {
        const { ref, actions } = await renderTimer({ isFocusing: false, isRunning: true });

        await act(async () => {
            await (ref.current as any).onFinishButtonClick();
        });

        expect(actions.setSessionEnding).toHaveBeenCalledWith(true);
        expect(actions.pauseTimer).toHaveBeenCalled();
        expect(actions.changeAppTab).toHaveBeenCalledWith('timer');
        expect(api.notify).not.toHaveBeenCalled();
        expect(setTrayImageWithMadeIcon).toHaveBeenCalledWith(
            undefined,
            undefined,
            false,
            false,
            true
        );
    });

    it('refuses to finish a focus session below the configured minimum', async () => {
        const { ref, actions } = await renderTimer({
            minFinishDuration: 600,
            isRunning: true,
            targetTime: Date.now() + 10000,
        });
        const { feedback } = require('../feedback');

        await act(async () => {
            await (ref.current as any).onFinishButtonClick();
        });

        expect(actions.setSessionEnding).not.toHaveBeenCalled();
        expect(feedback.toast).toHaveBeenCalledWith({
            kind: 'warning',
            content: 'too-early-10',
        });
    });

    it('completes a break through the countdown and notifies the user', async () => {
        const { actions } = await renderTimer({
            isFocusing: false,
            isRunning: true,
            targetTime: Date.now() + 1,
        });

        await act(async () => {
            jest.advanceTimersByTime(500);
        });

        expect(api.notify).toHaveBeenCalled();
        expect(actions.setSessionEnding).toHaveBeenCalledWith(true);
        expect(api.focusOnWindow).toHaveBeenCalled();
    });

    it('asks before starting a focus session without a project', async () => {
        const { ref, actions } = await renderTimer({
            boardId: undefined,
            warnBeforeFocusStart: true,
        });
        const { feedback } = require('../feedback');

        act(() => ref.current!.onKeyDown('f5'));

        const options = (feedback.confirm as jest.Mock).mock.calls[0][0];
        expect(options).toMatchObject({
            kind: 'warning',
            title: 'No focusing project',
            checkbox: { label: "Don't remind me again" },
        });
        expect(actions.startTimer).not.toHaveBeenCalled();

        act(() => options.checkbox.onChange(true));
        act(() => options.onOk());

        expect(actions.startTimer).toHaveBeenCalled();
        expect(actions.setWarnBeforeFocusStart).toHaveBeenCalledWith(false);
    });
});
