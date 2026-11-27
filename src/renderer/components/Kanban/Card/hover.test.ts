import {
    isElementUnderPointer,
    isPointerInside,
    isPostDropCheck,
    POST_DROP_CHECK_MS,
} from './hover';

describe('isPointerInside', () => {
    const rect = { left: 10, top: 20, right: 110, bottom: 140 };

    it('accepts a point inside the card', () => {
        expect(isPointerInside(rect, 50, 60)).toBe(true);
    });

    it('rejects a point beyond either axis', () => {
        expect([isPointerInside(rect, 9, 60), isPointerInside(rect, 50, 141)]).toEqual([
            false,
            false,
        ]);
    });

    it('counts the edges as inside', () => {
        expect([isPointerInside(rect, 10, 20), isPointerInside(rect, 110, 140)]).toEqual([
            true,
            true,
        ]);
    });
});

describe('isElementUnderPointer', () => {
    const card = document.createElement('div');
    const child = document.createElement('span');
    card.appendChild(child);
    const other = document.createElement('div');

    it('accepts the card itself', () => {
        expect(isElementUnderPointer(card, [other, card])).toBe(true);
    });

    it('accepts a descendant (the pointer sits on the body text)', () => {
        expect(isElementUnderPointer(card, [child])).toBe(true);
    });

    it('rejects a stack without the card', () => {
        expect(isElementUnderPointer(card, [other])).toBe(false);
    });
});

describe('isPostDropCheck', () => {
    it('runs inside the window, including its edge', () => {
        expect([
            isPostDropCheck(1000, 1000),
            isPostDropCheck(1000 + POST_DROP_CHECK_MS, 1000),
        ]).toEqual([true, true]);
    });

    it('skips once the window has passed', () => {
        expect(isPostDropCheck(1001 + POST_DROP_CHECK_MS, 1000)).toBe(false);
    });

    it('skips when no drop was recorded', () => {
        expect(isPostDropCheck(performance.now(), 0)).toBe(false);
    });
});
