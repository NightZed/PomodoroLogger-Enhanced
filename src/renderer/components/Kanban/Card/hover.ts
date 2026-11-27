/**
 * The card's hover highlight is driven by React state, not `:hover` (dnd moves
 * the card under the pointer during the drop animation, and the browser drops
 * `:hover` for those ~100ms). The state is fed by three decisions that do not
 * need a real layout to test:
 *
 *  - is the pointer inside the card's box (pointermove while lit);
 *  - is the card (or one of its descendants) in the hit-test stack after a
 *    drop / when the card mounts;
 *  - is this still the short window right after a drop, where those checks
 *    make sense at all.
 *
 * `elementsFromPoint` behaves differently from the browser's own hover chain
 * during the drop animation, which is exactly why Card asks the document.
 */
export const POST_DROP_CHECK_MS = 500;

export interface CardRect {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

/** Inclusive on the edges, matching the old inline comparison. */
export const isPointerInside = (rect: CardRect, x: number, y: number): boolean =>
    x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;

/**
 * `elementsFromPoint`, not `elementFromPoint`: during the drop animation dnd's
 * fixed-position clone can still sit on top of the pointer and hide the card
 * underneath.
 */
export const isElementUnderPointer = (element: Element, stack: readonly Element[]): boolean =>
    stack.some((node) => node === element || element.contains(node));

/** Whether `now` is still close enough to the last drop to run a hit-test. */
export const isPostDropCheck = (now: number, lastDropAt: number): boolean =>
    now - lastDropAt <= POST_DROP_CHECK_MS;
