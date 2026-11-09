import {
    actions,
    defaultState,
    extendCurrentSession,
    reducer,
    setFocusDuration,
    setLongBreakDuration,
    setMinFinishDuration,
    setRestDuration,
    setSessionEnding,
    pauseTimer,
    setWarnBeforeFocusStart,
    startTimer,
    timerFinished,
    TimerState,
} from './action';
import { getFocusStartWarning, getFocusStartWarningIfEnabled } from './focusStartWarning';
import { t } from '../../i18n';
import { generateRandomName } from '../../utils';
import { getAllSession } from '../../monitor/sessionManager';
import { DEBUG_TIME_SCALE, scaleMs, timeScale } from '../../../config';
import { PomodoroRecord } from '../../monitor/type';
import dbs from '../../dbs';
import { Dispatch } from 'redux';

describe('Reducer', () => {
    it('starts from the default timer state', () => {
        const state = reducer(undefined, pauseTimer());
        expect(state).toHaveProperty('targetTime');
        expect(state).toHaveProperty('focusDuration');
        expect(state).toHaveProperty('restDuration');
        expect(state).toHaveProperty('isRunning');
        expect(state).toHaveProperty('isFocusing');
        expect(state.sessionEnding).toBe(false);
    });

    it('raises and lowers the ending mask, so the pages can react to it', () => {
        let state = reducer(undefined, setSessionEnding(true));
        expect(state.sessionEnding).toBe(true);
        state = reducer(state, setSessionEnding(false));
        expect(state.sessionEnding).toBe(false);
    });

    it('applies start and stop to the clock', () => {
        let state = reducer(undefined, startTimer());
        expect(state.isRunning).toBeTruthy();
        state = reducer(state, pauseTimer());
        expect(state.isRunning).toBeFalsy();
        state = reducer(state, startTimer());
        expect(state.isRunning).toBeTruthy();
    });

    it('runs both clock writes on the configured scale outside production', () => {
        // Jest runs with NODE_ENV=test, so the debug clock answers exactly like
        // in development: `timeScale()` must hand `DEBUG_TIME_SCALE` through
        // outside production. The constant itself is a debugging knob the
        // developer may turn at any time (120 by default, lowered to watch a
        // whole session in wall time), so this asserts the GATE, not a hard
        // coded value -- the old `toBeGreaterThan(1)` broke every dev who set
        // the scale to 1. What still pins the behaviour down is that both
        // writes -- starting a session and extending one on the ending mask --
        // go through the SAME scale: the `scaleMs` expectations below hold for
        // any value of it (was: a hard coded 1s in `Timer.extendCurrentSession`
        // with the reducer not scaling at all).
        expect(timeScale()).toBe(DEBUG_TIME_SCALE);

        const startBefore = new Date().getTime();
        let state = reducer(undefined, startTimer());
        const startAfter = new Date().getTime();
        const startNominal = scaleMs(defaultState.focusDuration * 1000);
        const startSpan = state.targetTime! - startBefore;
        expect(startSpan).toBeGreaterThanOrEqual(startNominal);
        expect(startSpan).toBeLessThanOrEqual(startNominal + (startAfter - startBefore));

        const extBefore = new Date().getTime();
        state = reducer(state, extendCurrentSession(5 * 60));
        const extAfter = new Date().getTime();
        const extNominal = scaleMs(5 * 60 * 1000);
        const extSpan = state.targetTime! - extBefore;
        expect(extSpan).toBeGreaterThanOrEqual(extNominal);
        expect(extSpan).toBeLessThanOrEqual(extNominal + (extAfter - extBefore));
        // An extension resumes the focusing session behind the ending mask.
        expect(state.isFocusing).toBe(true);
        expect(state.isRunning).toBe(true);
    });

    it('leaves the clock at nominal length in production', () => {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        try {
            const before = new Date().getTime();
            const state = reducer(undefined, startTimer());
            const after = new Date().getTime();
            const nominal = defaultState.focusDuration * 1000;
            const span = state.targetTime! - before;
            expect(span).toBeGreaterThanOrEqual(nominal);
            expect(span).toBeLessThanOrEqual(nominal + (after - before));
        } finally {
            process.env.NODE_ENV = originalEnv;
        }
    });

    it('applies focus and rest duration settings', () => {
        let state = reducer(undefined, setFocusDuration(100));
        expect(state.focusDuration).toBe(100);
        state = reducer(state, setRestDuration(123));
        expect(state.restDuration).toBe(123);
    });

    it('guards the Finish button with a configurable minimum of 10 minutes', () => {
        const state = reducer(undefined, pauseTimer());
        // The value the app shipped with before it became a setting.
        expect(state.minFinishDuration).toBe(10 * 60);
        expect(reducer(state, setMinFinishDuration(5 * 60)).minFinishDuration).toBe(5 * 60);
        // 0 is the settings page's "finish at any time" option.
        expect(reducer(state, setMinFinishDuration(0)).minFinishDuration).toBe(0);
    });

    it('reminds before a focus session by default and can be turned off', () => {
        const state = reducer(undefined, pauseTimer());
        expect(state.warnBeforeFocusStart).toBe(true);
        expect(reducer(state, setWarnBeforeFocusStart(false)).warnBeforeFocusStart).toBe(false);
        expect(reducer(state, setWarnBeforeFocusStart(true)).warnBeforeFocusStart).toBe(true);
    });

    it('records break count', async () => {
        let state: TimerState = reducer(undefined, setLongBreakDuration(100));
        expect(state.longBreakDuration).toBe(100);
        state = reducer(state, timerFinished());
        expect(state.iBreak).toBe(1);
        state = reducer(state, timerFinished());
        expect(state.iBreak).toBe(1);
        state = reducer(state, timerFinished());
        expect(state.iBreak).toBe(2);
        state = reducer(state, timerFinished());
        state = reducer(state, timerFinished());
        expect(state.iBreak).toBe(3);
    });

    it('applies navigation and setting actions to the timer state', async () => {
        let state: TimerState = Object.assign(defaultState, {});
        // @ts-ignore
        const dispatch: Dispatch = (action: any) => {
            try {
                state = reducer(state, action);
            } catch (e) {}
        };

        await actions.switchToKanban('n_id')(dispatch);
        expect(state.currentTab).toBe('kanban');
        await dispatch(actions.setBoardId('nn_i'));
        expect(state.boardId).toBe('nn_i');
        await actions.setScreenShotInterval(10)(dispatch);
        expect(state.screenShotInterval).toBe(10);
        await actions.setMonitorInterval(999)(dispatch);
        expect(state.monitorInterval).toBe(999);
        await actions.setStartOnBoot(false)(dispatch);
        expect(state.startOnBoot).toBeFalsy();
        await actions.setStartOnBoot(true)(dispatch);
        expect(state.startOnBoot).toBeTruthy();
        await actions.setFocusDuration(9018)(dispatch);
        expect(state.focusDuration).toBe(9018);
        await actions.setRestDuration(9991)(dispatch);
        expect(state.restDuration).toBe(9991);
        await actions.setLongBreakDuration(99991)(dispatch);
        expect(state.longBreakDuration).toBe(99991);
        await actions.setMinFinishDuration(4321)(dispatch);
        expect(state.minFinishDuration).toBe(4321);
        await actions.setScreenShotInterval(91111)(dispatch);
        expect(state.screenShotInterval).toBe(91111);
        await actions.setWarnBeforeFocusStart(false)(dispatch);
        expect(state.warnBeforeFocusStart).toBeFalsy();
        await dispatch(actions.startTimer());
        expect(state.targetTime).not.toBeUndefined();
        expect(state.isRunning).toBeTruthy();
        const leftTime = state.targetTime! - new Date().getTime();
        await dispatch(actions.pauseTimer());
        expect(state.isRunning).toBeFalsy();
        await new Promise((r) => setTimeout(r, 1000));
        const targetTime = new Date().getTime() + leftTime;
        await dispatch(actions.continueTimer());
        expect(state.isRunning).toBeTruthy();
        expect(state.targetTime! / 1000).toBeCloseTo(targetTime / 1000, 1);
        await dispatch(actions.stopTimer());
        expect(state.targetTime).toBeUndefined();
        expect(state.isRunning).toBeFalsy();

        const oldState = Object.assign(state, {});
        state = defaultState;
        // The four durations persist on a debounce (see
        // `persistSettingWithDebounce`), so the tail of the drag above is still
        // pending here: wait it out before reading the settings back.
        await new Promise((resolve) => setTimeout(resolve, 400));
        await actions.fetchSettings()(dispatch);
        const settings = [
            'focusDuration',
            'restDuration',
            'monitorInterval',
            'screenShotInterval',
            'startOnBoot',
            'longBreakDuration',
            'minFinishDuration',
            'warnBeforeFocusStart',
        ];
        for (const setting of settings) {
            // @ts-ignore
            expect(state[setting]).toEqual(oldState[setting]);
        }
    });

    it('writes a dragged duration slider once, after the drag has settled', async () => {
        let state: TimerState = { ...defaultState };
        const dispatch = ((action: any) => {
            state = reducer(state, action);
        }) as unknown as Dispatch;
        const stored = async () =>
            (await dbs.settingDB.findOne({ name: 'setting' }))?.focusDuration;
        const before = await stored();

        // What one drag sends: a value per frame, all inside the debounce
        // window. Each of these used to be its own commit -- the settings
        // repository rewrites the whole table on every update, so the write is
        // a transaction plus an fsync, per pointer event.
        for (let minutes = 20; minutes <= 40; minutes++) {
            actions.setFocusDuration(minutes * 60)(dispatch);
        }

        // The page follows at once (the timer reads the store)...
        expect(state.focusDuration).toBe(40 * 60);
        // ...the table still holds the previous value...
        expect(await stored()).toBe(before);

        // ...and is written once the thumb has come to rest.
        await new Promise((resolve) => setTimeout(resolve, 400));
        expect(await stored()).toBe(40 * 60);
    });

    it('ignores a stored screenshot interval in a packaged build', async () => {
        let state: TimerState = { ...defaultState };
        const dispatch = ((action: any) => {
            state = reducer(state, action);
        }) as unknown as Dispatch;

        await actions.setScreenShotInterval(120000)(dispatch);
        expect(state.screenShotInterval).toBe(120000);

        // A packaged build retired the feature; a value persisted by an older
        // version must not restart the capture behind a hidden toggle.
        (window.api as any).isPackaged = true;
        try {
            state = { ...defaultState };
            await actions.fetchSettings()(dispatch);
            expect(state.screenShotInterval).toBeUndefined();
        } finally {
            delete (window.api as any).isPackaged;
        }
    });
});

