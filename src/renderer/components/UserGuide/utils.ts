export interface TargetRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

const unionRects = (a: TargetRect, b: TargetRect): TargetRect => {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const r = Math.max(a.x + a.w, b.x + b.w);
    const bt = Math.max(a.y + a.h, b.y + b.h);
    return { x, y, w: r - x, h: bt - y };
};

/**
 * Whether an element is rendered and at least partly inside the viewport.
 *
 * An element can exist and still be a bad tour target: an inactive TabPane is
 * `display: none` (0x0 rect) and the Timer sider is shifted off-screen with a
 * negative margin (non-zero rect, left of the window). Both must be skipped.
 */
const isVisibleInViewport = (rect: DOMRect): boolean => {
    if (rect.width === 0 && rect.height === 0) {
        return false;
    }

    return (
        rect.right > 0 &&
        rect.bottom > 0 &&
        rect.left < window.innerWidth &&
        rect.top < window.innerHeight
    );
};

/**
 * The first matching element that is actually visible.
 *
 * The same selector can match more than one mounted view: the Timer page stays
 * mounted (`APP_TABS.forceRender`) and its sider renders the focused list, so
 * the first DOM match of a board selector may be the hidden copy. A plain
 * `querySelector` would measure/click that one.
 */
export const findVisibleTarget = (selector: string): HTMLElement | null => {
    const candidates = document.querySelectorAll<HTMLElement>(selector);
    for (const target of Array.from(candidates)) {
        if (isVisibleInViewport(target.getBoundingClientRect())) {
            return target;
        }
    }

    return null;
};

const unionVisibleChildren = (target: HTMLElement): TargetRect | null => {
    // Union of visible element-children. Used when the target's visible content
    // is spread over stacked children that overlap vertically (e.g.
    // WorkRestIcon's icon and label share one slot): the union covers both
    // layers, whichever of them is currently visible.
    let union: TargetRect | null = null;
    for (const kid of Array.from(target.children) as HTMLElement[]) {
        const r = kid.getBoundingClientRect();
        if (!isVisibleInViewport(r)) {
            continue;
        }
        const cur: TargetRect = { x: r.left, y: r.top, w: r.width, h: r.height };
        union = union ? unionRects(union, cur) : cur;
    }

    return union;
};

/** Viewport-relative rect. Works with transformed ancestors (StackGrid) unlike offsetLeft accumulation. */
export const getTargetRectBySelector = (
    selector: string,
    unionChildren: boolean = false
): TargetRect | null => {
    const candidates = document.querySelectorAll<HTMLElement>(selector);
    for (const target of Array.from(candidates)) {
        if (unionChildren) {
            const union = unionVisibleChildren(target);
            if (union) {
                return union;
            }
            continue;
        }

        const rect = target.getBoundingClientRect();
        if (isVisibleInViewport(rect)) {
            return { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
        }
    }

    return null;
};

export const waitForTargetBySelector = (
    selector: string,
    timeoutMs: number = 8000,
    unionChildren: boolean = false
): Promise<TargetRect> => {
    return new Promise((resolve, reject) => {
        const found = getTargetRectBySelector(selector, unionChildren);
        if (found) {
            resolve(found);
            return;
        }
        const observer = new MutationObserver(() => {
            const r = getTargetRectBySelector(selector, unionChildren);
            if (r) {
                observer.disconnect();
                window.clearTimeout(timer);
                resolve(r);
            }
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
        });
        const timer = window.setTimeout(() => {
            observer.disconnect();
            reject(new Error(`Tour target not found: ${selector}`));
        }, timeoutMs);
    });
};

export const getElementAbsoluteOffsetBySelector = (selector: string) => {
    const rect = getTargetRectBySelector(selector);
    if (rect == null) {
        throw new Error();
    }
    // Keep legacy [x, y, w, h] shape; x/y are now viewport-relative so that
    // `position: fixed` consumers (Pointer) stay correct under transforms.
    return [rect.x, rect.y, rect.w, rect.h];
};
