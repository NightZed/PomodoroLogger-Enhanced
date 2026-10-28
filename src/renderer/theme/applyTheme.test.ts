import {
    applyTheme,
    findThemeDefinition,
    resolveTheme,
    systemPrefersDark,
    toCssVariables,
} from './applyTheme';
import { BUILTIN_THEMES, DAY_THEME_ID, NIGHT_THEME_ID, ThemeDefinition } from './tokens';

const customTheme: ThemeDefinition = {
    id: 'custom',
    name: 'Custom',
    tokens: {
        ...BUILTIN_THEMES[0].tokens,
        base: 'dark',
        bg: '#010203',
    },
};

describe('theme/applyTheme', () => {
    afterEach(() => {
        document.documentElement.removeAttribute('data-theme');
        delete (window as any).api?.setNativeTheme;
        jest.restoreAllMocks();
    });

    it('exposes the flat css variable map', () => {
        const vars = toCssVariables(BUILTIN_THEMES[0].tokens);

        expect(vars['--pl-bg']).toBe(BUILTIN_THEMES[0].tokens.bg);
        expect(vars['--pl-text']).toBe(BUILTIN_THEMES[0].tokens.text);
        expect(vars['--pl-primary']).toBe(BUILTIN_THEMES[0].tokens.primary);
        expect(Object.keys(vars)).toHaveLength(11);
    });

    it('writes the tokens to the document and asks main for the native theme', () => {
        const setNativeTheme = jest.fn();
        (window as any).api = { ...(window as any).api, setNativeTheme };

        applyTheme(customTheme.tokens, 'dark');

        expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
        expect(document.documentElement.style.getPropertyValue('--pl-bg')).toBe('#010203');
        expect(setNativeTheme).toHaveBeenCalledWith('dark');
    });

    it('reads the current desktop preference through matchMedia', () => {
        const matchMedia = jest.fn().mockReturnValue({ matches: true });
        Object.defineProperty(window, 'matchMedia', { configurable: true, value: matchMedia });

        expect(systemPrefersDark()).toBe(true);
        expect(matchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)');
    });

    it('resolves the system theme when followSystemTheme is enabled', () => {
        Object.defineProperty(window, 'matchMedia', {
            configurable: true,
            value: jest.fn().mockReturnValue({ matches: true }),
        });

        expect(resolveTheme(DAY_THEME_ID, true)).toMatchObject({
            source: 'system',
            themeId: NIGHT_THEME_ID,
        });
    });

    it('resolves a built-in or custom theme by id', () => {
        expect(resolveTheme(DAY_THEME_ID, false)).toMatchObject({
            source: 'light',
            themeId: DAY_THEME_ID,
        });
        expect(resolveTheme('custom', false, [customTheme])).toMatchObject({
            source: 'dark',
            themeId: 'custom',
        });
    });

    it('falls back to the night theme for an unknown id', () => {
        expect(resolveTheme('missing', false)).toMatchObject({
            themeId: NIGHT_THEME_ID,
            source: 'dark',
        });
        expect(findThemeDefinition('missing')).toBeUndefined();
        expect(findThemeDefinition(DAY_THEME_ID)).toBe(
            BUILTIN_THEMES.find((theme) => theme.id === DAY_THEME_ID)
        );
    });
});
