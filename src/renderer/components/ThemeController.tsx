import * as React from 'react';
import { connect } from 'react-redux';
import { RootState } from '../reducers';
import { applyTheme, resolveTheme } from '../theme';
import { ThemeDefinition } from '../theme/tokens';
import {
    applyContentOpacity,
    applyThemeBackgroundOpacity,
    applyWallpaperOpacity,
} from '../theme/opacity';

interface Props {
    themeId: string;
    followSystemTheme: boolean;
    themeBackgroundOpacity: number;
    contentOpacity: number;
    wallpaperOpacity: number;
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
 *
 * It is also the store-side writer of the three window-layer opacities, the
 * channel through which they reach CSS (see the layer table in
 * `Application.tsx` and the writers in `theme/opacity.ts`):
 *
 * - `--pl-theme-bg-opacity`  — the two `Main::before`/`::after` bands, the
 *   ending screen;
 * - `--pl-wallpaper-opacity` — the wallpaper;
 * - `--pl-content-opacity`   — content + overlays.
 *
 * Every surface that carries one of them quotes the property instead of taking
 * the value as a prop again, so each setting has exactly one output path. This
 * is also what makes a slider drag cheap: the drag previews by writing the
 * variable directly (no store write, no re-render), and the committed value
 * arrives here the usual way.
 */
const ThemeControllerBase: React.FunctionComponent<Props> = (props: Props) => {
    const { themeId, followSystemTheme, customThemes } = props;

    React.useEffect(() => {
        applyThemeBackgroundOpacity(props.themeBackgroundOpacity);
    }, [props.themeBackgroundOpacity]);

    React.useEffect(() => {
        applyContentOpacity(props.contentOpacity);
    }, [props.contentOpacity]);

    React.useEffect(() => {
        applyWallpaperOpacity(props.wallpaperOpacity);
    }, [props.wallpaperOpacity]);

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
    themeBackgroundOpacity: state.timer.themeBackgroundOpacity,
    contentOpacity: state.timer.contentOpacity,
    wallpaperOpacity: state.timer.wallpaperOpacity,
    customThemes: state.timer.customThemes,
}))(ThemeControllerBase);
