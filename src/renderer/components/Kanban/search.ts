/**
 * Card search comes in two modes. Literal (the default) is what the search box
 * promises: the typed text is matched as-is, so "(" finds the cards that
 * contain a parenthesis instead of failing to compile. Regex mode keeps the
 * old behaviour for users who want it, and makes an invalid expression
 * observable instead of silently showing every card.
 */
const REGEXP_META = /[.*+?^${}()|[\]\\]/g;

/** Escape every regex metacharacter so `query` can only match itself. */
const escapeRegExp = (query: string): string => query.replace(REGEXP_META, '\\$&');

export interface CardSearch {
    /** The matcher; absent for a blank query or an invalid expression. */
    reg?: RegExp;
    /** Regex mode is on and the query does not compile. */
    invalid: boolean;
}

/**
 * Compile the search box into a matcher shared by the list filter and the card
 * highlight, so both always agree on what a query means.
 *
 * A blank query means "no filter" (`reg` undefined, `invalid` false). In regex
 * mode a compile error is reported as `invalid` rather than thrown: the caller
 * decides how to show it (the list empties, the search bar turns red).
 */
export const compileCardSearch = (query: string | undefined, regexMode: boolean): CardSearch => {
    if (query == null || query === '') {
        return { invalid: false };
    }

    try {
        return {
            reg: new RegExp(regexMode ? query : escapeRegExp(query), 'gimsu'),
            invalid: false,
        };
    } catch (e) {
        return { invalid: true };
    }
};

export const HIGHLIGHT_CLASS = 'search-highlight';

/**
 * Wrap every match in `<span class="search-highlight">` for the markdown
 * renderer.
 *
 * `matchAll` is used on purpose: `RegExp.prototype.exec` in a hand-written
 * loop does not advance `lastIndex` after a zero-length match, so a query like
 * "^" (or "a*") spins forever and freezes the window. The spec's matchAll
 * advances by a full code point, and the empty matches are skipped anyway --
 * an empty span highlights nothing.
 *
 * Returns the original string (same reference) when nothing matched, so the
 * caller's markdown memo does not re-parse an unchanged body.
 */
export const highlightMatches = (
    content: string,
    query: string | undefined,
    regexMode: boolean
): string => {
    const { reg } = compileCardSearch(query, regexMode);
    if (!reg) {
        return content;
    }

    let highlighted = '';
    let lastEnd = 0;
    let found = false;
    for (const matched of content.matchAll(reg)) {
        if (matched[0] === '') {
            continue;
        }

        highlighted += content.slice(lastEnd, matched.index);
        highlighted += `<span class="${HIGHLIGHT_CLASS}">${matched[0]}</span>`;
        lastEnd = matched.index + matched[0].length;
        found = true;
    }

    return found ? highlighted + content.slice(lastEnd) : content;
};
