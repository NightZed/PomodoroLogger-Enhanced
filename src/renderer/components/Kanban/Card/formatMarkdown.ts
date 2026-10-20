import { marked } from 'marked';

export interface MarkdownContext {
    stringColorMap?: (name: string) => { background: string; color: string };
    registerTag?: (name: string) => void;
}

const defaultContext = {
    stringColorMap: () => ({
        background: '#98989869',
        color: '#222',
    }),
};

export function parseTag(
    html: string,
    {
        stringColorMap = defaultContext.stringColorMap,
        registerTag,
    }: MarkdownContext = defaultContext
) {
    // The trailing boundary is a ZERO-WIDTH lookahead on purpose. The old
    // pattern consumed it as a captured group (`(\s|$|<)`) and re-emitted it
    // in the replacement -- which ate the separator between two adjacent
    // tags: in `#a #b` the first match swallowed the space, leaving no
    // character for the leading context `([^&\*#@a-z]|^)` of `#b`, so only
    // '#a' was ever tagged (and only '#a' ever reached the search
    // suggestions). A lookahead asserts the same boundaries without
    // consuming them, so every tag gets its own chance to match.
    return html.replace(/([^&*@a-z]|^)(#[^\s\\<>]+)(?=\s|$|<)/gi, (_, p1, p2) => {
        const { background, color } = stringColorMap(p2);
        if (registerTag) {
            registerTag(p2);
        }
        return `${p1}<span class="pl-tag" style="background:${background}; color:${color}; --hover-background: ${
            background.slice(0, 7) + '55'
        }">${p2}</span>`;
    });
}

/**
 * Rendering a board mounts one `Card` per card, and every card parses its
 * markdown (`marked` + the tag/checkbox passes) during that commit. Revisiting
 * a board or a card re-parsed the same strings again. The default-context
 * result is a pure function of the markdown, so cache it; custom contexts
 * (extractTags registers tags as a side effect) bypass the cache.
 */
const MARKDOWN_CACHE_LIMIT = 512;
const markdownHtmlCache = new Map<string, string>();

export const formatMarkdown = (markdown: string, context: MarkdownContext = defaultContext) => {
    const cacheable = context === defaultContext;
    if (cacheable) {
        const cached = markdownHtmlCache.get(markdown);
        if (cached !== undefined) {
            return cached;
        }
    }

    let i = 0;
    const html = marked(markdown, { gfm: true, breaks: true })
        .replace(/<a/g, '<a target="_blank"')
        .replace(/\[(\s|x)\]/g, (match) => {
            let newString;
            if (match === '[ ]') {
                newString = `<input id=${i} onclick="return false" type="checkbox">`;
            } else {
                newString = `<input id=${i} checked onclick="return false" type="checkbox">`;
            }
            i += 1;
            return newString;
        })
        // GFM task list items (`- [ ] ...`) are rendered by marked itself as
        // `<input ... disabled="" ... type="checkbox">`. The `disabled`
        // attribute swallows click events (disabled elements never dispatch
        // clicks), so those checkboxes could not be toggled from the card
        // view while the plain `[ ]` boxes generated above stayed clickable.
        // Re-mark them with the same clickable markup (keeping their checked
        // state) so the card-level click handler can flip the source
        // markdown for both styles.
        .replace(
            /<input([^>]*)type="checkbox"([^>]*)>/g,
            (match, before: string, after: string) => {
                const attrs = `${before}${after}`;
                if (!attrs.includes('disabled')) {
                    // already the clickable markup generated above
                    return match;
                }

                const checked = /\bchecked\b/.test(attrs);
                return `<input${checked ? ' checked' : ''} onclick="return false" type="checkbox">`;
            }
        );

    const result = parseTag(html, context);
    if (cacheable) {
        if (markdownHtmlCache.size >= MARKDOWN_CACHE_LIMIT) {
            const oldest = markdownHtmlCache.keys().next().value;
            if (oldest !== undefined) {
                markdownHtmlCache.delete(oldest);
            }
        }
        markdownHtmlCache.set(markdown, result);
    }

    return result;
};

const contentTagCache = new Map<string, string[]>();
// The search panel re-extracts on every render while it is open (once per
// debounced keystroke); parsing every card's markdown again each time would
// jank large boards. The result is a pure function of the content string, so
// cache it. The cap bounds memory -- a full clear simply re-parses on the
// next call.
const CONTENT_TAG_CACHE_LIMIT = 2048;

/**
 * Every content tag of `markdown`, exactly as `formatMarkdown` would render
 * it (same marked pipeline + parseTag regex), deduplicated in order of
 * appearance.
 *
 * Tags are extracted on demand from the card's current content instead of
 * being accumulated in a registry at render time: the search suggestions
 * then always match the store -- deleting the `#` of a tag (or the card
 * itself) drops the suggestion immediately, with no side effect to keep in
 * sync and nothing left stale until an app restart.
 */
export const extractTags = (markdown: string): string[] => {
    const cached = contentTagCache.get(markdown);
    if (cached) {
        return cached;
    }

    const tags: string[] = [];
    formatMarkdown(markdown, {
        registerTag: (tag) => {
            if (!tags.includes(tag)) {
                tags.push(tag);
            }
        },
    });
    if (contentTagCache.size >= CONTENT_TAG_CACHE_LIMIT) {
        contentTagCache.clear();
    }
    contentTagCache.set(markdown, tags);
    return tags;
};

export default formatMarkdown;
