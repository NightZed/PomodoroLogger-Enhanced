import * as React from 'react';
import type { Language, TranslateFn } from '../../shared/i18n';
import { getActiveLanguage, subscribeLanguage, translators } from './runtime';

/**
 * Subscribes a component to the active language.
 *
 * Deliberately not a React context: the renderer reaches the language through
 * a module level store, so a bare `render(<Component />)` in a test works
 * without a provider. `useSyncExternalStore` also re-renders the component even
 * when its parent bailed out through `React.memo` or `shouldComponentUpdate` --
 * which is exactly how the settings page and the kanban board are wrapped.
 */
export function useI18n(): { t: TranslateFn; language: Language } {
    const language = React.useSyncExternalStore(
        subscribeLanguage,
        getActiveLanguage,
        getActiveLanguage
    );

    return React.useMemo(() => ({ t: translators[language], language }), [language]);
}

export function useTranslate(): TranslateFn {
    return useI18n().t;
}
