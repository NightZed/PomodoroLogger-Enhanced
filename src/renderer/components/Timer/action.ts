import { createAction, createReducer } from '@reduxjs/toolkit';
import { Dispatch } from 'redux';
import { addSession } from '../../monitor/sessionManager';
import { actions as boardActions } from '../Kanban/Board/action';
import { actions as kanbanActions } from '../Kanban/action';
import { actions as historyActions } from '../History/action';
import dbs from '../../dbs';
import { PomodoroRecord } from '../../monitor/type';
import { workers } from '../../workers';
import { DEBUG_TIME_SCALE, scaleMs } from '../../../config';
import { AsyncDB } from '../../../utils/dbHelper';
import { DEFAULT_THEME_ID, ThemeDefinition } from '../../theme/tokens';

export const LONG_BREAK_INTERVAL = 4;
const settingDB = new AsyncDB(dbs.settingDB);

/**
 * Pending writes of the drag-driven settings, keyed by setting name.
 *
 * The opacity sliders dispatch on every `onChange`, i.e. dozens of times while
 * a thumb is being dragged, and each dispatch would otherwise be its own
 * SQLite write. Writes are debounced per key, so dragging one slider never
 * cancels the pending write of another one.
 */
const pendingSettingWrites: { [name: string]: ReturnType<typeof setTimeout> } = {};

/** Persists a slider-driven setting once the dragging has settled. */
function persistSettingWithDebounce(name: string, value: number): void {
    const pending = pendingSettingWrites[name];
    if (pending) {
        clearTimeout(pending);
    }

    pendingSettingWrites[name] = setTimeout(() => {
        delete pendingSettingWrites[name];
        settingDB.update({ name: 'setting' }, { $set: { [name]: value } }, { upsert: true });
    }, 300);
}

/**
 * The app's pages. The order, the title bar entries and the Ctrl+Tab rotation
 * all live in ONE list, `APP_TABS` (see `../appTabs.ts`) -- this type only names
 * the values the state can hold. It used to be a second list here, which a
 * removed dev-only page ('analyser') had left one entry longer than the bar:
 * Ctrl+Tab then walked into a page no pane rendered.
 */
export type tabType = 'timer' | 'kanban' | 'history' | 'setting';
export type DistractingRow = { app?: string; title?: string };
export interface Setting {
    autoUpdate: boolean;
    focusDuration: number;
    restDuration: number;
    longBreakDuration: number;
    /**
     * How long a focus session must have run before the Finish button accepts
     * it, in seconds. `0` allows finishing at any time. Breaks are never
     * gated. It used to be a hard coded 10 minutes (see `isFinishTooEarly` in
     * `sessionState.ts`) until the settings page grew this option.
     *
     * The settings page only offers up to the current `focusDuration`, but the
     * stored value may still exceed it (the focus duration was shortened
     * afterwards, or the settings came from elsewhere). What applies is
     * `effectiveMinFinishDuration` -- the smaller of the two -- and the stored
     * value is kept, so the intention is not lost.
     */
    minFinishDuration: number;
    monitorInterval: number;
    screenShotInterval?: number;
    /**
     * When on, starting a focus session without a focusing project (or with an
     * empty "In Progress" list) asks for a confirmation first. Turned off from
     * the "Don't remind me again" check box or in the settings.
     */
    warnBeforeFocusStart: boolean;
    startOnBoot: boolean;
    useHardwareAcceleration: boolean;
    compactAlwaysOnTop: boolean;
    /**
     * Opacity of the content layer: the title bar and the active page, text and
     * icons included. Dialogs and toasts belong to that layer as well (they are
     * mounted inside it, see `popupLayer.ts`), while the window background and
     * the wallpaper are separate settings below.
     */
    contentOpacity: number;
    /**
     * Opacity of the window background layer. Published to CSS as
     * `--pl-theme-bg-opacity`, the single channel it travels through.
     */
    themeBackgroundOpacity: number;
    wallpaperPath?: string;
    wallpaperDataUrl?: string;
    /** Opacity of the wallpaper image layer. */
    wallpaperOpacity: number;
    distractingList: DistractingRow[];
    calendarBaseColor: string;
    /** Id of the active theme, see `theme/tokens.ts`. */
    themeId: string;
    /** When on, the theme follows the OS light/dark preference. */
    followSystemTheme: boolean;
    /** User defined themes. Not editable in the UI yet, kept for later use. */
    customThemes?: ThemeDefinition[];
}

