import type { Language, LanguagePreference } from './types';

/**
 * Maps an OS locale (`app.getLocale()` on the main side, `navigator.language`
 * in a browser or in tests) to a shipped language. Only Chinese locales map to
 * `zh`; everything else falls back to English.
 */
export function languageFromLocale(locale: string | undefined | null): Language {
    return typeof locale === 'string' && locale.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function isLanguage(value: unknown): value is Language {
    return value === 'en' || value === 'zh';
}

export function isLanguagePreference(value: unknown): value is LanguagePreference {
    return value === 'system' || isLanguage(value);
}

/**
 * Resolves the persisted preference against the language the OS reports.
 * `'system'` is the default, so a fresh install follows the OS.
 */
export function resolveLanguage(
    preference: LanguagePreference,
    systemLanguage: Language
): Language {
    return preference === 'system' ? systemLanguage : preference;
}
