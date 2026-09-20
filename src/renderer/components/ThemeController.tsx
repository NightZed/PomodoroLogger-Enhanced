import * as React from 'react';
import { connect } from 'react-redux';
import { RootState } from '../reducers';
import { applyTheme, resolveTheme } from '../theme';
import { ThemeDefinition } from '../theme/tokens';

interface Props {
    themeId: string;
    followSystemTheme: boolean;
    /** Reserved for user defined themes; built-in themes are used when empty. */
    customThemes?: ThemeDefinition[];
}

/** `window.matchMedia` is unavailable outside of a browser-like environment. */
function getDarkModeMediaQuery(): MediaQueryList | undefined {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return undefined;
    }

    return window.matchMedia('(prefers-color-scheme: dark)');
}

/**
 * Pushes the active theme into the document (CSS custom properties + `data-theme`)
 * and keeps Chromium's own surfaces in sync. Renders nothing on purpose: the
 * side effect lives in its own component so a theme switch only re-renders this
 * leaf instead of the whole application.
 */
const ThemeControllerBase: React.FunctionComponent<Props> = (props: Props) => {
    const { themeId, followSystemTheme, customThemes } = props;

    React.useEffect(() => {
        const { tokens, source } = resolveTheme(themeId, followSystemTheme, customThemes);
        applyTheme(tokens, source);
    }, [themeId, followSystemTheme, customThemes]);

    // While "follow system" is on, react to OS level light/dark switches.
    React.useEffect(() => {
        if (!followSystemTheme) {
            return undefined;
        }

        const mediaQuery = getDarkModeMediaQuery();
        if (!mediaQuery) {
            return undefined;
        }

        const onSystemThemeChange = () => {
            const { tokens, source } = resolveTheme(themeId, true, customThemes);
            applyTheme(tokens, source);
        };
        mediaQuery.addListener(onSystemThemeChange);
        return () => mediaQuery.removeListener(onSystemThemeChange);
    }, [followSystemTheme, themeId, customThemes]);

    return null;
};

export const ThemeController = connect((state: RootState) => ({
    themeId: state.timer.themeId,
    followSystemTheme: state.timer.followSystemTheme,
    customThemes: state.timer.customThemes,
}))(ThemeControllerBase);
