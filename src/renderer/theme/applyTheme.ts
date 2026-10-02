import {
    BUILTIN_THEMES,
    DAY_THEME_ID,
    NIGHT_THEME_ID,
    ThemeBase,
    ThemeDefinition,
    ThemeTokens,
} from './tokens';

type ColorTokenKey = Exclude<keyof ThemeTokens, 'base'>;

/** token name -> css custom property. `base` is exposed as `data-theme`. */
const CSS_VAR_NAMES: { [K in ColorTokenKey]: string } = {
    bg: '--pl-bg',
    bgElevated: '--pl-bg-elevated',
    bgSunken: '--pl-bg-sunken',
    bgHover: '--pl-bg-hover',
    text: '--pl-text',
    textSecondary: '--pl-text-secondary',
    textTertiary: '--pl-text-tertiary',
    border: '--pl-border',
    primary: '--pl-primary',
    accent: '--pl-accent',
    shadow: '--pl-shadow',
};

/** `system` keeps Chromium in sync with the OS preference. */
export type ThemeSource = ThemeBase | 'system';

const colorTokenKeys = Object.keys(CSS_VAR_NAMES) as ColorTokenKey[];

/**
 * `electron` is not available when the theme module is imported outside of the
 * Electron runtime (unit tests, styleguidist), so it is resolved lazily and the
 * callers degrade to a DOM-only theme switch.
 */
export function getNativeTheme():
    | { themeSource?: ThemeSource; shouldUseDarkColors?: boolean }
    | undefined {
    try {
        return require('electron').nativeTheme;
    } catch (e) {
        return undefined;
    }
}

export function systemPrefersDark(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return false;
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Flat `{ '--pl-bg': '#141414', ... }` view of a theme, handy for tests. */
export function toCssVariables(tokens: ThemeTokens): { [name: string]: string } {
    const vars: { [name: string]: string } = {};
    for (const key of colorTokenKeys) {
        vars[CSS_VAR_NAMES[key]] = tokens[key];
    }

    return vars;
}

/**
 * Writes the tokens to `document.documentElement` and keeps Chromium's own
 * surfaces (scrollbars, native form controls, `prefers-color-scheme`) in sync.
 */
export function applyTheme(tokens: ThemeTokens, themeSource: ThemeSource): void {
    if (typeof document !== 'undefined' && document.documentElement) {
        const root = document.documentElement;
        const vars = toCssVariables(tokens);
        for (const name in vars) {
            root.style.setProperty(name, vars[name]);
        }

        root.setAttribute('data-theme', tokens.base);
    }

    const nativeTheme = getNativeTheme();
    if (nativeTheme) {
        nativeTheme.themeSource = themeSource;
    }
}

export function findThemeDefinition(
    themeId: string | undefined,
    customThemes?: ThemeDefinition[]
): ThemeDefinition | undefined {
    const all = customThemes ? BUILTIN_THEMES.concat(customThemes) : BUILTIN_THEMES;
    return all.find((theme) => theme.id === themeId);
}

/**
 * Picks the tokens that should be displayed right now.
 *
 * Built-in themes cannot be edited, and user defined themes are not implemented
 * yet -- `customThemes` is the hook they will be read from.
 */
export function resolveTheme(
    themeId: string | undefined,
    followSystemTheme: boolean,
    customThemes?: ThemeDefinition[]
): { tokens: ThemeTokens; source: ThemeSource; themeId: string } {
    if (followSystemTheme) {
        const id = systemPrefersDark() ? NIGHT_THEME_ID : DAY_THEME_ID;
        const theme = findThemeDefinition(id)!;
        return { tokens: theme.tokens, source: 'system', themeId: id };
    }

    const theme = findThemeDefinition(themeId, customThemes);
    if (theme) {
        return { tokens: theme.tokens, source: theme.tokens.base, themeId: theme.id };
    }

    const fallback = findThemeDefinition(undefined, customThemes);
    if (fallback) {
        return { tokens: fallback.tokens, source: fallback.tokens.base, themeId: fallback.id };
    }

    // Should not happen: the built-in list is never empty.
    const night = BUILTIN_THEMES[1];
    return { tokens: night.tokens, source: night.tokens.base, themeId: night.id };
}
