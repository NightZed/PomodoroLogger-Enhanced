import {
    actions,
    defaultState,
    inferProject,
    reducer,
    resolveSessionProjectId,
    setBoardId,
    setFocusDuration,
    setLongBreakDuration,
    setRestDuration,
    setScreenShotInterval,
    setStartOnBoot,
    setWarnBeforeFocusStart,
    startTimer,
    stopTimer,
    timerFinished,
    TimerState,
} from './action';
import {
    DONT_REMIND_AGAIN_LABEL,
    getFocusStartWarning,
    getFocusStartWarningIfEnabled,
} from './focusStartWarning';
import { generateRandomName } from '../../utils';
import { workers } from '../../workers';
import { getAllSession } from '../../monitor/sessionManager';
import { dbPaths } from '../../../config';
import { existsSync, unlinkSync } from 'fs';
import { PomodoroRecord } from '../../monitor/type';
import { Dispatch } from 'redux';
import { boardReducer } from '../Kanban/Board/action';
import set = Reflect.set;

const { projectDB } = dbPaths;

describe('Reducer', () => {
    it('has default state', () => {
        const state = reducer(undefined, stopTimer());
        expect(state).toHaveProperty('targetTime');
        expect(state).toHaveProperty('focusDuration');
        expect(state).toHaveProperty('restDuration');
        expect(state).toHaveProperty('isRunning');
        expect(state).toHaveProperty('isFocusing');
    });

    it('works when applying start_timer, stop_timer', () => {
        let state = reducer(undefined, startTimer());
        expect(state.isRunning).toBeTruthy();
        state = reducer(state, stopTimer());
        expect(state.isRunning).toBeFalsy();
        state = reducer(state, startTimer());
        expect(state.isRunning).toBeTruthy();
    });

    it('works with user config setting', () => {
        let state = reducer(undefined, setFocusDuration(100));
        expect(state.focusDuration).toBe(100);
        state = reducer(state, setRestDuration(123));
        expect(state.restDuration).toBe(123);
    });

    it('reminds before a focus session by default and can be turned off', () => {
        const state = reducer(undefined, stopTimer());
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

    it('should update', async () => {
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
        await actions.setScreenShotInterval(91111)(dispatch);
        expect(state.screenShotInterval).toBe(91111);
        await actions.setWarnBeforeFocusStart(false)(dispatch);
        expect(state.warnBeforeFocusStart).toBeFalsy();
        await dispatch(actions.startTimer());
        expect(state.targetTime).not.toBeUndefined();
        expect(state.isRunning).toBeTruthy();
        const leftTime = state.targetTime! - new Date().getTime();
        await dispatch(actions.stopTimer());
        expect(state.isRunning).toBeFalsy();
        await new Promise((r) => setTimeout(r, 1000));
        const targetTime = new Date().getTime() + leftTime;
        await dispatch(actions.continueTimer());
        expect(state.isRunning).toBeTruthy();
        expect(state.targetTime! / 1000).toBeCloseTo(targetTime / 1000, 1);
        await dispatch(actions.clearTimer());
        expect(state.targetTime).toBeUndefined();
        expect(state.isRunning).toBeFalsy();

        const oldState = Object.assign(state, {});
        state = defaultState;
        await actions.fetchSettings()(dispatch);
        const settings = [
            'focusDuration',
            'restDuration',
            'monitorInterval',
            'screenShotInterval',
            'startOnBoot',
            'longBreakDuration',
            'warnBeforeFocusStart',
        ];
        for (const setting of settings) {
            // @ts-ignore
            expect(state[setting]).toEqual(oldState[setting]);
        }
    });
});

describe('On timerFinished', () => {
    beforeAll(() => {
        if (existsSync(projectDB)) {
            unlinkSync(projectDB);
        }
    });

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

describe('inferProject', () => {
    const stubPredict = (impl: () => Promise<any>) => {
        const original = workers.knn.predict;
        // @ts-ignore
        workers.knn.predict = impl;
        return () => {
            // @ts-ignore
            workers.knn.predict = original;
        };
    };

    const stubPrediction = (result: string) => stubPredict(async () => result);

    const record: PomodoroRecord = {
        _id: 'infer-project-record',
        startTime: new Date().getTime(),
        spentTimeInHour: 1,
        switchActivities: [],
        apps: {},
        screenStaticDuration: 0,
        switchTimes: 0,
    };

    it('returns the predicted board _id, not its name', async () => {
        const boardId = generateRandomName();
        const boardName = `Predicted Project ${generateRandomName()}`;
        await workers.dbWorkers.kanbanDB.insert({ _id: boardId, name: boardName });

        const restore = stubPrediction(boardId);
        let predicted: string | undefined;
        try {
            predicted = await inferProject(record);
        } finally {
            restore();
        }

        expect(predicted).toBe(boardId);
        // Regression: the board NAME used to leak into `timer.boardId`, which
        // made `kanban.boards[boardId]` undefined and crashed `Timer`'s render
        // with "Cannot read properties of undefined (reading 'focusedList')".
        // The prediction is written into the session record, so it must be the
        // `_id` the project pies resolve through the kanban DB.
        expect(predicted).not.toBe(boardName);
    });

    it('ignores a prediction whose board no longer exists', async () => {
        const restore = stubPrediction(`missing-board-${generateRandomName()}`);
        try {
            expect(await inferProject(record)).toBeUndefined();
        } finally {
            restore();
        }
    });

    it('ignores an empty prediction', async () => {
        const restore = stubPrediction('');
        try {
            expect(await inferProject(record)).toBeUndefined();
        } finally {
            restore();
        }
    });

    it('resolves to undefined when the model cannot predict yet', async () => {
        // A freshly installed app has no model to predict with; the error is
        // reported but must not break the caller of the prediction.
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        const restore = stubPredict(async () => {
            throw new Error('Must fit before predicting');
        });
        try {
            expect(await inferProject(record)).toBeUndefined();
        } finally {
            restore();
            errorSpy.mockRestore();
        }
    });

    it('is not dispatchable, so a guess can never move the focusing selection', () => {
        // It used to be an action creator dispatching `setBoardId`, which raced
        // with the ending mask: the finished session was credited to the guess
        // or to "Unknown" depending on the timing, and the guess silently stayed
        // selected for every later session. Callers now await the result and
        // write it into the session record instead.
        expect((actions as any).inferProject).toBeUndefined();
    });
});

describe('resolveSessionProjectId', () => {
    it('keeps the project the session was confirmed with', () => {
        // The prediction may arrive before or after the user picks a project;
        // it must never override the explicit choice.
        expect(resolveSessionProjectId('picked', 'predicted')).toBe('picked');
        expect(resolveSessionProjectId('picked', undefined)).toBe('picked');
    });

    it('falls back to the predicted project when nothing was selected', () => {
        expect(resolveSessionProjectId(undefined, 'predicted')).toBe('predicted');
    });

    it('leaves the session unattributed without a selection or a prediction', () => {
        expect(resolveSessionProjectId(undefined, undefined)).toBeUndefined();
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
        expect(DONT_REMIND_AGAIN_LABEL).toMatch(/don't remind/i);
    });
});
