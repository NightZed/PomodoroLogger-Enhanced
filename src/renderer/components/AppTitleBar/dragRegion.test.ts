/**
 * Which presses on the maximized title bar start a window drag.
 *
 * Tested against real DOM elements (jest runs in jsdom) rather than through a
 * rendered antd tab bar: the decision is about the bar's element structure, and
 * `react-test-renderer` (which the title bar tests otherwise use) has no DOM to
 * walk with `closest`.
 */
import { isDragSurface } from './dragRegion';

/** The title bar as antd 3 renders it, trimmed to the parts that matter. */
const buildBar = () => {
    document.body.innerHTML = `
        <div class="ant-tabs">
            <div class="ant-tabs-bar">
                <div class="ant-tabs-nav-container">
                    <div class="ant-tabs-nav-wrap">
                        <div class="ant-tabs-nav-scroll">
                            <div class="ant-tabs-nav">
                                <div class="ant-tabs-tab"><span><i class="anticon"></i></span></div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="ant-tabs-extra-content"><button type="button">pin</button></div>
                <div class="ant-tabs-ink-bar"></div>
            </div>
            <div class="ant-tabs-content">
                <div class="ant-tabs-tabpane">timer page</div>
            </div>
        </div>
    `;
};

const element = (selector: string) => document.querySelector(selector);

describe('isDragSurface', () => {
    beforeEach(buildBar);

    it('accepts the empty parts of the tab bar', () => {
        // The container, the scroll wrapper and the ink bar are all painted by
        // rc-tabs and carry no action of their own.
        ['ant-tabs-bar', 'ant-tabs-nav-scroll', 'ant-tabs-ink-bar'].forEach((className) => {
            expect(isDragSurface(element(`.${className}`))).toBe(true);
        });
    });

    it('rejects the page entries and the extra content', () => {
        // They are `no-drag` in the normal bar as well: a press on a tab must
        // switch the page, and the caption buttons must stay clickable.
        ['ant-tabs-tab', 'anticon', 'ant-tabs-extra-content'].forEach((className) => {
            expect(isDragSurface(element(`.${className}`))).toBe(false);
        });
        expect(isDragSurface(element('.ant-tabs-extra-content button'))).toBe(false);
    });

    it('rejects everything outside the bar', () => {
        // The page below the bar is not part of the title bar, and neither is a
        // missing target (the press that ends outside the window).
        expect(isDragSurface(element('.ant-tabs-content'))).toBe(false);
        expect(isDragSurface(element('.ant-tabs-tabpane'))).toBe(false);
        expect(isDragSurface(element('.ant-tabs'))).toBe(false);
        expect(isDragSurface(null)).toBe(false);
    });
});
