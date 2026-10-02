/**
 * Geometry of the tab bar that doubles as the window title bar.
 *
 * The height lives here instead of inside `AppTitleBar.tsx` because the window
 * background layer paints its elevated band to exactly this height (see
 * `Application.tsx`): the band replaces the surface the tab bar used to paint
 * itself, so the two have to agree. A second hard-coded copy of the number
 * would eventually drift out of sync and shift the band off the tab bar.
 *
 * Mini mode has no tab bar at all (it is `display: none` there), so its height
 * is 0 and is not listed here.
 */
export const TITLE_BAR_HEIGHT = 36;

/** Height of the same bar in compact (small window) mode. */
export const COMPACT_TITLE_BAR_HEIGHT = 32;

/**
 * Height of the elevated band the window background layer paints behind the tab
 * bar, as a CSS length.
 *
 * Mini mode hides the bar, so the band collapses to nothing and the whole
 * window becomes page surface (the strip would otherwise get an elevated top
 * edge that belongs to no visible element). Exported rather than inlined in
 * `Application.tsx` so the mapping is unit tested: a wrong value here shifts the
 * band off the bar without breaking anything loudly.
 */
export function titleBarBandHeight(mode: { minimize: boolean; compact: boolean }): string {
    if (mode.minimize) {
        return '0px';
    }

    return `${mode.compact ? COMPACT_TITLE_BAR_HEIGHT : TITLE_BAR_HEIGHT}px`;
}
