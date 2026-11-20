import type { WindowAttentionAction, WindowMode } from '../../../shared/windowMode';

/**
 * What a feedback surface may do to the window it is about to open in.
 *
 * The rule is "the more the user has to act on it, the more the window is
 * allowed to come back":
 *
 * - `toast` and ordinary `notice` never move the window -- they are receipts
 *   and status, and interrupting a mini/tray session for them would make those
 *   modes unusable;
 * - `confirm` / `alert` and error notices recover a window that cannot show
 *   them: the mini strip hides `.ant-modal-root` entirely, and a notice does
 *   not fit its 260px minimum width;
 * - a full-screen error page (`ErrorScreen`) recovers every mode but `normal`,
 *   where it only takes focus (a maximized window must not be resized).
 */
export type AttentionKind = 'confirm' | 'error' | 'fullscreen';

/** `WindowAttentionAction` plus the "leave the window alone" answer. */
export type AttentionAction = WindowAttentionAction | 'none';

export interface WindowAttentionFlags {
    inTray: boolean;
    minimize: boolean;
    compact: boolean;
}

/**
 * The shape underneath a tray window: closing to the tray keeps `minimize` and
 * `compact` in the store, so the tray does not lose what it has to go back to.
 */
function underlyingMode(flags: WindowAttentionFlags): WindowMode {
    if (flags.minimize) {
        return 'mini';
    }

    if (flags.compact) {
        return 'compact';
    }

    return 'normal';
}

export function planWindowAttention(
    flags: WindowAttentionFlags,
    kind: AttentionKind
): AttentionAction {
    const base = underlyingMode(flags);

    if (kind === 'fullscreen') {
        // The error page replaces the whole window, so a compact window has to
        // grow for it as well; a normal one already has room and must keep its
        // size (and its maximized state).
        return base === 'normal' ? 'focus' : 'normal';
    }

    if (base === 'mini') {
        return 'normal';
    }

    // Compact can show both dialogs and notices; a tray window can only be
    // seen after it comes back, but it must keep the size it was closed with.
    return flags.inTray ? 'focus' : 'none';
}

/**
 * The window flags of the last `Application` render.
 *
 * Two callers cannot read the store themselves: `AppErrorBoundary` wraps it
 * (and importing the store drags `@redux-devtools/extension`, which is ESM
 * only, into every test that touches the boundary), and the feedback handler
 * must stay usable after the tree has been replaced. `Application` writes this
 * on every render, which is the one place that already derives the mode.
 */
let currentFlags: WindowAttentionFlags = { inTray: false, minimize: false, compact: false };

export function setWindowAttentionFlags(next: WindowAttentionFlags): void {
    currentFlags = next;
}

export function getWindowAttentionFlags(): WindowAttentionFlags {
    return currentFlags;
}

/**
 * The single registration point between the feedback layer (module-level
 * functions, no store) and `Application` (has the store). Set by
 * `FeedbackContextBridge`, cleared when it unmounts -- which is also what
 * makes an `ErrorScreen` take the `fullscreen` path itself instead of going
 * through the feedback layer.
 */
let handler: ((kind: AttentionKind) => void) | undefined;

export function setWindowAttentionHandler(next: typeof handler): void {
    handler = next;
}

export function requestWindowAttention(kind: AttentionKind): void {
    handler?.(kind);
}
