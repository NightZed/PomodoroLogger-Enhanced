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

/** Viewport-relative rect. Works with transformed ancestors (StackGrid) unlike offsetLeft accumulation. */
export const getTargetRectBySelector = (
    selector: string,
    unionChildren: boolean = false
): TargetRect | null => {
    const target = document.querySelector<HTMLElement>(selector);
    if (!target) {
        return null;
    }
    if (unionChildren) {
        // Union of visible element-children. Used when the target itself is a
        // zero-size/overflow container whose visible content lives in
        // absolutely-positioned children (e.g. WorkRestIcon's FadeEffects):
        // the union tightly wraps icon + label instead of the long strip.
        const kids = Array.from(target.children) as HTMLElement[];
        let union: TargetRect | null = null;
        for (const kid of kids) {
            const r = kid.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) {
                continue;
            }
            const cur: TargetRect = { x: r.left, y: r.top, w: r.width, h: r.height };
            union = union ? unionRects(union, cur) : cur;
        }
        return union;
    }
    const rect = target.getBoundingClientRect();
    // Element may exist but be hidden (e.g. inactive TabPane with forceRender=false).
    if (rect.width === 0 && rect.height === 0) {
        return null;
    }
    return { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
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
