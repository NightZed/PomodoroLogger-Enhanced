import { parseTag, formatMarkdown } from './formatMarkdown';

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

    it("'hello'", () => {
        expect(formatMarkdown("'hello'").trim()).toEqual('<p>&#39;hello&#39;</p>');
    });

    it('italic', () => {
        expect(formatMarkdown('*hello*').trim()).toEqual('<p><em>hello</em></p>');
    });
});

describe('task checkbox', () => {
    it('keeps plain [ ] clickable', () => {
        const html = formatMarkdown('[ ] todo');
        expect(html).toContain('<input id=0 onclick="return false" type="checkbox">');
        expect(html).not.toContain('disabled');
    });

    it('renders - [ ] as a clickable checkbox (no disabled)', () => {
        const html = formatMarkdown('- [ ] todo');
        const input = (html.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? [])[0];
        expect(input).toBeDefined();
        expect(input).not.toContain('disabled');
        expect(input).not.toContain('checked');
        expect(input).toContain('onclick="return false"');
    });

    it('renders - [x] as a checked clickable checkbox', () => {
        const html = formatMarkdown('- [x] done');
        const input = (html.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? [])[0];
        expect(input).toBeDefined();
        expect(input).not.toContain('disabled');
        expect(input).toContain('checked');
        expect(input).toContain('onclick="return false"');
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
            expect(box).toContain('onclick="return false"');
        }
    });
});
