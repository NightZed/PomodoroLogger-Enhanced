import { encodeInitialTheme, parseInitialTheme } from './initialTheme';

describe('initial theme hand-over', () => {
    it('round-trips through a single command line argument', () => {
        const setting = { themeId: 'day', followSystemTheme: false };
        const argument = encodeInitialTheme(setting);

        expect(argument).toBe(
            '--pl-initial-theme=%7B%22themeId%22%3A%22day%22%2C%22followSystemTheme%22%3Afalse%7D'
        );
        expect(parseInitialTheme(['--inspect', argument])).toEqual(setting);
    });

    it('keeps the follow-system flag and a missing theme id', () => {
        expect(
            parseInitialTheme([encodeInitialTheme({ themeId: undefined, followSystemTheme: true })])
        ).toEqual({ themeId: undefined, followSystemTheme: true });
    });

    it('ignores a missing or malformed argument', () => {
        expect(parseInitialTheme([])).toBeUndefined();
        expect(parseInitialTheme(['--pl-initial-theme=%E0%A4%A'])).toBeUndefined();
        expect(parseInitialTheme(['--pl-initial-theme=null'])).toBeUndefined();
        expect(parseInitialTheme(['--pl-initial-theme=%22day%22'])).toBeUndefined();
    });
});
