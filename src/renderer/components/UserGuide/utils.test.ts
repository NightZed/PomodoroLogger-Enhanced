/**
 * Tour targets are looked up by CSS selector, but the selector can match more
 * than one mounted view. The Timer page stays mounted (`APP_TABS.forceRender`)
 * and its sider renders the focused list, so the first DOM match of a board
 * selector may be a hidden TabPane copy (0x0) or the sider shifted off-screen
 * by a negative margin. These tests pin the "first visible match" rule that
 * keeps the pointer/spotlight (and the dialog's click-through) on the real
 * element.
 */
import { findVisibleTarget, getTargetRectBySelector } from './utils';

const rect = (left: number, top: number, width: number, height: number): DOMRect =>
    ({
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        x: left,
        y: top,
        toJSON: () => undefined,
    }) as DOMRect;

const target = (className: string, box: DOMRect): HTMLElement => {
    const el = document.createElement('div');
    el.className = className;
    el.getBoundingClientRect = () => box;
    document.body.appendChild(el);
    return el;
};

describe('tour target visibility', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('skips a hidden first match and picks the visible one', () => {
        target('tour', rect(0, 0, 0, 0));
        const visible = target('tour', rect(10, 20, 100, 50));

        expect(findVisibleTarget('.tour')).toBe(visible);
        expect(getTargetRectBySelector('.tour')).toEqual({
            x: 10,
            y: 20,
            w: 100,
            h: 50,
        });
    });

    it('skips an off-screen first match (the sider shifted left)', () => {
        target('tour', rect(-300, 10, 300, 500));
        const visible = target('tour', rect(20, 30, 200, 100));

        expect(findVisibleTarget('.tour')).toBe(visible);
        expect(getTargetRectBySelector('.tour')).toEqual({
            x: 20,
            y: 30,
            w: 200,
            h: 100,
        });
    });

    it('returns null when no match is visible', () => {
        target('tour', rect(0, 0, 0, 0));
        target('tour', rect(-500, 10, 100, 100));

        expect(findVisibleTarget('.tour')).toBeNull();
        expect(getTargetRectBySelector('.tour')).toBeNull();
    });

    it('unions the visible children of the first visible target', () => {
        const hidden = target('tour', rect(0, 0, 0, 0));
        hidden.appendChild(document.createElement('span'));

        const visible = target('tour', rect(10, 10, 40, 80));
        const first = document.createElement('span');
        first.getBoundingClientRect = () => rect(10, 10, 20, 20);
        const second = document.createElement('span');
        second.getBoundingClientRect = () => rect(10, 40, 20, 20);
        const empty = document.createElement('span');
        empty.getBoundingClientRect = () => rect(0, 0, 0, 0);
        visible.append(first, second, empty);

        expect(getTargetRectBySelector('.tour', true)).toEqual({
            x: 10,
            y: 10,
            w: 20,
            h: 50,
        });
    });
});
