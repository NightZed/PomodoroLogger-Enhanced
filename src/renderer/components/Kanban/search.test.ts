import { compileCardSearch, highlightMatches } from './search';

describe('compileCardSearch', () => {
    it('treats metacharacters literally when regex mode is off', () => {
        const { reg, invalid } = compileCardSearch('(', false);

        expect([invalid, 'a (b'.match(reg!) !== null, 'ab'.match(reg!) !== null]).toEqual([
            false,
            true,
            false,
        ]);
    });

    it('matches a caret literally when regex mode is off', () => {
        const { reg } = compileCardSearch('^', false);

        expect(['a^b'.match(reg!) !== null, 'ab'.match(reg!) !== null]).toEqual([true, false]);
    });

    it('keeps regex syntax when regex mode is on', () => {
        const { reg, invalid } = compileCardSearch('^a', true);

        expect([invalid, 'abc'.match(reg!) !== null, 'ba'.match(reg!) !== null]).toEqual([
            false,
            true,
            false,
        ]);
    });

    it('reports an uncompilable expression instead of throwing', () => {
        expect(compileCardSearch('(', true).invalid).toBe(true);
    });

    it('treats a blank query as no filter', () => {
        expect([compileCardSearch(undefined, false).reg, compileCardSearch('', true).reg]).toEqual([
            undefined,
            undefined,
        ]);
    });
});

describe('highlightMatches', () => {
    /** What the user still reads once the highlight markup is stripped. */
    const textOf = (html: string) => html.replace(/<[^>]*>/g, '');
    /** How many pieces were wrapped; the tag name itself is an implementation choice. */
    const wrapped = (html: string) => (html.match(/<[a-z][^>]*>/gi) ?? []).length;

    it('highlights literal parentheses without changing the text', () => {
        const html = highlightMatches('a (b)', '(', false);

        expect([textOf(html), wrapped(html)]).toEqual(['a (b)', 1]);
    });

    // Regression: the old highlight loop used `exec` and never advanced
    // `lastIndex` after a zero-length match, so "^" froze the whole window.
    it('does not spin on a zero-length match', () => {
        expect(highlightMatches('abc', '^', true)).toBe('abc');
    });

    it('skips empty matches and keeps the real ones', () => {
        const html = highlightMatches('aba', 'a*', true);

        expect([textOf(html), wrapped(html)]).toEqual(['aba', 2]);
    });

    it('returns the same string when nothing matches', () => {
        const content = 'abc';

        expect(highlightMatches(content, 'z', false)).toBe(content);
    });
});
