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
    return html.replace(/([^&\*#@a-z]|^)(#[^\s\\<>]+)(\s|$|<)/gi, (_, p1, p2, p3) => {
        const { background, color } = stringColorMap(p2);
        registerTag && registerTag(p2);
        return `${p1}<span class="pl-tag" style="background:${background}; color:${color}; --hover-background: ${
            background.slice(0, 7) + '55'
        }">${p2}</span>${p3}`;
    });
}

export const formatMarkdown = (markdown: string, context: MarkdownContext = defaultContext) => {
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

    return parseTag(html, context);
};

export default formatMarkdown;
