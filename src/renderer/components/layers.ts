/**
 * App-level stacking order, behind to front.
 *
 * z-index only compares inside one stacking context, so this file owns only the
 * full-window layers that share the `Content` context. Page-level values (the
 * Timer's 50 / 999, a list header's 1, ...) belong to the stack their component
 * creates and must not be collected here: putting them in the same table would
 * suggest an order they do not participate in.
 *
 * `modal`, `popup` and `notice` are mirrors of antd's seed tokens
 * (`zIndexPopupBase` plus the offsets antd's own styles add), not values we
 * choose. They are recorded so the layers around them are picked against
 * evidence; `layers.test.ts` is what notices when antd moves them.
 *
 * The mask's placement is explained further in `docs/architecture/session.md`;
 * the popup container itself is in `popupLayer.ts`.
 */
export const LAYER = {
    /** antd Modal: the wrap and its backdrop. */
    modal: 1000,
    /**
     * antd popups, at their lowest: Select menus and Dropdown use
     * `zIndexPopupBase + 50`. Tooltips use `+ 70`, i.e. 1070; that difference
     * only matters for `noticeTooltip` below.
     */
    popup: 1050,
    /**
     * antd Tooltip (`zIndexPopupBase + 70`). Recorded because the session mask
     * sits above it; hints inside that mask use `sessionMaskTooltip`.
     */
    tooltip: 1070,
    /**
     * Full-window chart (PomodoroSankey). Level with `popup` on purpose: it is
     * opened from inside a dialog and has to stay above that dialog, while a
     * select menu opened on top of it is ordered by mount order like anywhere
     * else.
     */
    fullscreenView: 1050,
    /** Session-ending mask: above every page and antd dialog. */
    sessionMask: 1100,
    /**
     * Hints inside the session-ending mask. antd puts tooltips at 1070, which
     * is below the mask, so the call sites there lift theirs explicitly.
     */
    sessionMaskTooltip: 1110,
    /**
     * A dialog opened from the mask. Equal to `sessionMask` on purpose: the
     * later mount wins. Raise both together, never just this one.
     */
    picker: 1100,
    /** User guide: dimmed backdrop and its exit button. */
    guide: 2000,
    /** The guide's copy card. */
    guideDialog: 2001,
    /** The hole the guide highlights; above the dimming so the target shows. */
    guideHole: 2002,
    /** The guide's pointing arrow: the topmost guide element. */
    guidePointer: 2003,
    /** antd notification. */
    notice: 2050,
    /**
     * Tooltip inside a notification card. antd puts tooltips at `popup`, which
     * is below a notification, so the notice actions lift theirs individually.
     */
    noticeTooltip: 2060,
} as const;
