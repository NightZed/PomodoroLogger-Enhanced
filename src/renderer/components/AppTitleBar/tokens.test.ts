import { COMPACT_TITLE_BAR_HEIGHT, TITLE_BAR_HEIGHT, titleBarBandHeight } from './tokens';

describe('window title bar geometry', () => {
    it('sizes the painted band exactly like the visible tab bar', () => {
        expect(titleBarBandHeight({ minimize: false, compact: false })).toBe(
            `${TITLE_BAR_HEIGHT}px`
        );
        expect(titleBarBandHeight({ minimize: false, compact: true })).toBe(
            `${COMPACT_TITLE_BAR_HEIGHT}px`
        );
    });

    it('leaves no band at all while minimized, where the bar is hidden', () => {
        // Regression: a non-zero band here would paint an elevated top edge of
        // the 90px strip that belongs to no visible element.
        expect(titleBarBandHeight({ minimize: true, compact: false })).toBe('0px');
        expect(titleBarBandHeight({ minimize: true, compact: true })).toBe('0px');
    });

    it('keeps the compact bar shorter than the normal one', () => {
        expect(COMPACT_TITLE_BAR_HEIGHT).toBeLessThan(TITLE_BAR_HEIGHT);
    });
});