export interface TimerManager {
    /**
     * Start a focus session. `boardId` identifies the project the caller
     * intends to use for this request. It is optional because the Timer page
     * can start a session using its current selection.
     *
     * The named session wins, so the caller does not have to worry about the
     * mode: a paused session of either type is discarded (the switch drops it,
     * exactly like `stop`), while a *running* rest session is stopped first. A
     * running focus session is left as it is.
     */
    start: (boardId?: string) => void;
    pause: () => void;
}

export interface TimerState extends Setting {
    timerManager?: TimerManager;
    chosenRecord?: PomodoroRecord;
    targetTime?: number;
    leftTime?: number;
    isFocusing: boolean;
    isRunning: boolean;
    /**
     * Whether the ending mask is up, i.e. a finished session is waiting to be
     * confirmed. It lives here rather than in the Timer component because it
     * blocks app-wide navigation: while it is up the pages must not be
     * switched (see `AppTitleBar`), so the title bar and the global hotkeys
     * have to read it too.
     */
    sessionEnding: boolean;
    boardId?: string;
    iBreak: number; // i-th break session, if i can be divided by 4, start longer break
    minimize: boolean;
    /**
     * The second window mode (F11): the window is resized to fit the Timer page
     * only and its layout gets denser (shorter title bar, smaller progress ring,
     * hidden side bar). This flag and everything named after it (`setCompact`,
     * `compactWindow`, `COMPACT_TITLE_BAR_HEIGHT`, `returnToCompact`, ...) is
     * the ONE name for that mode. The user-facing wording follows it too
     * ("Compact window (F11)" on the Timer page, "小屏模式" in the Chinese
     * README); "small window" / "small screen" are not names for it -- the
     * smaller F12 strip (`minimize`, "mini mode") would be one more candidate
     * for those words.
     */
    compact: boolean;

    currentTab: tabType;
}

export const defaultState: TimerState = {
    distractingList: [
        {
            app: 'Chrome|Edge|Iexplore|Safari|Firefox|Brave',
            title: 'Facebook|微博|Twitter|哔哩哔哩|YouTube|Twitch|微信',
        },
        {
            app: 'WeChatStore',
        },
        {
            title: '邮件|Mail',
        },
    ],
    autoUpdate: true,
    targetTime: undefined,
    focusDuration: 25 * 60,
    restDuration: 5 * 60,
    iBreak: 0,
    longBreakDuration: 15 * 60,
    minFinishDuration: 10 * 60,
    isRunning: false,
    isFocusing: true,
    sessionEnding: false,
    startOnBoot: false,
    useHardwareAcceleration: false,
    compactAlwaysOnTop: true,
    contentOpacity: 1,
    themeBackgroundOpacity: 1,
    wallpaperPath: undefined,
    wallpaperDataUrl: undefined,
    wallpaperOpacity: 1,
    minimize: false,
    compact: false,

    monitorInterval: 1000,
    screenShotInterval: undefined,
    warnBeforeFocusStart: true,
    calendarBaseColor: '#aceebb',
    themeId: DEFAULT_THEME_ID,
    followSystemTheme: false,
    customThemes: undefined,
    currentTab: 'timer',
};

export const uiStateNames = [
    'focusDuration',
    'restDuration',
    'longBreakDuration',
    'minFinishDuration',
    'monitorInterval',
    'screenShotInterval',
    'warnBeforeFocusStart',
    'chosenRecord',
    'targetTime',
    'leftTime',
    'isFocusing',
    'isRunning',
    'sessionEnding',
    'boardId',
    'iBreak',
    'minimize',
    'compact',
];

