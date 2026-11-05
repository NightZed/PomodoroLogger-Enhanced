import { app } from 'electron';

import {
    createTranslator,
    isLanguagePreference,
    languageFromLocale,
    resolveLanguage,
} from '../shared/i18n';
import type {
    Language,
    LanguagePreference,
    MessageArgs,
    MessageKey,
    TranslateFn,
} from '../shared/i18n';
import * as db from './db';

const translators: { [L in Language]: TranslateFn } = {
    en: createTranslator('en'),
    zh: createTranslator('zh'),
};

let active: Language | undefined;

/**
 * `app.getLocale()` throws before the app is ready, and `init.ts` builds the
 * updater at module load time (`const autoUpdaterCheck = update()`), so this
 * must tolerate being called early.
 */
function safeLocale(): string {
    try {
        return app.getLocale();
    } catch {
        return 'en';
    }
}

/**
 * The main process' own copy of the language. Resolved lazily on first use so
 * nothing touches `app` or the database before it is available.
 */
export function getMainLanguage(): Language {
    if (active) {
        return active;
    }

    const stored = db.readSettingValueSync<unknown>('language');
    const preference: LanguagePreference = isLanguagePreference(stored) ? stored : 'system';
    active = resolveLanguage(preference, languageFromLocale(safeLocale()));
    return active;
}

/** Called when the renderer switches language (`IpcEventName.SetLanguage`). */
export function setMainLanguage(language: Language): void {
    active = language;
}

/** Translate a main-process string. The key type is shared with the renderer. */
export const m: TranslateFn = (<K extends MessageKey>(key: K, ...args: MessageArgs<K>) =>
    translators[getMainLanguage()](key, ...args)) as TranslateFn;
