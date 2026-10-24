import { parseTag, formatMarkdown, extractTags } from './formatMarkdown';

describe('Markdown tag', () => {
    const style = 'style="background:#98989869; color:#222; --hover-background: #98989855"';
    it('hello #world', () => {
        expect(parseTag(`hello #world`).trim()).toEqual(
            `hello <span class="pl-tag" ${style}>#world</span>`
        );
        expect(parseTag(`hello #world `).trim()).toEqual(
            `hello <span class="pl-tag" ${style}>#world</span>`
        );
    });

    it('#world', () => {
        expect(parseTag(`#world`).trim()).toEqual(`<span class="pl-tag" ${style}>#world</span>`);
    });

    it('tags both of two adjacent tags, `#alpha #beta`', () => {
        // Regression: the trailing boundary used to be consumed, so the first
        // match ate the space between the tags and '#beta' never matched.
        expect(parseTag(`#alpha #beta`)).toEqual(
            `<span class="pl-tag" ${style}>#alpha</span> ` +
                `<span class="pl-tag" ${style}>#beta</span>`
        );
        expect(extractTags('#alpha #beta')).toEqual(['#alpha', '#beta']);
    });

    it("'hello'", () => {
        // DOMPurify normalizes the text entities marked produces.
        expect(formatMarkdown("'hello'").trim()).toEqual("<p>'hello'</p>");
    });

    it('italic', () => {
        expect(formatMarkdown('*hello*').trim()).toEqual('<p><em>hello</em></p>');
    });

    it('keeps GFM breaks enabled', () => {
        expect(formatMarkdown('first line\nsecond line').trim()).toEqual(
            '<p>first line<br>second line</p>'
        );
    });

    it('marks links to open in a new window', () => {
        expect(formatMarkdown('[docs](https://example.com)').trim()).toContain(
            '<a target="_blank" href="https://example.com">docs</a>'
        );
    });
});

describe('task checkbox', () => {
    it('keeps plain [ ] clickable', () => {
        const html = formatMarkdown('[ ] todo');
        expect(html).toContain('<input type="checkbox">');
        expect(html).not.toContain('disabled');
    });

    it('renders - [ ] as a clickable checkbox (no disabled)', () => {
        const html = formatMarkdown('- [ ] todo');
        const input = (html.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? [])[0];
        expect(input).toBeDefined();
        expect(input).not.toContain('disabled');
        expect(input).not.toContain('checked');
    });

    it('renders - [x] as a checked clickable checkbox', () => {
        const html = formatMarkdown('- [x] done');
        const input = (html.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? [])[0];
        expect(input).toBeDefined();
        expect(input).not.toContain('disabled');
        expect(input).toContain('checked');
    });

    it('keeps checkbox order aligned with the markdown source', () => {
        const html = formatMarkdown('- [ ] a\n[ ] b\n- [x] c');
        const inputs = html.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? [];
        expect(inputs).toHaveLength(3);
        // the Nth rendered checkbox must correspond to the Nth `[ ]`/`[x]`
        // match in the source: Card.tsx toggles the Nth occurrence
        expect(inputs.map((input) => input.includes('checked'))).toEqual([false, false, true]);
        for (const box of inputs) {
            expect(box).not.toContain('disabled');
        }
    });
});

describe('markdown sanitization', () => {
    it('drops scripts and inline event handlers', () => {
        const html = formatMarkdown(
            '<script>window.evil = true</script>\n\n<img src="x" onerror="window.evil = true">'
        );
        expect(html).not.toContain('<script');
        expect(html).not.toContain('onerror');
        expect(html).not.toContain('window.evil');
    });

    it('drops dangerous link protocols and embedded styles', () => {
        const html = formatMarkdown(
            '[click](javascript:alert(1))\n\n<style>body { display: none }</style>'
        );
        expect(html).not.toContain('javascript:');
        expect(html).not.toContain('<style');
    });

    it('keeps the generated tag markup intact', () => {
        const html = formatMarkdown('deploy #prod');
        expect(html).toContain('<span class="pl-tag"');
        expect(html).toContain('--hover-background');
    });
});

describe('extractTags', () => {
    it('extracts the tags formatMarkdown renders, deduplicated in order', () => {
        expect(extractTags('hello #world and #world again #foo')).toEqual(['#world', '#foo']);
    });

    it('returns nothing for tag-free content', () => {
        expect(extractTags('plain **text**')).toEqual([]);
        expect(extractTags('')).toEqual([]);
    });

    it('does not treat a markdown heading as a tag', () => {
        // `# heading` (with a space) renders as <h1>: the # never reaches
        // parseTag, and extractTags runs the same pipeline.
        expect(extractTags('# heading\nbody text')).toEqual([]);
    });

    it('matches what the card view renders', () => {
        const html = formatMarkdown('deploy #prod now');
        expect(html).toContain('<span class="pl-tag"');
        expect(extractTags('deploy #prod now')).toEqual(['#prod']);
    });
});