// A session lives across start / pause / continue: pausing keeps `targetTime`
// so the very same session can be resumed. `stopTimer` is the only one that
// discards a session (and everything collected with it) -- what the "Stop"
// button, the tray entry and the mini window call.
export const startTimer = createAction('[Timer]START_TIMER');
export const pauseTimer = createAction('[Timer]PAUSE_TIMER');
export const continueTimer = createAction('[Timer]CONTINUE_TIMER');
export const stopTimer = createAction('[Timer]STOP_TIMER');
export const timerFinished = createAction('[Timer]TIMER_FINISHED');
export const setMinimize = createAction<boolean>('[Timer]SET_MINIMIZE');
/**
 * Raise or lower the ending mask: a finished session is waiting to be
 * confirmed. See `TimerState.sessionEnding` for why this is app-wide state.
 */
export const setSessionEnding = createAction<boolean>('[Timer]SET_SESSION_ENDING');
export const setWallpaperDataUrl = createAction(
    '[Setting]SET_WALLPAPER_DATA_URL',
    (value?: string) => ({ payload: value })
);
export const setCompact = createAction<boolean>('[Timer]SET_COMPACT');
export const setCompactAlwaysOnTop = createAction<boolean>('[Timer]SET_COMPACT_ALWAYS_ON_TOP');
export const setContentOpacity = createAction<number>('[Setting]SET_CONTENT_OPACITY');
export const setThemeBackgroundOpacity = createAction<number>(
    '[Setting]SET_THEME_BACKGROUND_OPACITY'
);
export const setWallpaperPath = createAction('[Setting]SET_WALLPAPER_PATH', (value?: string) => ({
    payload: value,
}));
export const setWallpaperOpacity = createAction<number>('[Setting]SET_WALLPAPER_OPACITY');
export const setAutoUpdate = createAction<boolean>('[Timer]SET_AUTO_UPDATE');
export const setTimerManager = createAction(
    '[Timer]StartOrResumeTimer',
    (manager?: TimerManager) => ({ payload: { manager } })
);
export const setChosenRecord = createAction(
    '[Timer]SET_CHOSEN_RECORD',
    (record?: PomodoroRecord) => ({ payload: { record } })
);
export const setDistractingList = createAction<DistractingRow[]>('[Setting]SET_DISTRACTING_LIST');
export const extendCurrentSession = createAction<number>('[Timer]EXTEND_CURRENT_SESSION');
export const setLongBreakDuration = createAction(
    '[Timer]SET_LONG_BREAK',
    (longBreakDuration: number) => ({ payload: { longBreakDuration } })
);
export const setMinFinishDuration = createAction<number>('[Timer]SET_MIN_FINISH_DURATION');
export const setStartOnBoot = createAction<boolean>('[Timer]SWITCH_START_ON_BOOT');
export const setUseHardwareAcceleration = createAction<boolean>(
    '[Timer]SWITCH_SET_USE_HARDWARE_ACCELERATION'
);
export const setFocusDuration = createAction<number>('[Timer]SET_FOCUS_DURATION');
export const setRestDuration = createAction<number>('[Timer]SET_REST_DURATION');
export const setBoardId = createAction('[Timer]SET_BOARD_ID', (boardId?: string) => ({
    payload: { boardId },
}));
export const setMonitorInterval = createAction<number>('[Timer]SET_MONITOR_INTERVAL');
export const setScreenShotInterval = createAction(
    '[Timer]SET_SCREEN_SHOT_INTERVAL',
    (interval?: number) => ({ payload: interval })
);
export const setWarnBeforeFocusStart = createAction<boolean>('[Timer]SET_WARN_BEFORE_FOCUS_START');
export const setCalendarBaseColor = createAction<string>('[Timer]SET_CALENDAR_BASE_COLOR');
export const switchFocusRestMode = createAction('[Timer]SWITCH_FOCUS_MODE');
export const setThemeId = createAction<string>('[Setting]SET_THEME_ID');
export const setFollowSystemTheme = createAction<boolean>('[Setting]SET_FOLLOW_SYSTEM_THEME');
export const setCustomThemes = createAction<ThemeDefinition[]>('[Setting]SET_CUSTOM_THEMES');
export const changeAppTab = createAction<tabType>('[App]CHANGE_APP_TAB');

