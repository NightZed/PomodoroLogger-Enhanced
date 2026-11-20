import type { tabType } from './Timer/action';
import type { WindowMode } from '../../shared/windowMode';

/**
 * How the window is presented, as far as page unloading is concerned.
 *
 * The type lives in `shared/windowMode.ts` because the main process needs the
 * same four values to decide what a dialog may change. The precedence rules
 * are documented there.
 */
export type { WindowMode };

/** Every page that can be unloaded. The Timer page never is; see below. */
export type PageKey = Exclude<tabType, 'timer'>;

/**
 * How long a page stays mounted after the user leaves it, per page.
 *
 * A page is not torn down the moment it goes inactive: leaving and coming back
 * is a routine hop, and the wrapper's grace period absorbs it. What sets the
 * length is the cost of a remount, which differs a lot per page:
 *
 * - `kanban` remounts with one `fetchBoards` (a handful of rows out of the local
 *   SQLite file) plus a fresh batched card render, so a short grace covers the
 *   "check the board, go back to the timer, check again" hop.
 * - `setting` loses more: an import, an export or a version check may still be
 *   in flight with its progress in component state. It is the least visited page
 *   anyway, hence the middling delay.
 * - `history` re-runs the whole `aggHistory` aggregation in the main-process
 *   child on every mount. That is the expensive one, so it keeps the long grace
 *   and flipping between the timer and the charts stays instant.
 */
export const TAB_UNLOAD_DELAY = {
    kanban: 120_000,
    setting: 300_000,
    history: 600_000,
} as const;

/**
 * The grace used while the pages cannot be reached at all: the window is in the
 * tray, or it is the 90px mini strip with the tab bar hidden.
 *
 * Not zero on purpose. The tray can be entered by a mis-clicked close, and the
 * mini strip is routinely toggled for a quick look at something else; either
 * way the user expects the page they left to still be there. Half a minute
 * absorbs both, while a window left in the tray (or left as a mini strip all
 * afternoon) gives the memory back.
 */
export const SHORT_UNLOAD_DELAY = 30_000;

/**
 * Collapses the store's window flags into the one mode the pages care about.
 *
 * Kept separate from `planPageUnload` so the precedence can be tested without
 * walking the whole table, and so callers never re-derive it by hand: `tray`
 * must beat `mini`, or closing the mini strip would be treated as "still on
 * screen".
 */
export function deriveWindowMode(flags: {
    inTray: boolean;
    minimize: boolean;
    compact: boolean;
}): WindowMode {
    if (flags.inTray) {
        return 'tray';
    }

    if (flags.minimize) {
        return 'mini';
    }

    if (flags.compact) {
        return 'compact';
    }

    return 'normal';
}

export interface PageUnloadPlan {
    /** Whether the page's subtree should be rendered right now. */
    mounted: boolean;
    /** How long it may stay mounted after `mounted` goes false. */
    graceMs: number;
}

/**
 * What happens to one page in one mode.
 *
 * The two reachable modes (`normal`, `compact`) behave identically: the window
 * is on screen and the user can switch pages, so the per-page grace applies and
 * only the active page is mounted. Compacting must NOT shorten anything -- the
 * user is still working in that window, and re-reading the board on every hop
 * to the timer is a visible regression, not a memory win.
 *
 * The two unreachable modes (`mini`, `tray`) drop every non-timer page after
 * the short grace. They differ only in who asked: the tray delay follows the
 * `unloadOnCloseToTray` setting (the setting names the tray), while the mini
 * strip doesn't -- its tab bar is `display: none`, so the other pages cannot be
 * reached at all and keeping them buys nothing. See the design note for why the
 * setting is not extended to cover it.
 *
 * The Timer page is deliberately absent from this table: it owns the running
 * session, the interval that ends it and the tray menu, so it stays mounted in
 * every mode (`APP_TABS` `forceRender`).
 */
export function planPageUnload(
    page: PageKey,
    mode: WindowMode,
    options: { currentTab: string; unloadOnCloseToTray: boolean }
): PageUnloadPlan {
    const reachable = mode === 'normal' || mode === 'compact';
    const mounted = reachable && options.currentTab === page;

    let graceMs: number = TAB_UNLOAD_DELAY[page];
    if (mode === 'mini') {
        graceMs = SHORT_UNLOAD_DELAY;
    } else if (mode === 'tray' && options.unloadOnCloseToTray) {
        graceMs = SHORT_UNLOAD_DELAY;
    }

    return { mounted, graceMs };
}
