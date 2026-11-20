/**
 * Drag-wide state shared without React: flipping a state/context value
 * re-rendered every mounted card (500 in a long board) at drag start, which was
 * a significant part of the stall the windowed list exists to remove.
 *
 * `dragging` — the list freezes its window while a drag runs (unmounting the
 * source card makes dnd throw `Cannot find draggable entry`), and the card's
 * own pointerleave suppression reads it too.
 *
 * `pointer` / `lastDropAt` — written by the board, read by cards that mount
 * right after a drop so a cross-list drop lights the destination card up
 * without waiting for the mouse to move (see the effects in Card.tsx).
 */
export const dragActivity = {
    dragging: false,

    /**
     * Last pointer position seen by the board, in client coordinates.
     *
     * A card dragged into another list is a new component instance: it never
     * got a `pointerenter`, and the browser only sends one after the pointer
     * moves. Cards that mount right after a drop use this to ask the document
     * whether the pointer is already over them, so the hover highlight does not
     * blink off and back on.
     */
    pointer: null as { x: number; y: number } | null,

    /** `performance.now()` of the last drop, so the check above only runs then. */
    lastDropAt: 0,

    /**
     * Clears the flag after a drag that never reached `onDragEnd`.
     *
     * Hiding the board's pane mid-drag (a page switch, the mini window, the
     * tray) takes the drop target away from dnd: its `onDragEnd` never runs, so
     * the `pointer-events: none` styles it injects for the drag stay on every
     * card and the board reads as un-draggable once it is back on screen.
     * `Kanban` calls this before remounting the board for exactly that case.
     */
    reset() {
        this.dragging = false;
    },
};
