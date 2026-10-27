import type { InitialThemeSetting } from './type';

/**
 * Command line hand-over of the theme the main process resolved before the
 * window was created (see `init.ts createWindow`).
 *
 * The renderer store defaults to the night theme and only learns the persisted
 * theme after `fetchSettings()` finishes. Without this the first `applyTheme()`
 * would push `nativeTheme.themeSource = 'dark'` over the correct `light` the
 * main process had already set, repainting the splash (and DevTools) dark and
 * then light again -- the white -> black -> white flash on startup.
 *
 * Passed through `webPreferences.additionalArguments`, which Electron appends
 * to `process.argv` of the renderer process, so a sandboxed preload can read it
 * synchronously before the renderer bundle runs.
 */
export const INITIAL_THEME_ARGUMENT = '--pl-initial-theme=';

export function encodeInitialTheme(setting: InitialThemeSetting): string {
    // encodeURIComponent keeps the value free of spaces/quotes, which would be
    // split or mangled by the platform command line parser.
    return INITIAL_THEME_ARGUMENT + encodeURIComponent(JSON.stringify(setting));
}

export function parseInitialTheme(argv: readonly string[]): InitialThemeSetting | undefined {
    const argument = argv.find((value) => value.startsWith(INITIAL_THEME_ARGUMENT));
    if (!argument) {
        return undefined;
    }

    try {
        const parsed = JSON.parse(
            decodeURIComponent(argument.slice(INITIAL_THEME_ARGUMENT.length))
        );
        if (parsed == null || typeof parsed !== 'object') {
            return undefined;
        }

        return {
            themeId: typeof parsed.themeId === 'string' ? parsed.themeId : undefined,
            followSystemTheme: parsed.followSystemTheme === true,
        };
    } catch {
        return undefined;
    }
}
