import type { InitialLanguageSetting } from './type';

/**
 * Command line hand-over of the language the main process resolved before the
 * window was created (see `init.ts readInitialSettings`).
 *
 * Kept separate from `initialTheme.ts` on purpose: the theme argument is
 * covered by its own exact-string test, and the language needs two values
 * (preference plus the OS language `'system'` resolves to).
 *
 * Passed through `webPreferences.additionalArguments`, so the sandboxed preload
 * can read it synchronously before the renderer bundle runs.
 */
export const INITIAL_LANGUAGE_ARGUMENT = '--pl-initial-language=';

export function encodeInitialLanguage(setting: InitialLanguageSetting): string {
    // encodeURIComponent keeps the value free of spaces/quotes, which would be
    // split or mangled by the platform command line parser.
    return INITIAL_LANGUAGE_ARGUMENT + encodeURIComponent(JSON.stringify(setting));
}

export function parseInitialLanguage(argv: readonly string[]): InitialLanguageSetting | undefined {
    const argument = argv.find((value) => value.startsWith(INITIAL_LANGUAGE_ARGUMENT));
    if (!argument) {
        return undefined;
    }

    try {
        const parsed = JSON.parse(
            decodeURIComponent(argument.slice(INITIAL_LANGUAGE_ARGUMENT.length))
        );
        if (parsed == null || typeof parsed !== 'object') {
            return undefined;
        }

        return {
            language:
                parsed.language === 'en' || parsed.language === 'zh' ? parsed.language : 'system',
            systemLanguage: parsed.systemLanguage === 'zh' ? 'zh' : 'en',
        };
    } catch {
        return undefined;
    }
}
