import { BrowserWindow, Point, Rectangle, screen } from 'electron';

/*
 * Window move of a title bar drag on a *maximized* window.
 *
 * The native drag region (`-webkit-app-region: drag`) cannot handle that
 * gesture here. On Windows a transparent window is never a real maximized
 * window: Electron emulates the state by resizing to the display work area (see
 * `NativeWindowViews::Maximize`), and it swallows the system's maximize command
 * for such windows. Windows' own "dragging a maximized window restores it and
 * carries it along" move therefore never runs -- the window is just carried
 * away at full size. `AppTitleBar` hands the press over to the renderer while
 * the window is maximized and reports the two ends of the gesture; this module
 * reproduces the native move: restore first (Electron's `unmaximize()` puts the
 * pre-maximize bounds back), then follow the cursor until the gesture ends.
 */

/**
 * Where the restored window has to be placed so the point of the maximized
 * window the user grabbed stays under the cursor.
 *
 * The cursor's relative position inside the maximized window (0..1, per axis)
 * is mapped onto the restored one, which is how the window appears to shrink
 * out of the cursor instead of jumping away from it. Kept pure (no Electron
 * calls) so the mapping is unit tested; a wrong one is only visible as the
 * window sliding out from under the cursor.
 */
export function restorePositionForCursor(
    cursor: Point,
    maximized: Pick<Rectangle, 'x' | 'y' | 'width' | 'height'>,
    restored: Pick<Rectangle, 'width' | 'height'>
): Point {
    // A zero sized window cannot say where the cursor is inside it; the middle
    // keeps the restored window centered on the cursor instead of dividing by 0.
    const relativeX = maximized.width > 0 ? (cursor.x - maximized.x) / maximized.width : 0.5;
    const relativeY = maximized.height > 0 ? (cursor.y - maximized.y) / maximized.height : 0.5;

    return {
        x: Math.round(cursor.x - relativeX * restored.width),
        y: Math.round(cursor.y - relativeY * restored.height),
    };
}

/** Cadence at which the window follows the cursor, ~60fps. */
const DRAG_INTERVAL_MS = 16;

/**
 * Upper bound of one gesture. A drag normally ends when the renderer reports
 * its `pointerup`, but a renderer that dies (or reloads) mid-gesture would
 * otherwise leave the window glued to the cursor forever.
 */
const DRAG_TIMEOUT_MS = 30000;

/** The window of the running gesture; undefined while no drag is active. */
let dragWindow: BrowserWindow | undefined;
/** Cursor offset inside the window, captured when the gesture starts. */
let dragOffset: Point = { x: 0, y: 0 };
let dragTimer: ReturnType<typeof setInterval> | undefined;
let dragTimeout: ReturnType<typeof setTimeout> | undefined;

/**
 * Starts (or restarts) the gesture. `window` is a parameter instead of an
 * import of `init.ts`'s `win`, so this module has no opinion about the window's
 * lifecycle and can be unit tested with a plain stub.
 */
export function startWindowDrag(window: BrowserWindow): void {
    stopWindowDrag();

    const cursor = screen.getCursorScreenPoint();
    if (window.isMaximized()) {
        const maximizedBounds = window.getBounds();
        // `unmaximize()` is what restores the size: for a transparent window
        // Electron keeps the pre-maximize bounds and puts them back. Only the
        // position is ours to choose, so the grabbed spot stays under the
        // cursor -- at the old position the window would jump by the difference
        // between the work area and the restored size.
        window.unmaximize();
        const position = restorePositionForCursor(cursor, maximizedBounds, window.getBounds());
        window.setPosition(position.x, position.y);
    }

    const bounds = window.getBounds();
    dragOffset = { x: cursor.x - bounds.x, y: cursor.y - bounds.y };
    dragWindow = window;

    dragTimer = setInterval(moveToCursor, DRAG_INTERVAL_MS);
    dragTimeout = setTimeout(stopWindowDrag, DRAG_TIMEOUT_MS);
}

/** Ends the gesture. Safe to call when none is running (the common case). */
export function stopWindowDrag(): void {
    if (dragTimer) {
        clearInterval(dragTimer);
        dragTimer = undefined;
    }

    if (dragTimeout) {
        clearTimeout(dragTimeout);
        dragTimeout = undefined;
    }

    dragWindow = undefined;
}

function moveToCursor() {
    if (!dragWindow || dragWindow.isDestroyed()) {
        stopWindowDrag();
        return;
    }

    const cursor = screen.getCursorScreenPoint();
    dragWindow.setPosition(cursor.x - dragOffset.x, cursor.y - dragOffset.y);
}
