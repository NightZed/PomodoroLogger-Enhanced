/**
 * Shared mount point for every antd overlay (dialogs, toasts, notifications).
 *
 * antd portals those to `<body>` by default, which sits outside the window's
 * content layer and therefore outside its opacity: the page would fade while
 * its own dialog stayed fully opaque. `Application.tsx` renders this container
 * inside the content layer so an overlay fades together with the page.
 *
 * A DOM id is used instead of a React context because the feedback layer is a
 * module of imperative calls (`message.open`, `notification.open`,
 * `Modal.confirm`, ...) that run outside of the React tree and cannot receive
 * the node as a prop.
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
