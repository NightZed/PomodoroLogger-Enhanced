import {
    encodeInitialLanguage,
    INITIAL_LANGUAGE_ARGUMENT,
    parseInitialLanguage,
} from './initialLanguage';

describe('initial language argument', () => {
    it('encodes to the documented prefix', () => {
        expect(encodeInitialLanguage({ language: 'zh', systemLanguage: 'zh' })).toBe(
            `${INITIAL_LANGUAGE_ARGUMENT}${encodeURIComponent(
                JSON.stringify({ language: 'zh', systemLanguage: 'zh' })
            )}`
        );
    });

    it('round-trips both values', () => {
        const encoded = encodeInitialLanguage({ language: 'system', systemLanguage: 'zh' });
        expect(parseInitialLanguage([encoded])).toEqual({
            language: 'system',
            systemLanguage: 'zh',
        });
    });

    it('returns undefined when the argument is absent or broken', () => {
        expect(parseInitialLanguage([])).toBeUndefined();
        expect(parseInitialLanguage([`${INITIAL_LANGUAGE_ARGUMENT}not-json`])).toBeUndefined();
        expect(parseInitialLanguage([`${INITIAL_LANGUAGE_ARGUMENT}null`])).toBeUndefined();
    });

    it('falls back to system / en for unknown values', () => {
        const encoded =
            INITIAL_LANGUAGE_ARGUMENT +
            encodeURIComponent(JSON.stringify({ language: 'fr', systemLanguage: 'fr' }));
        expect(parseInitialLanguage([encoded])).toEqual({
            language: 'system',
            systemLanguage: 'en',
        });
    });
});