/**
 * Predict the project a finished session belongs to, so a session the user did
 * not attribute explicitly still lands on the right project in the statistics
 * (project treemaps, board hours, cards).
 *
 * Deliberately NOT an action creator: the prediction is a property of the
 * session record, not of the UI. Dispatching `setBoardId` here used to move the
 * user's focusing selection, which raced with the ending mask: whether the
 * session was credited to the predicted project or to "Unknown" depended on
 * whether the worker answered before the user confirmed the mask, and the guess
 * silently stayed selected for every later session.
 *
 * Returns the predicted board `_id`, or `undefined` when there is no usable
 * prediction. Never rejects, so callers can await it unconditionally.
 */
export async function inferProject(sessionData: PomodoroRecord): Promise<string | undefined> {
    // Predict session's project
    const newProjectId = (await workers.knn.predict(sessionData).catch((err) => {
        console.error('predicting error', err);
        return undefined;
    })) as string | undefined;

    if (newProjectId === undefined) {
        return undefined;
    }

    // The prediction label is the board `_id` of the closest historical
    // session, and records must refer to a real board `_id` (`Timer` renders
    // `kanban.boards[boardId]` directly, and the treemaps resolve ids through
    // the kanban DB). Only use the prediction while that board still exists; this
    // also filters out degenerate predictions such as an empty string.
    const board = await workers.dbWorkers.kanbanDB
        .findOne({ _id: newProjectId })
        .catch(() => undefined);
    return board ? newProjectId : undefined;
}

/**
 * Which project a finished session is credited to. An explicit choice (the
 * focusing project of the timer page, or the one picked on the ending mask)
 * always wins over the prediction, so a guess can never override the user, no
 * matter whether the prediction arrived before or after that choice.
 */
export function resolveSessionProjectId(
    confirmedBoardId?: string,
    inferredProjectId?: string
): string | undefined {
    return confirmedBoardId !== undefined ? confirmedBoardId : inferredProjectId;
}

