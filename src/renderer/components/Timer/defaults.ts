import { DEFAULT_THEME_ID } from '../../theme/tokens';
import type { DistractingRow, Setting } from './action';

/**
 * Settings whose "no value" is the absence of a row rather than a stored one.
 * A settings reset unsets these instead of writing `undefined` over them.
 */
export const NULLABLE_SETTINGS = [
    'screenShotInterval',
    'workSoundPath',
    'shortBreakSoundPath',
    'longBreakSoundPath',
    'wallpaperPath',
    'customThemes',
] as const;

export type NullableSettingKey = (typeof NULLABLE_SETTINGS)[number];

/** The factory rules of the distracting-app filter. */
export const DEFAULT_DISTRACTING_LIST: DistractingRow[] = [
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
];

/**
 * The factory value of every persisted setting.
 *
 * This is the ONE list: `defaultState` spreads it for a fresh install, and
 * "Reset All Settings" writes it back, so the two cannot drift. Keep nullable
 * settings out of the object -- `NULLABLE_SETTINGS` names them, and both the
 * reducer and the reset clear them.
 *
 * A function rather than a constant because of `distractingList`: every caller
 * gets its own array, so the store, the database and a reset never share one.
 */
export function createDefaultSettings(): Omit<Setting, NullableSettingKey | 'wallpaperDataUrl'> {
    return {
        autoUpdate: true,
        focusDuration: 25 * 60,
        restDuration: 5 * 60,
        longBreakDuration: 15 * 60,
        // As long as the focused session itself: a finished session is what the
        // default asks for, and the guard never blocks a session that ran full
        // length.
        minFinishDuration: 25 * 60,
        monitorInterval: 1000,
        workSoundEnabled: true,
        shortBreakSoundEnabled: true,
        longBreakSoundEnabled: true,
        soundVolume: 0.5,
        desktopNotification: true,
        warnBeforeFocusStart: true,
        returnToTimerOnSessionEnd: true,
        openWindowOnSessionEnd: false,
        startOnBoot: false,
        useHardwareAcceleration: false,
        unloadOnCloseToTray: true,
        compactAlwaysOnTop: true,
        contentOpacity: 1,
        themeBackgroundOpacity: 1,
        wallpaperOpacity: 1,
        distractingList: DEFAULT_DISTRACTING_LIST.map((row) => ({ ...row })),
        calendarBaseColor: '#aceebb',
        // Light is the theme the app ships with; following the OS is on, so
        // `themeId` only decides what a system that reports neither light nor
        // dark falls back to.
        themeId: DEFAULT_THEME_ID,
        followSystemTheme: true,
        language: 'system',
        logLevel: 'info',
    };
}
