import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import Timer from './Timer';
import { getTodaySessions } from '../../monitor/sessionManager';
import { setTrayImageWithMadeIcon } from './iconMaker';
import { Monitor } from '../../monitor';
import { DAY_THEME_ID, NIGHT_THEME_ID } from '../../theme/tokens';
import { scaleMs } from '../../../config';
import { DEFAULT_SOUND_URL, soundUrl } from '../../sound';
import { announceWindowHideIntent } from '../windowHideIntent';

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
/** Set by the boundary test: makes one of the page's children throw. */
let mockProgressThrows = false;
jest.mock('./Progress', () => ({
    __esModule: true,
    default: ({ children }: any) => {
        if (mockProgressThrows) {
            throw new Error('progress exploded');
        }
        return <div data-testid="progress">{children}</div>;
    },
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
    MiniLogger: ({
        task,
        time,
        isConfirming,
        expand,
        confirm,
        confirmAndStartNextSession,
    }: any) => (
        <div
            data-testid="mini-logger"
            data-task={task}
            data-time={time}
            data-confirm={String(isConfirming)}
        >
            <button data-testid="mini-expand" onClick={expand} />
            <button data-testid="mini-confirm" onClick={confirm} />
            <button data-testid="mini-start-next" onClick={confirmAndStartNextSession} />
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

interface PlayedAudio {
    src: string;
    volume: number;
    play: jest.Mock;
    pause: jest.Mock;
    addEventListener: jest.Mock;
}

/** Every audio element the page created, in playback order. */
let played: PlayedAudio[] = [];
/** Makes every `play()` reject, as a missing or undecodable file would. */
let playbackFails = false;
let originalAudio: typeof Audio;

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
    inTray: false,
    boardId: 'b1' as string | undefined,
    focusDuration: 25 * 60,
    restDuration: 5 * 60,
    longBreakDuration: 15 * 60,
    minFinishDuration: 0,
    warnBeforeFocusStart: false,
    returnToTimerOnSessionEnd: true,
    screenShotInterval: undefined,
    workSoundPath: undefined as string | undefined,
    workSoundEnabled: true,
    shortBreakSoundPath: undefined as string | undefined,
    shortBreakSoundEnabled: true,
    longBreakSoundPath: undefined as string | undefined,
    longBreakSoundEnabled: true,
    soundVolume: 0.5,
    desktopNotification: true,
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

/**
 * Runs one mini-mode focus session up to its ending mask, so the strip's
 * confirm buttons have a staged session to save.
 */
const stageFinishedFocusSessionInMini = async () => {
    const view = await renderTimer({ minimize: true });

    await act(async () => {
        view.ref.current!.onStart();
    });
    mockMonitorInstances[0].sessionData = {
        _id: 'session-1',
        startTime: Date.now(),
        apps: {},
        switchActivities: [],
        stayTimeInSecond: [],
    };
    await act(async () => {
        await (view.ref.current as any).onFinishButtonClick();
    });

    return view;
};

/** Lets the confirmation debounce run and flushes its awaits. */
const confirmFromMiniStrip = async (button: HTMLElement) => {
    await act(async () => {
        fireEvent.click(button);
        jest.advanceTimersByTime(100);
        await Promise.resolve();
    });
};

describe('Timer page', () => {
    beforeEach(() => {
        jest.useFakeTimers({ now: new Date('2026-01-01T00:00:00Z') });
        mockMonitorInstances.length = 0;
        mockProgressThrows = false;
        (getTodaySessions as jest.Mock).mockResolvedValue([]);
        (setTrayImageWithMadeIcon as jest.Mock).mockClear();
        api.onTrayAction.mockReturnValue(jest.fn());
        api.setTrayMenu.mockClear();
        api.setTrayImage.mockClear();
        api.notify.mockClear();
        api.focusOnWindow.mockClear();
        played = [];
        playbackFails = false;
        originalAudio = window.Audio;
        // jsdom has no media stack. The fake records what the page asked to
        // play, which is the user-visible part of a reminder; `sound.ts` itself
        // runs for real, so the URL and the volume are the ones production
        // would use.
        (window as any).Audio = jest.fn((src: string) => {
            const audio: PlayedAudio = {
                src,
                volume: 1,
                play: jest.fn(() =>
                    playbackFails ? Promise.reject(new Error('decode failed')) : Promise.resolve()
                ),
                pause: jest.fn(),
                addEventListener: jest.fn(),
            };
            played.push(audio);
            return audio;
        });
        (window as any).api = { ...(window as any).api, ...api };
    });

    afterEach(() => {
        (window as any).Audio = originalAudio;
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
        // The clock runs at `timeScale()` (120x in development, 1x in
        // production), and `targetTime` is wall time. Both sides are built from
        // `scaleMs` so the test asserts the same nominal values at any scale
        // and never asks the app config to bend to it.
        const { container } = await renderTimer({
            isRunning: true,
            targetTime: Date.now() + scaleMs(10 * 60 * 1000),
        });

        expect(container.textContent).toContain('10:00');

        await act(async () => {
            // One nominal minute of wall time.
            jest.advanceTimersByTime(scaleMs(60 * 1000));
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

    it('clears a focusing project that was hidden on the kanban page', async () => {
        const view = await renderTimer();

        await rerenderTimer(view, {
            ...view.props,
            timer: { ...view.props.timer, isRunning: true },
            kanban: { ...view.props.kanban, boards: { b1: { ...boards.b1, hidden: true } } },
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

    // Regression: this boundary used to implement only `componentDidCatch`, so
    // React re-rendered the same failing child, the second throw escaped to
    // AppErrorBoundary, and unmounting Timer discarded the running session
    // (`monitor.discard()`). The fallback keeps the instance -- and with it the
    // monitor, the countdown interval and the tray entries -- alive.
    it('replaces the page with a retry fallback and keeps the instance alive', async () => {
        // React reports the caught error on the console; that output is the
        // subject of this test, so it is claimed here.
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
        try {
            mockProgressThrows = true;
            const view = await renderTimer();
            expect(view.container.textContent).toContain('The timer page could not be drawn');

            const instance = view.ref.current;
            mockProgressThrows = false;
            fireEvent.click(view.getByRole('button', { name: 'Retry' }));

            expect(view.ref.current).toBe(instance);
            expect(view.container.textContent).toContain('25:00');
        } finally {
            mockProgressThrows = false;
            consoleError.mockRestore();
        }
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

    it('re-reads today sessions when the data reload token changes', async () => {
        const view = await renderTimer();
        expect(getTodaySessions).toHaveBeenCalledTimes(1);

        // Import and "delete all" bump the token instead of restarting; the
        // page is permanently mounted, so this is the only signal it gets.
        const next = {
            ...view.props,
            timer: { ...view.props.timer, sessionReloadToken: 1 },
        };
        await rerenderTimer(view, next);

        expect(getTodaySessions).toHaveBeenCalledTimes(2);
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

    it('closes the open stats panel when switching to compact mode', async () => {
        (getTodaySessions as jest.Mock).mockResolvedValue([
            { _id: 's1', startTime: 1, boardId: 'b1' },
        ]);
        const view = await renderTimer();

        fireEvent.click(view.container.querySelector('#more-timer-button')!);
        expect(view.queryByTestId('treemap')).toBeTruthy();

        const compactProps = {
            ...view.props,
            timer: { ...view.props.timer, compact: true },
        };
        await rerenderTimer(view, compactProps);
        // The charts cannot fit the compact window, so the panel closes
        // instead of staying open-but-clipped.
        expect(view.queryByTestId('treemap')).toBeNull();

        // Expanding back leaves the panel closed: the button toggles on from
        // a clean state instead of opening a panel that was never visible.
        const expandedProps = {
            ...compactProps,
            timer: { ...compactProps.timer, compact: false },
        };
        await rerenderTimer(view, expandedProps);
        expect(view.queryByTestId('treemap')).toBeNull();
    });

    it('closes the open stats panel when the window becomes the mini strip', async () => {
        (getTodaySessions as jest.Mock).mockResolvedValue([
            { _id: 's1', startTime: 1, boardId: 'b1' },
        ]);
        const view = await renderTimer();

        fireEvent.click(view.container.querySelector('#more-timer-button')!);
        expect(view.queryByTestId('treemap')).toBeTruthy();

        const miniProps = {
            ...view.props,
            timer: { ...view.props.timer, minimize: true },
        };
        await rerenderTimer(view, miniProps);
        // The strip does not render the panel at all, so it must not come back
        // open when the window expands again.
        expect(view.queryByTestId('treemap')).toBeNull();

        const expandedProps = {
            ...miniProps,
            timer: { ...miniProps.timer, minimize: false },
        };
        await rerenderTimer(view, expandedProps);
        expect(view.queryByTestId('treemap')).toBeNull();
    });

    it('closes the open stats panel when the window goes to the tray', async () => {
        (getTodaySessions as jest.Mock).mockResolvedValue([
            { _id: 's1', startTime: 1, boardId: 'b1' },
        ]);
        const view = await renderTimer();

        fireEvent.click(view.container.querySelector('#more-timer-button')!);
        expect(view.queryByTestId('treemap')).toBeTruthy();

        const trayProps = {
            ...view.props,
            timer: { ...view.props.timer, inTray: true },
        };
        await rerenderTimer(view, trayProps);
        // Nobody is looking: the treemap and the word cloud are released now,
        // not after the page-unload grace -- the Timer page never unmounts.
        expect(view.queryByTestId('treemap')).toBeNull();
        expect(view.queryByTestId('word-cloud')).toBeNull();

        const backProps = {
            ...trayProps,
            timer: { ...trayProps.timer, inTray: false },
        };
        await rerenderTimer(view, backProps);
        expect(view.queryByTestId('treemap')).toBeNull();
    });

    it('closes the open stats panel before the window is handed over', async () => {
        // Regression: the close path announces the hide before asking the main
        // process, so the panel is gone from the frame that Windows shows again
        // on restore. The tray event arrives too late for that frame and the
        // charts flashed back for a moment.
        (getTodaySessions as jest.Mock).mockResolvedValue([
            { _id: 's1', startTime: 1, boardId: 'b1' },
        ]);
        const view = await renderTimer();

        fireEvent.click(view.container.querySelector('#more-timer-button')!);
        expect(view.queryByTestId('treemap')).toBeTruthy();

        act(() => announceWindowHideIntent());

        expect(view.queryByTestId('treemap')).toBeNull();
        expect(view.queryByTestId('word-cloud')).toBeNull();
    });

    it('expands the window and opens the stats panel when clicked in compact mode', async () => {
        (getTodaySessions as jest.Mock).mockResolvedValue([
            { _id: 's1', startTime: 1, boardId: 'b1' },
        ]);
        const { container, queryByTestId, actions } = await renderTimer({ compact: true });

        fireEvent.click(container.querySelector('#more-timer-button')!);

        expect(actions.setCompact).toHaveBeenCalledWith(false);
        expect(queryByTestId('treemap')).toBeTruthy();
    });

    it('marks the mini window as confirming while the ending mask is up', async () => {
        const view = await renderTimer({ minimize: true });

        expect(view.getByTestId('mini-logger').getAttribute('data-confirm')).toBe('false');

        cleanup();
        const confirming = await renderTimer({ minimize: true, sessionEnding: true });
        expect(confirming.getByTestId('mini-logger').getAttribute('data-confirm')).toBe('true');
    });

    // Regression: the strip's confirm buttons bound `onClick` straight to
    // `onMaskClick`, so React's click event arrived as the picked card id. The
    // session then failed IPC validation and was never saved (b2f8c0d).
    it('saves the finished pomodoro when the mini strip confirms it', async () => {
        const { getByTestId, actions } = await stageFinishedFocusSessionInMini();

        await confirmFromMiniStrip(getByTestId('mini-confirm'));

        const [record, cardId] = actions.timerFinished.mock.calls[0] ?? [];
        // The failure has to name the culprit: an event object would print as
        // `object` here, where `no card` is the expected value.
        expect({
            record: record?._id,
            cardId: cardId === undefined ? 'no card' : typeof cardId,
        }).toEqual({ record: 'session-1', cardId: 'no card' });
    });

    it('credits no card id when the mini strip starts the next session', async () => {
        const { getByTestId, actions } = await stageFinishedFocusSessionInMini();

        await confirmFromMiniStrip(getByTestId('mini-start-next'));

        const [record, cardId] = actions.timerFinished.mock.calls[0] ?? [];
        expect({
            record: record?._id,
            cardId: cardId === undefined ? 'no card' : typeof cardId,
        }).toEqual({ record: 'session-1', cardId: 'no card' });
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

    // Regression: finishing a session used to switch to the Timer page
    // unconditionally, dropping the user out of an open board editor and
    // leaving a drag half-finished. The mask is app-level now, so staying put
    // is safe.
    it('stays on the current page when the return-to-timer setting is off', async () => {
        const { ref, actions } = await renderTimer({
            returnToTimerOnSessionEnd: false,
            isFocusing: false,
            isRunning: true,
        });

        await act(async () => {
            await (ref.current as any).onFinishButtonClick();
        });

        expect(actions.setSessionEnding).toHaveBeenCalledWith(true);
        expect(actions.pauseTimer).toHaveBeenCalled();
        expect(actions.changeAppTab).not.toHaveBeenCalled();
    });

    it('refuses to finish a focus session below the configured minimum', async () => {
        const { ref, actions } = await renderTimer({
            minFinishDuration: 600,
            isRunning: true,
            // A freshly started session: the whole focus duration is still
            // ahead, so nothing has been focused yet at any clock scale.
            targetTime: Date.now() + scaleMs(baseTimer.focusDuration * 1000),
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
            // Two 500ms ticks. A single tick only reaches "00:00":
            // `countdownSeconds` rounds to the nearest second, so a session
            // that is 499ms past its target is still 0 seconds left. The second
            // tick goes negative and ends the session -- at any clock scale.
            jest.advanceTimersByTime(1000);
        });

        expect(api.notify).toHaveBeenCalled();
        expect(actions.setSessionEnding).toHaveBeenCalledWith(true);
        expect(api.focusOnWindow).toHaveBeenCalled();
    });

    it('plays the short break sound at the configured volume when a break ends', async () => {
        await renderTimer({
            // The store raises the ending flag when the session finishes; the
            // reminder callback reads it before playing.
            sessionEnding: true,
            isFocusing: false,
            iBreak: 1,
            isRunning: true,
            targetTime: Date.now() + 1,
            shortBreakSoundPath: 'C:\\sounds\\short.wav',
            soundVolume: 0.3,
        });

        await act(async () => {
            jest.advanceTimersByTime(1000);
        });

        expect(played).toHaveLength(1);
        expect(played[0].src).toBe(soundUrl('C:\\sounds\\short.wav'));
        expect(played[0].volume).toBe(0.3);
    });

    it('plays the long break sound when the fourth break ends', async () => {
        await renderTimer({
            sessionEnding: true,
            isFocusing: false,
            iBreak: 0,
            isRunning: true,
            targetTime: Date.now() + 1,
            longBreakSoundPath: 'C:\\sounds\\long.wav',
        });

        await act(async () => {
            jest.advanceTimersByTime(1000);
        });

        expect(played.map((audio) => audio.src)).toEqual([soundUrl('C:\\sounds\\long.wav')]);
    });

    it('stays silent when the row is switched off', async () => {
        await renderTimer({
            sessionEnding: true,
            isFocusing: false,
            iBreak: 1,
            isRunning: true,
            targetTime: Date.now() + 1,
            shortBreakSoundPath: 'C:\\sounds\\short.wav',
            shortBreakSoundEnabled: false,
        });

        await act(async () => {
            jest.advanceTimersByTime(1000);
        });

        expect(played).toHaveLength(0);
    });

    it('stays silent at zero volume', async () => {
        await renderTimer({
            sessionEnding: true,
            isFocusing: false,
            iBreak: 1,
            isRunning: true,
            targetTime: Date.now() + 1,
            soundVolume: 0,
        });

        await act(async () => {
            jest.advanceTimersByTime(1000);
        });

        expect(played).toHaveLength(0);
    });

    it('falls back to the bundled chime when the file cannot be played', async () => {
        playbackFails = true;
        const { feedback } = require('../feedback');
        // The fallback fails in this test as well; the page logs that on an
        // expected error path, which the console gate would otherwise fail.
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        await renderTimer({
            sessionEnding: true,
            isFocusing: false,
            iBreak: 1,
            isRunning: true,
            targetTime: Date.now() + 1,
            shortBreakSoundPath: 'C:\\sounds\\short.wav',
        });

        await act(async () => {
            jest.advanceTimersByTime(1000);
            await Promise.resolve();
        });

        expect(played.map((audio) => audio.src)).toEqual([
            soundUrl('C:\\sounds\\short.wav'),
            DEFAULT_SOUND_URL,
        ]);
        expect(feedback.toast).toHaveBeenCalledTimes(1);
        expect(feedback.toast).toHaveBeenCalledWith({
            kind: 'warning',
            content: 'Cannot play short.wav; the default chime is used instead.',
        });

        errorSpy.mockRestore();
    });

    it('skips the desktop notification when the switch is off', async () => {
        await renderTimer({
            isFocusing: false,
            isRunning: true,
            targetTime: Date.now() + 1,
            desktopNotification: false,
        });

        await act(async () => {
            jest.advanceTimersByTime(1000);
        });

        expect(api.notify).not.toHaveBeenCalled();
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
