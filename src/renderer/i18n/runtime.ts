import { createTranslator, languageFromLocale, resolveLanguage } from '../../shared/i18n';
import type { Language, MessageArgs, MessageKey, TranslateFn } from '../../shared/i18n';

let active: Language = 'en';
const listeners = new Set<() => void>();

/** One translator per language; `t()` and `useI18n()` both read from here. */
export const translators: { [L in Language]: TranslateFn } = {
    en: createTranslator('en'),
    zh: createTranslator('zh'),
};

/**
 * The language the OS reports, resolved once at startup. The main process
 * hands its `app.getLocale()` result through `--pl-initial-language`; a plain
 * browser or a test falls back to `navigator.language`.
 */
export const SYSTEM_LANGUAGE: Language =
    window.api?.initialLanguage?.systemLanguage ??
    languageFromLocale(typeof navigator === 'undefined' ? 'en' : navigator.language);

export function getActiveLanguage(): Language {
    return active;
}

/** Only notifies on a real change, so `store.subscribe` can call it on every dispatch. */
export function setActiveLanguage(next: Language): void {
    if (next === active) {
        return;
    }

    active = next;
    for (const listener of Array.from(listeners)) {
        listener();
    }
}

export function subscribeLanguage(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/**
 * For class components, module level helpers and event callbacks. It resolves
 * the language at call time, so `Timer`'s tray labels and the notification
 * bodies follow a language switch without touching their call sites.
 *
 * Module level constants must not call this: the value would be frozen at
 * import time. Use a `PlainMessageKey` table and translate where it is used.
 */
export function t<K extends MessageKey>(key: K, ...args: MessageArgs<K>): string {
    return translators[active](key, ...args);
}

export { resolveLanguage };