export const actions = {
    pauseTimer,
    continueTimer,
    stopTimer,
    startTimer,
    setBoardId,
    changeAppTab,
    extendCurrentSession,
    setChosenRecord,
    setSessionEnding,
    setTimerManager,
    switchFocusRestMode,
    fetchSettings: () => async (dispatch: Dispatch) => {
        const settings: Partial<Setting> = await settingDB.findOne({ name: 'setting' });
        if (settings == null) {
            return;
        }

        const settingKeywords: [string, any][] = [
            ['focusDuration', setFocusDuration],
            ['restDuration', setRestDuration],
            ['monitorInterval', setMonitorInterval],
            ['screenShotInterval', setScreenShotInterval],
            ['warnBeforeFocusStart', setWarnBeforeFocusStart],
            ['startOnBoot', setStartOnBoot],
            ['useHardwareAcceleration', setUseHardwareAcceleration],
            ['compactAlwaysOnTop', setCompactAlwaysOnTop],
            ['contentOpacity', setContentOpacity],
            ['themeBackgroundOpacity', setThemeBackgroundOpacity],
            ['wallpaperPath', setWallpaperPath],
            ['wallpaperOpacity', setWallpaperOpacity],
            ['longBreakDuration', setLongBreakDuration],
            ['minFinishDuration', setMinFinishDuration],
            ['distractingList', setDistractingList],
            ['autoUpdate', setAutoUpdate],
            ['calendarBaseColor', setCalendarBaseColor],
            ['themeId', setThemeId],
            ['followSystemTheme', setFollowSystemTheme],
            ['customThemes', setCustomThemes],
        ];
        for (const key of settingKeywords) {
            if (key[0] in settings) {
                // @ts-ignore
                const action = key[1](settings[key[0]]);
                dispatch(action);
            }
        }
        if (settings.wallpaperPath) {
            dispatch(
                setWallpaperDataUrl(
                    settings.wallpaperPath.startsWith('data:')
                        ? settings.wallpaperPath
                        : `wallpaper://local?path=${encodeURIComponent(settings.wallpaperPath)}`
                )
            );
        }
    },
    setAutoUpdate: (value: boolean) => async (dispatch: Dispatch) => {
        dispatch(setAutoUpdate(value));
        await settingDB.update(
            { name: 'setting' },
            { $set: { autoUpdate: value } },
            { upsert: true }
        );
    },
    setFocusDuration: (focusDuration: number) => async (dispatch: Dispatch) => {
        dispatch(setFocusDuration(focusDuration));
        await settingDB.update({ name: 'setting' }, { $set: { focusDuration } }, { upsert: true });
    },
    setMinimize: (mini: boolean) => async (dispatch: Dispatch) => {
        dispatch(setMinimize(mini));
        window.api.minimizeWindow(mini);
    },
    setCompact: (compact: boolean) => async (dispatch: Dispatch, getState: any) => {
        dispatch(setCompact(compact));
        window.api.compactWindow(compact, getState().timer.compactAlwaysOnTop);
    },
    setCompactAlwaysOnTop: (value: boolean) => async (dispatch: Dispatch, getState: any) => {
        dispatch(setCompactAlwaysOnTop(value));
        await settingDB.update(
            { name: 'setting' },
            { $set: { compactAlwaysOnTop: value } },
            { upsert: true }
        );
        if (getState().timer.compact) {
            window.api.compactWindow(true, value);
        }
    },
    setContentOpacity: (value: number) => (dispatch: Dispatch) => {
        dispatch(setContentOpacity(value));
        persistSettingWithDebounce('contentOpacity', value);
    },
    setThemeBackgroundOpacity: (value: number) => (dispatch: Dispatch) => {
        dispatch(setThemeBackgroundOpacity(value));
        persistSettingWithDebounce('themeBackgroundOpacity', value);
    },
    setWallpaperPath: (value?: string) => async (dispatch: Dispatch) => {
        dispatch(setWallpaperPath(value));
        dispatch(setWallpaperDataUrl(undefined));
        await settingDB.update(
            { name: 'setting' },
            value ? { $set: { wallpaperPath: value } } : { $unset: { wallpaperPath: true } },
            { upsert: true }
        );
        if (value) {
            dispatch(
                setWallpaperDataUrl(
                    value.startsWith('data:')
                        ? value
                        : `wallpaper://local?path=${encodeURIComponent(value)}`
                )
            );
        }
    },
    setWallpaperOpacity: (value: number) => (dispatch: Dispatch) => {
        dispatch(setWallpaperOpacity(value));
        persistSettingWithDebounce('wallpaperOpacity', value);
    },
    setDistractingList: (distractingList: DistractingRow[]) => async (dispatch: Dispatch) => {
        dispatch(setDistractingList(distractingList));
        await settingDB.update(
            { name: 'setting' },
            { $set: { distractingList } },
            { upsert: true }
        );
    },
    setRestDuration: (restDuration: number) => async (dispatch: Dispatch) => {
        dispatch(setRestDuration(restDuration));
        await settingDB.update({ name: 'setting' }, { $set: { restDuration } }, { upsert: true });
    },
    setLongBreakDuration: (longBreakDuration: number) => async (dispatch: Dispatch) => {
        dispatch(setLongBreakDuration(longBreakDuration));
        await settingDB.update(
            { name: 'setting' },
            { $set: { longBreakDuration } },
            { upsert: true }
        );
    },
    setMinFinishDuration: (minFinishDuration: number) => async (dispatch: Dispatch) => {
        dispatch(setMinFinishDuration(minFinishDuration));
        await settingDB.update(
            { name: 'setting' },
            { $set: { minFinishDuration } },
            { upsert: true }
        );
    },
    setStartOnBoot: (check: boolean) => async (dispatch: Dispatch) => {
        dispatch(setStartOnBoot(check));
        await settingDB.update(
            { name: 'setting' },
            { $set: { startOnBoot: check } },
            { upsert: true }
        );
    },
    setUseHardwareAcceleration: (check: boolean) => async (dispatch: Dispatch) => {
        dispatch(setUseHardwareAcceleration(check));
        await settingDB.update(
            { name: 'setting' },
            { $set: { useHardwareAcceleration: check } },
            { upsert: true }
        );
    },
    setMonitorInterval: (monitorInterval: number) => async (dispatch: Dispatch) => {
        dispatch(setMonitorInterval(monitorInterval));
        await settingDB.update(
            { name: 'setting' },
            { $set: { monitorInterval } },
            { upsert: true }
        );
    },
    setScreenShotInterval: (screenShotInterval?: number) => async (dispatch: Dispatch) => {
        dispatch(setScreenShotInterval(screenShotInterval));
        await settingDB.update(
            { name: 'setting' },
            { $set: { screenShotInterval } },
            { upsert: true }
        );
    },
    setWarnBeforeFocusStart: (warnBeforeFocusStart: boolean) => async (dispatch: Dispatch) => {
        dispatch(setWarnBeforeFocusStart(warnBeforeFocusStart));
        await settingDB.update(
            { name: 'setting' },
            { $set: { warnBeforeFocusStart } },
            { upsert: true }
        );
    },
    setCalendarBaseColor: (calendarBaseColor: string) => async (dispatch: Dispatch) => {
        dispatch(setCalendarBaseColor(calendarBaseColor));
        await settingDB.update(
            { name: 'setting' },
            { $set: { calendarBaseColor } },
            { upsert: true }
        );
    },
    setThemeId: (themeId: string) => async (dispatch: Dispatch) => {
        dispatch(setThemeId(themeId));
        await settingDB.update({ name: 'setting' }, { $set: { themeId } }, { upsert: true });
    },
    setFollowSystemTheme: (follow: boolean) => async (dispatch: Dispatch) => {
        dispatch(setFollowSystemTheme(follow));
        await settingDB.update(
            { name: 'setting' },
            { $set: { followSystemTheme: follow } },
            { upsert: true }
        );
    },
    setCustomThemes: (customThemes: ThemeDefinition[]) => async (dispatch: Dispatch) => {
        dispatch(setCustomThemes(customThemes));
        await settingDB.update({ name: 'setting' }, { $set: { customThemes } }, { upsert: true });
    },
    timerFinished:
        (sessionData?: PomodoroRecord, cardIds: string[] = [], boardId?: string | undefined) =>
        async (dispatch: Dispatch) => {
            dispatch(timerFinished());
            dispatch(historyActions.setExpiringKey(new Date().toString()));
            if (sessionData) {
                await addSession(sessionData).catch((err) => console.error(err));
                if (boardId !== undefined) {
                    await boardActions.onTimerFinished(
                        boardId,
                        sessionData._id,
                        sessionData.spentTimeInHour,
                        cardIds
                    )(dispatch);
                }
            }
        },
    switchToKanban: (kanbanId: string) => (dispatch: Dispatch) => {
        dispatch(actions.changeAppTab('kanban'));
        kanbanActions.setChosenBoardId(kanbanId)(dispatch);
    },
};

