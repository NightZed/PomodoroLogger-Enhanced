/**
 * Theme tokens.
 *
 * Every surface of the app is expressed through these semantic tokens. They are
 * written to the document as CSS custom properties (`--pl-bg`, `--pl-text`, ...)
 * by `applyTheme`, so switching theme is a plain CSS variable update: the antd 3
 * component overrides (see `globalStyle.ts`) and our own styled-components read
 * exactly the same variables.
 *
 * `ThemeTokens` is intentionally a small, semantic set instead of a 1:1 mirror of
 * antd's variables: it keeps the antd overrides maintainable and leaves room for
 * user defined themes later on.
 */
export type ThemeBase = 'light' | 'dark';

export interface ThemeTokens {
    /** Tells whether the theme is a light or a dark one. */
    base: ThemeBase;
    /** Page background. */
    bg: string;
    /** Raised surfaces: cards, modals, popovers, dropdowns. */
    bgElevated: string;
    /** Sunken surfaces: the timer sider, inputs, board columns. */
    bgSunken: string;
    /** Hover background of list rows / menu items. */
    bgHover: string;
    /** Primary text. */
    text: string;
    /** Secondary text (labels, hints). */
    textSecondary: string;
    /** Tertiary text (timestamps, disabled). */
    textTertiary: string;
    /** Borders and dividers. */
    border: string;
    /** Brand / selection color. */
    primary: string;
    /** Accent color (progress ring, highlights). */
    accent: string;
    /** Shadow color of raised surfaces. */
    shadow: string;
}

/**
 * A named theme. Built-in themes ship with the app and are not editable.
 * User defined themes are kept in `settingDB` (see `Setting.customThemes`) so
 * that they travel with the regular data export.
 */
export interface ThemeDefinition {
    id: string;
    name: string;
    builtin?: boolean;
    tokens: ThemeTokens;
}

export const DAY_THEME_ID = 'day';
export const NIGHT_THEME_ID = 'night';

/** The app starts in the night theme. */
export const DEFAULT_THEME_ID = NIGHT_THEME_ID;

/**
 * Day theme -- matches the colors the app used before theming was introduced, so
 * the light appearance stays untouched.
 */
export const dayTokens: ThemeTokens = {
    base: 'light',
    bg: '#ffffff',
    bgElevated: '#ffffff',
    bgSunken: '#eaeaea',
    bgHover: 'rgba(0, 0, 0, 0.04)',
    text: 'rgba(0, 0, 0, 0.85)',
    textSecondary: '#555555',
    textTertiary: '#999999',
    border: '#dfdfdf',
    primary: '#1890ff',
    accent: '#87d068',
    shadow: 'rgba(0, 0, 0, 0.15)',
};

/** Night theme -- follows the antd 4 dark palette for a familiar look. */
export const nightTokens: ThemeTokens = {
    base: 'dark',
    bg: '#141414',
    bgElevated: '#1f1f1f',
    bgSunken: '#262626',
    bgHover: 'rgba(255, 255, 255, 0.08)',
    text: 'rgba(255, 255, 255, 0.85)',
    textSecondary: 'rgba(255, 255, 255, 0.55)',
    textTertiary: 'rgba(255, 255, 255, 0.35)',
    border: '#303030',
    primary: '#177ddc',
    accent: '#49aa19',
    shadow: 'rgba(0, 0, 0, 0.45)',
};

export const BUILTIN_THEMES: ThemeDefinition[] = [
    { id: DAY_THEME_ID, name: 'Day', builtin: true, tokens: dayTokens },
    { id: NIGHT_THEME_ID, name: 'Night', builtin: true, tokens: nightTokens },
];
