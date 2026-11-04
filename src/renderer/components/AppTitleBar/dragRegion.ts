/**
 * Which presses on the title bar start a window drag.
 *
 * A press reaches the renderer in two cases:
 *
 * - the window is maximized, where the bar is `-webkit-app-region: no-drag`
 *   (see `AppTitleBar`), and
 * - Chromium has clipped the native drag region after a scroller was scrolled.
 *   The cut segment is client area, so the press arrives here instead of
 *   starting the OS move.
 *
 * In both cases the press has to be told apart from the tab clicks that share
 * the same row. `isDragSurface` is that decision, kept out of the component so
 * it can be unit tested against real DOM elements (see the jsdom test next to
 * it) instead of through a rendered antd tab bar.
 *
 * The bar itself is the drag region; the entries inside it are not:
 * `.ant-tabs-tab` (the page entries, also arrow-key navigable),
 * `.ant-tabs-nav-more` (the overflow dropdown) and `.ant-tabs-extra-content`
 * (the caption buttons and the always-on-top pin) are all `no-drag` in the
 * normal bar for the same reason, and a press there must keep going to them.
 * Everything outside `.ant-tabs-nav` (page content, the ending mask, dialogs)
 * is not a drag surface either.
 */
const NO_DRAG_SELECTOR = '.ant-tabs-tab, .ant-tabs-nav-more, .ant-tabs-extra-content, button';

export function isDragSurface(target: Element | null): boolean {
    if (!target) {
        return false;
    }

    if (target.closest(NO_DRAG_SELECTOR)) {
        return false;
    }

    return target.closest('.ant-tabs-nav') !== null;
}
