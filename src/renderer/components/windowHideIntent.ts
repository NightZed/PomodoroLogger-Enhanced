/**
 * Closing the window has to drop the page content BEFORE the window hides.
 *
 * Windows keeps the last composited frame of a window and shows it again for a
 * moment when the window is restored, and Chromium stops painting once the
 * window is hidden. So anything the page drops only after the close has already
 * happened is too late to reach that frame -- "today's statistics" flashes back
 * on every restore.
 *
 * `requestClose` therefore announces the intent, lets one frame paint (two
 * `requestAnimationFrame`s: the first one's paint has completed before the
 * second callback runs), and only then asks the main process to close. The
 * window is still fully visible during that time, so the painted frame becomes
 * the one the system keeps.
 *
 * A separate module-level registry rather than props: the listeners live in
 * `Timer` (the panel belongs to that page), while the close is triggered by
 * `WindowControls` and by the main process (`Alt+F4`), neither of which has
 * access to the page's local state.
 *
 * A plain minimize does NOT go through any of this: it leaves the page exactly
 * as it was, and the same frame that was painted before comes back.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

/** Registers content that has to be dropped before the window is closed. */
export function subscribeWindowHideIntent(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/** Runs every registered listener. Called synchronously, before the IPC. */
export function announceWindowHideIntent(): void {
    for (const listener of listeners) {
        listener();
    }
}

/**
 * The one way to close the window: ask the page to drop what it only keeps for
 * the screen, let it paint, then hand the window over.
 */
export function requestClose(): void {
    announceWindowHideIntent();
    requestAnimationFrame(() => {
        requestAnimationFrame(() => window.api.windowAction('close'));
    });
}
