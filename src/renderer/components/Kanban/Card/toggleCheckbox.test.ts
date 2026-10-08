import { formatMarkdown } from './formatMarkdown';
import { getCheckboxIndex, toggleNthCheckbox } from './toggleCheckbox';

describe('getCheckboxIndex', () => {
    it('maps a clicked box to its document-order index', () => {
        const container = document.createElement('div');
        container.innerHTML =
            '<ul><li><input type="checkbox">a</li><li>b</li><li><input type="checkbox">c</li></ul>';
        const boxes = container.querySelectorAll('[type="checkbox"]');
        expect(getCheckboxIndex(container, boxes[0] as HTMLElement)).toBe(0);
        expect(getCheckboxIndex(container, boxes[1] as HTMLElement)).toBe(1);
    });

    it('returns -1 for an element outside the container', () => {
        const container = document.createElement('div');
        container.innerHTML = '<input type="checkbox">';
        const outside = document.createElement('input');
        expect(getCheckboxIndex(container, outside)).toBe(-1);
    });
});

describe('toggleNthCheckbox', () => {
    it('flips [ ] to [x]', () => {
        expect(toggleNthCheckbox('- [ ] todo', 0)).toBe('- [x] todo');
    });

    it('flips [x] to [ ]', () => {
        expect(toggleNthCheckbox('- [x] done', 0)).toBe('- [ ] done');
    });

    it('only flips the nth occurrence', () => {
        expect(toggleNthCheckbox('[ ] a\n[ ] b\n[x] c', 1)).toBe('[ ] a\n[x] b\n[x] c');
        expect(toggleNthCheckbox('[ ] a\n[ ] b\n[x] c', 2)).toBe('[ ] a\n[ ] b\n[ ] c');
    });

    it('returns undefined for a negative or out-of-range index', () => {
        expect(toggleNthCheckbox('[ ] a', -1)).toBeUndefined();
        expect(toggleNthCheckbox('[ ] a', 1)).toBeUndefined();
        expect(toggleNthCheckbox('no checkbox here', 0)).toBeUndefined();
    });

    it('round-trips with the rendered checkbox order', () => {
        const source = '- [ ] a\n[ ] b\n- [x] c';
        // the 2nd rendered checkbox corresponds to the 2nd source occurrence
        const toggled = toggleNthCheckbox(source, 1) as string;
        const inputs = formatMarkdown(toggled).match(/<input[^>]*type="checkbox"[^>]*>/g) ?? [];
        expect(inputs.map((input) => input.includes('checked'))).toEqual([false, true, true]);
    });
});