describe('On timerFinished', () => {
    it('will add data to DB', async () => {
        const record: PomodoroRecord = {
            _id: '_id',
            startTime: new Date().getTime(),
            boardId: generateRandomName(),
            spentTimeInHour: 10,
            switchActivities: [],
            apps: {
                Chrome: {
                    spentTimeInHour: 10,
                    appName: 'Chrome',
                    screenStaticDuration: 5,
                    titleSpentTime: {},
                },
            },
            screenStaticDuration: 5,
            switchTimes: 3,
        };

        const thunk = actions.timerFinished(record);
        await thunk((x) => {
            return x;
        });
        const sessions = await getAllSession();
        const found = sessions.find((v) => v.startTime === record.startTime);
        expect(found).not.toBeUndefined();
    });
});

describe('getFocusStartWarning', () => {
    it('warns when no project is selected', () => {
        expect(getFocusStartWarning(undefined, {}, {}, {})).toMatchObject({
            kind: 'no-project',
        });
    });

    it('warns when the selected project is missing', () => {
        expect(getFocusStartWarning('gone', {}, {}, {})).toMatchObject({
            kind: 'no-project',
        });
    });

    it('warns when In Progress is empty', () => {
        const boardId = 'board';
        expect(
            getFocusStartWarning(
                boardId,
                {
                    [boardId]: {
                        _id: boardId,
                        name: 'board',
                        description: '',
                        lists: ['list'],
                        focusedList: 'list',
                        doneList: 'done',
                        relatedSessions: [],
                        spentHours: 0,
                    },
                },
                {
                    list: { _id: 'list', title: 'In Progress', cards: [] },
                    done: { _id: 'done', title: 'Done', cards: [] },
                },
                {}
            )
        ).toMatchObject({ kind: 'no-focus-cards' });
    });

    it('warns when In Progress points at a missing list', () => {
        const boardId = 'board';
        expect(
            getFocusStartWarning(
                boardId,
                {
                    [boardId]: {
                        _id: boardId,
                        name: 'board',
                        description: '',
                        lists: ['list'],
                        focusedList: 'list',
                        doneList: 'done',
                        relatedSessions: [],
                        spentHours: 0,
                    },
                },
                {},
                {}
            )
        ).toMatchObject({ kind: 'no-focus-cards' });
    });

    it('ignores stale card ids when checking In Progress', () => {
        const boardId = 'board';
        expect(
            getFocusStartWarning(
                boardId,
                {
                    [boardId]: {
                        _id: boardId,
                        name: 'board',
                        description: '',
                        lists: ['list'],
                        focusedList: 'list',
                        doneList: 'done',
                        relatedSessions: [],
                        spentHours: 0,
                    },
                },
                {
                    list: { _id: 'list', title: 'In Progress', cards: ['gone'] },
                },
                {}
            )
        ).toMatchObject({ kind: 'no-focus-cards' });
    });

    it('stays silent when In Progress has a card', () => {
        const boardId = 'board';
        expect(
            getFocusStartWarning(
                boardId,
                {
                    [boardId]: {
                        _id: boardId,
                        name: 'board',
                        description: '',
                        lists: ['list'],
                        focusedList: 'list',
                        doneList: 'done',
                        relatedSessions: [],
                        spentHours: 0,
                    },
                },
                {
                    list: { _id: 'list', title: 'In Progress', cards: ['card'] },
                },
                {
                    card: {
                        _id: 'card',
                        title: 'task',
                        content: '',
                        sessionIds: [],
                        spentTimeInHour: { estimated: 1, actual: 0 },
                    },
                }
            )
        ).toBeUndefined();
    });
});

describe('getFocusStartWarningIfEnabled', () => {
    it('warns when reminders are on', () => {
        expect(getFocusStartWarningIfEnabled(true, undefined, {}, {}, {})).toMatchObject({
            kind: 'no-project',
        });
    });

    it('stays silent when reminders were turned off', () => {
        expect(getFocusStartWarningIfEnabled(false, undefined, {}, {}, {})).toBeUndefined();
    });

    it('offers an opt-out check box label', () => {
        expect(t('timer.warning.dontRemindAgain')).toMatch(/don't remind/i);
    });
});
