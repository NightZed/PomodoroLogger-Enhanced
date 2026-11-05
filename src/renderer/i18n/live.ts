/**
 * Wraps a catalog branch in a live view: every property read is resolved
 * against the current language at that moment.
 *
 * `FEEDBACK_MESSAGES` used to be a plain module level object. Turning it into a
 * function would have changed 38 call sites and the whole-module mock in
 * `Setting.test.tsx`. This proxy keeps the exported shape, the property names
 * and the call syntax identical; only the moment of evaluation moves.
 *
 * Only `get` is implemented -- every existing usage is plain dot access.
 */
export function liveMessages<T extends object>(read: () => T): T {
    const children = new Map<PropertyKey, unknown>();
    const bound = new Map<PropertyKey, (...args: any[]) => string>();

    return new Proxy({} as T, {
        get(_target, prop) {
            const node = read() as any;
            const value = node[prop];

            if (typeof value === 'function') {
                if (!bound.has(prop)) {
                    // `read()` again at call time, so the interpolation runs
                    // against the language active now rather than at bind time.
                    bound.set(prop, (...args: any[]) => (read() as any)[prop](...args));
                }
                return bound.get(prop);
            }

            if (value !== null && typeof value === 'object') {
                if (!children.has(prop)) {
                    children.set(
                        prop,
                        liveMessages(() => (read() as any)[prop])
                    );
                }
                return children.get(prop);
            }

            return value;
        },
    }) as T;
}
