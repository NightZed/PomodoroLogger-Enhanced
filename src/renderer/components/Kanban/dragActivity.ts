/**
 * True while a drag is running anywhere on the board.
 *
 * Deliberately a mutable module flag instead of React state/context: flipping
 * it re-rendered every mounted card (500 in a long board) at drag start, which
 * was a significant part of the stall this mechanism exists to remove. The
 * only reader is an IntersectionObserver callback, which does not need React to
 * re-render.
 *
 * Cards use it to avoid unregistering while a drag is running: unmounting the
 * source card makes dnd throw `Cannot find draggable entry`.
 */
export const dragActivity = { dragging: false };
