import { en } from './en';
import { zh } from './zh';
import type { MessageArgs, MessageKey, TranslateFn } from './keys';
import type { Language } from './types';

export const CATALOGS: { [L in Language]: typeof en } = { en, zh };

function lookup(catalog: unknown, key: string): unknown {
    return key
        .split('.')
        .reduce<unknown>(
            (node, part) =>
                node != null && typeof node === 'object' ? (node as any)[part] : undefined,
            catalog
        );
}

/**
 * Builds a translator for one language. The result is cached by the callers
 * (`renderer/i18n/runtime.ts` keeps one per language), so a render never walks
 * the catalog tree more than once per message.
 *
 * A missing key returns the key itself. It must not log: `test/console-gate.js`
 * treats `console.warn` as a test failure, and catalog completeness is already
 * enforced by `yarn typecheck` plus `catalog.test.ts`.
 */
export function createTranslator(language: Language): TranslateFn {
    const catalog = CATALOGS[language];

    const translate = <K extends MessageKey>(key: K, ...args: MessageArgs<K>): string => {
        const value = lookup(catalog, key);
        if (typeof value === 'function') {
            return (value as (...a: unknown[]) => string)(...args);
        }
        return typeof value === 'string' ? value : key;
    };

    return translate as TranslateFn;
}

/** The feedback branch of a catalog, used by `FEEDBACK_MESSAGES`' live view. */
export function feedbackMessages(language: Language): typeof en.feedback {
    return CATALOGS[language].feedback;
}