export type TimerActionTypes = { [key in keyof typeof actions]: typeof actions[key] };
export const reducer = createReducer<TimerState>(defaultState, (builder) => {
    builder
        .addCase(startTimer, (state: TimerState) => {
            const duration: number = state.isFocusing
                ? state.focusDuration
                : state.iBreak % LONG_BREAK_INTERVAL === 0
                ? state.longBreakDuration
                : state.restDuration;
            const now = new Date().getTime();
            // `scaleMs` is the identity in production and divides by
            // DEBUG_TIME_SCALE elsewhere -- the very branch this used to spell out
            // inline; see the time scale contract in `config.ts`.
            return { ...state, isRunning: true, targetTime: now + scaleMs(duration * 1000) };
        })
        .addCase(pauseTimer, (state) => ({
            ...state,
            isRunning: false,
            leftTime: state.targetTime ? state.targetTime - new Date().getTime() : undefined,
        }))
        .addCase(continueTimer, (state) => ({
            ...state,
            isRunning: true,
            targetTime: state.leftTime ? new Date().getTime() + state.leftTime : state.targetTime,
        }))
        .addCase(stopTimer, (state) => ({
            ...state,
            leftTime: undefined,
            isRunning: false,
            targetTime: undefined,
        }))
        .addCase(timerFinished, (state: TimerState) => {
            return {
                ...state,
                isRunning: false,
                targetTime: undefined,
                isFocusing: !state.isFocusing,
                iBreak: state.iBreak + (state.isFocusing ? 1 : 0),
                leftTime: undefined,
            };
        })
        .addCase(setFocusDuration, (state, { payload }) =>
            // Project: persistence
            ({ ...state, focusDuration: payload })
        )
        .addCase(setRestDuration, (state, { payload }) =>
            // Project: persistence
            ({ ...state, restDuration: payload })
        )
        .addCase(setAutoUpdate, (state, { payload }) => ({
            ...state,
            autoUpdate: payload,
        }))
        .addCase(setMonitorInterval, (state, { payload }) => ({
            ...state,
            monitorInterval: payload,
        }))
        .addCase(setScreenShotInterval, (state, { payload }) => ({
            ...state,
            screenShotInterval:
                payload == null
                    ? payload
                    : process.env.NODE_ENV !== 'development'
                    ? payload
                    : payload / DEBUG_TIME_SCALE,
        }))
        .addCase(setCalendarBaseColor, (state, { payload }) => ({
            ...state,
            calendarBaseColor: payload,
        }))
        .addCase(setThemeId, (state, { payload }) => ({ ...state, themeId: payload }))
        .addCase(setFollowSystemTheme, (state, { payload }) => ({
            ...state,
            followSystemTheme: payload,
        }))
        .addCase(setCustomThemes, (state, { payload }) => ({ ...state, customThemes: payload }))
        .addCase(switchFocusRestMode, (state) => ({
            ...state,
            isFocusing: !state.isFocusing,
            leftTime: undefined,
            targetTime: undefined,
            isRunning: false,
        }))
        .addCase(setBoardId, (state, { payload: { boardId } }) => ({ ...state, boardId }))
        .addCase(changeAppTab, (state, { payload }) => ({ ...state, currentTab: payload }))
        .addCase(setStartOnBoot, (state, { payload }) => ({
            ...state,
            startOnBoot: payload,
        }))
        .addCase(setWarnBeforeFocusStart, (state, { payload }) => ({
            ...state,
            warnBeforeFocusStart: payload,
        }))
        .addCase(setUseHardwareAcceleration, (state, { payload }) => ({
            ...state,
            useHardwareAcceleration: payload,
        }))
        .addCase(setLongBreakDuration, (state, { payload: { longBreakDuration } }) => ({
            ...state,
            longBreakDuration,
        }))
        .addCase(setMinFinishDuration, (state, { payload }) => ({
            ...state,
            minFinishDuration: payload,
        }))
        .addCase(extendCurrentSession, (state, { payload }) => ({
            ...state,
            // Same clock as `startTimer`: the extension is a nominal duration the
            // dev clock compresses (see `scaleMs`), so +5 lasts 2.5 seconds
            // outside production instead of a flat second or a real 5 minutes.
            targetTime: new Date().getTime() + scaleMs(payload * 1000),
            isFocusing: true,
            isRunning: true,
        }))
        .addCase(setDistractingList, (state, { payload }) => ({
            ...state,
            distractingList: payload,
        }))
        .addCase(setChosenRecord, (state, { payload: { record } }) => ({
            ...state,
            chosenRecord: record,
        }))
        .addCase(setTimerManager, (state, { payload: { manager } }) => ({
            ...state,
            timerManager: manager,
        }))
        .addCase(setSessionEnding, (state, { payload }) => ({
            ...state,
            sessionEnding: payload,
        }))
        .addCase(setMinimize, (state, { payload }) => ({
            ...state,
            minimize: payload,
            compact: false,
            currentTab: 'timer',
        }))
        .addCase(setCompact, (state, { payload }) => ({
            ...state,
            compact: payload,
            minimize: false,
            currentTab: payload ? 'timer' : state.currentTab,
        }))
        .addCase(setCompactAlwaysOnTop, (state, { payload }) => ({
            ...state,
            compactAlwaysOnTop: payload,
        }))
        .addCase(setContentOpacity, (state, { payload }) => ({
            ...state,
            contentOpacity: payload,
        }))
        .addCase(setThemeBackgroundOpacity, (state, { payload }) => ({
            ...state,
            themeBackgroundOpacity: payload,
        }))
        .addCase(setWallpaperPath, (state, { payload }) => ({
            ...state,
            wallpaperPath: payload,
        }))
        .addCase(setWallpaperDataUrl, (state, { payload }) => ({
            ...state,
            wallpaperDataUrl: payload,
        }))
        .addCase(setWallpaperOpacity, (state, { payload }) => ({
            ...state,
            wallpaperOpacity: payload,
        }));
});
