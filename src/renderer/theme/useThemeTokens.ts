import * as React from 'react';
import { dayTokens, nightTokens, ThemeTokens } from './tokens';

/**
 * Resolves the tokens of the currently applied theme from the `data-theme`
 * attribute that `applyTheme()` writes to `document.documentElement`.
 *
 * Needed by everything that paints outside of CSS: `<canvas>` (echarts labels,
 * wordcloud) and SVG presentation attributes cannot resolve `var(--pl-*)`.
 * When user defined themes are implemented, this is the single place to extend.
 */
export function getThemeTokens(): ThemeTokens {
    if (typeof document === 'undefined' || !document.documentElement) {
        return dayTokens;
    }

    return document.documentElement.getAttribute('data-theme') === 'dark' ? nightTokens : dayTokens;
}

export function useThemeTokens(): { tokens: ThemeTokens; isDark: boolean } {
    const [tokens, setTokens] = React.useState<ThemeTokens>(getThemeTokens);

    React.useEffect(() => {
        // Synchronize once after mount: the first applyTheme() may run in a
        // sibling effect that executes after this component's state was
        // initialized during render, so the captured value can be stale.
        const synced = getThemeTokens();
        setTokens((prev) => (prev === synced ? prev : synced));

        if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
            return undefined;
        }

        const observer = new MutationObserver(() => setTokens(getThemeTokens()));
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme'],
        });
        return () => observer.disconnect();
    }, []);

    return { tokens, isDark: tokens.base === 'dark' };
}
