/**
 * Shared mount point for every antd overlay (dialogs, toasts, notifications).
 *
 * antd portals those to `<body>` by default, which sits outside the window's
 * content layer and therefore outside its opacity: the page would fade while
 * its own dialog stayed fully opaque. `Application.tsx` renders this container
 * inside the content layer so an overlay fades together with the page.
 *
 * A DOM id gives the ConfigProvider, Ant Design App feedback APIs, and
 * imperative modal calls one shared resolver without requiring the container
 * to exist when those providers are created.
 */
export const POPUP_CONTAINER_ID = 'pl-popup-container';

/**
 * Resolves the mount point above.
 *
 * The lookup happens at call time, not at module load: the container only
 * exists once `Application` has rendered. `<body>` is the fallback for the
 * overlays requested before that first paint.
 */
export function getPopupContainer(): HTMLElement {
    return document.getElementById(POPUP_CONTAINER_ID) || document.body;
}

/**
 * Mount point of the session-ending mask.
 *
 * The mask has to cover the window no matter which page is on screen: while it
 * is up the finished session is waiting for its confirmation, and the pages
 * must not be switched away from it (see `TimerState.sessionEnding`). It used
 * to live inside the Timer page, which meant it could only be seen after
 * forcing the window back to that page -- that page switch is what interrupted
 * an open board or card editor and a drag in progress.
 *
 * A container of its own (rather than the popup layer) keeps the mask above
 * every dialog: antd appends its modal roots to the popup layer in the order
 * they open, so a dialog opened after the mask would otherwise paint over it.
 */
export const SESSION_MASK_LAYER_ID = 'pl-session-mask-layer';

/** Resolves the mask layer; `<body>` covers a render before `Application` did. */
export function getSessionMaskContainer(): HTMLElement {
    return document.getElementById(SESSION_MASK_LAYER_ID) || document.body;
}

/**
 * Is a modal dialog actually open right now?
 *
 * "Open" cannot mean "a `.ant-modal-root` exists": antd 3 keeps a closed
 * dialog in the DOM (rc-dialog only sets `display: none` on the wrap in its
 * close-animation callback -- Dialog.js `onAnimateLeave` -- and the
 * CardEditor's outer Modal does not pass `destroyOnClose`), so one open/close
 * cycle leaves a root behind forever and any existence check would keep
 * claiming the screen. That is exactly how the Timer's bare Tab binding went
 * dead after closing the card editor: the gate saw the leftover root and
 * stood down until a mini-window roundtrip unmounted `<CardInDetail/>` and
 * took the leftover with it.
 *
 * So this walks every root and looks at what is actually rendered:
 *
 * - the root itself is `display: none` while Application hides the modals in
 *   mini mode (see Application.tsx) -- invisible, therefore not open;
 * - a closed dialog is marked by `display: none` on its `.ant-modal-wrap`
 *   (and cleared again when the dialog opens);
 * - a root without a wrap is half-rendered; for a "does this own the screen"
 *   question the conservative answer is "open".
 *
 * The close animation is not a problem: for ~300ms after closing, the wrap is
 * not yet marked `display: none`, so this still reports open -- the dialog is
 * leaving the screen then anyway.
 */
export function isModalOpen(): boolean {
    return Array.from(document.querySelectorAll<HTMLElement>('.ant-modal-root')).some((root) => {
        if (getComputedStyle(root).display === 'none') {
            return false;
        }

        const wrap = root.querySelector<HTMLElement>('.ant-modal-wrap');
        return wrap ? getComputedStyle(wrap).display !== 'none' : true;
    });
}
